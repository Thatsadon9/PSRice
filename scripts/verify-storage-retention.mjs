import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const attendanceId = randomUUID();
const submissionId = randomUUID();
const fileId = randomUUID();
const externalFileId = randomUUID();
const anchor = new Date();

function assertWithinOneSecond(actual, expected, label) {
  const difference = Math.abs(new Date(actual).getTime() - expected.getTime());
  assert.ok(difference <= 1_000, `${label}: expected ${expected.toISOString()}, received ${actual}`);
}

async function requireData(request, label) {
  const { data, error } = await request;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function cleanup() {
  await supabase.from('submission_files').delete().eq('id', fileId);
  await supabase.from('submission_files').delete().eq('id', externalFileId);
  await supabase.from('task_submissions').delete().eq('id', submissionId);
  await supabase.from('attendance_records').delete().eq('id', attendanceId);
  await supabase.from('storage_cleanup_jobs').delete().in('source_id', [attendanceId, fileId]);
}

try {
  const attendance = await requireData(
    supabase
      .from('attendance_records')
      .select('user_id, branch_id, type, status')
      .limit(1)
      .single(),
    'read attendance fixture',
  );

  await requireData(
    supabase.from('attendance_records').insert({
      id: attendanceId,
      user_id: attendance.user_id,
      branch_id: attendance.branch_id,
      type: attendance.type,
      photo_url: `${supabaseUrl}/storage/v1/object/public/proofs/retention-test/attendance.jpg`,
      status: attendance.status,
      created_at: anchor.toISOString(),
    }),
    'insert attendance fixture',
  );

  const attendanceJob = await requireData(
    supabase
      .from('storage_cleanup_jobs')
      .select('expires_at, retention_days, status')
      .eq('source_kind', 'attendance_photo')
      .eq('source_id', attendanceId)
      .single(),
    'read attendance cleanup job',
  );

  assert.equal(attendanceJob.retention_days, 30);
  assert.equal(attendanceJob.status, 'pending');
  assertWithinOneSecond(
    attendanceJob.expires_at,
    new Date(anchor.getTime() + 30 * 24 * 60 * 60 * 1_000),
    'attendance expiry',
  );

  const existingSubmission = await requireData(
    supabase
      .from('task_submissions')
      .select('task_id, submitted_by')
      .limit(1)
      .single(),
    'read task submission fixture',
  );

  await requireData(
    supabase.from('task_submissions').insert({
      id: submissionId,
      task_id: existingSubmission.task_id,
      submitted_by: existingSubmission.submitted_by,
      note: 'storage retention verification',
      submitted_at: anchor.toISOString(),
      review_status: 'pending',
    }),
    'insert task submission fixture',
  );

  await requireData(
    supabase.from('submission_files').insert({
      id: fileId,
      submission_id: submissionId,
      file_url: `${supabaseUrl}/storage/v1/object/public/proofs/retention-test/task-proof.webp`,
      file_type: 'image',
    }),
    'insert task proof fixture',
  );

  const pendingJob = await requireData(
    supabase
      .from('storage_cleanup_jobs')
      .select('expires_at, retention_days, status')
      .eq('source_kind', 'task_proof')
      .eq('source_id', fileId)
      .single(),
    'read pending task cleanup job',
  );

  assert.equal(pendingJob.retention_days, 5);
  assert.equal(pendingJob.status, 'pending');
  assert.equal(pendingJob.expires_at, null);

  await requireData(
    supabase.from('submission_files').insert({
      id: externalFileId,
      submission_id: submissionId,
      file_url: 'https://example.com/storage/v1/object/public/proofs/private/object.webp',
      file_type: 'image',
    }),
    'insert external task proof fixture',
  );

  const { count: externalJobCount, error: externalJobError } = await supabase
    .from('storage_cleanup_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('source_kind', 'task_proof')
    .eq('source_id', externalFileId);

  if (externalJobError) {
    throw new Error(`check external proof queue isolation: ${externalJobError.message}`);
  }
  assert.equal(externalJobCount, 0);

  await requireData(
    supabase
      .from('task_submissions')
      .update({ review_status: 'approved', reviewed_at: anchor.toISOString() })
      .eq('id', submissionId),
    'review task submission fixture',
  );

  const reviewedJob = await requireData(
    supabase
      .from('storage_cleanup_jobs')
      .select('expires_at, retention_days, status')
      .eq('source_kind', 'task_proof')
      .eq('source_id', fileId)
      .single(),
    'read reviewed task cleanup job',
  );

  assert.equal(reviewedJob.retention_days, 5);
  assert.equal(reviewedJob.status, 'pending');
  assertWithinOneSecond(
    reviewedJob.expires_at,
    new Date(anchor.getTime() + 5 * 24 * 60 * 60 * 1_000),
    'task proof expiry',
  );

  console.log('Storage retention verification passed (attendance=30d, task-proof=5d-after-review, external URLs isolated).');
} finally {
  await cleanup();
}
