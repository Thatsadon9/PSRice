import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

type CleanupJob = {
  id: string;
  bucket_id: string;
  object_path: string;
  source_kind: 'attendance_photo' | 'task_proof';
  source_id: string;
  attempts: number;
};

function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

async function markJobsFailed(jobIds: string[], error: unknown) {
  if (!supabaseAdmin || jobIds.length === 0) return;

  const message = error instanceof Error ? error.message : String(error);
  const { error: updateError } = await supabaseAdmin
    .from('storage_cleanup_jobs')
    .update({
      status: 'failed',
      last_error: message.slice(0, 1_000),
      updated_at: new Date().toISOString(),
    })
    .in('id', jobIds);

  if (updateError) {
    console.error('[storage-cleanup] Failed to record cleanup error:', updateError.message);
  }
}

async function clearDatabaseReferences(jobs: CleanupJob[]) {
  if (!supabaseAdmin) return;

  const attendanceIds = jobs
    .filter((job) => job.source_kind === 'attendance_photo')
    .map((job) => job.source_id);
  const taskProofIds = jobs
    .filter((job) => job.source_kind === 'task_proof')
    .map((job) => job.source_id);

  if (attendanceIds.length > 0) {
    const { error } = await supabaseAdmin
      .from('attendance_records')
      .update({ photo_url: null })
      .in('id', attendanceIds);

    if (error) throw error;
  }

  if (taskProofIds.length > 0) {
    const { error } = await supabaseAdmin
      .from('submission_files')
      .delete()
      .in('id', taskProofIds);

    if (error) throw error;
  }
}

async function cleanupClaimedJobs(jobs: CleanupJob[]) {
  if (!supabaseAdmin || jobs.length === 0) {
    return { deleted: 0, failed: 0 };
  }

  const jobsByBucket = new Map<string, CleanupJob[]>();

  for (const job of jobs) {
    const bucketJobs = jobsByBucket.get(job.bucket_id) || [];
    bucketJobs.push(job);
    jobsByBucket.set(job.bucket_id, bucketJobs);
  }

  let deleted = 0;
  let failed = 0;

  for (const [bucket, bucketJobs] of jobsByBucket) {
    const jobIds = bucketJobs.map((job) => job.id);

    try {
      if (bucket !== 'proofs') {
        throw new Error(`Unsupported cleanup bucket: ${bucket}`);
      }

      const { error: storageError } = await supabaseAdmin.storage
        .from(bucket)
        .remove(bucketJobs.map((job) => job.object_path));

      if (storageError) throw storageError;

      await clearDatabaseReferences(bucketJobs);

      const { error: completionError } = await supabaseAdmin
        .from('storage_cleanup_jobs')
        .update({
          status: 'deleted',
          deleted_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .in('id', jobIds);

      if (completionError) throw completionError;
      deleted += bucketJobs.length;
    } catch (error) {
      console.error(`[storage-cleanup] Bucket ${bucket} failed:`, error);
      await markJobsFailed(jobIds, error);
      failed += bucketJobs.length;
    }
  }

  return { deleted, failed };
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error('[storage-cleanup] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 500 });
  }

  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin client is not configured' }, { status: 500 });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('claim_storage_cleanup_jobs', {
      p_limit: 500,
    });

    if (error) throw error;

    const jobs = (data || []) as CleanupJob[];
    const result = await cleanupClaimedJobs(jobs);

    return NextResponse.json({
      claimed: jobs.length,
      deleted: result.deleted,
      failed: result.failed,
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[storage-cleanup] Cleanup run failed:', error);
    return NextResponse.json(
      { error: 'Storage cleanup failed' },
      { status: 500 },
    );
  }
}
