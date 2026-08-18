import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const cronSecret = process.env.CRON_SECRET;
const cleanupEndpoint = process.env.CLEANUP_ENDPOINT;
const vercelScope = process.env.VERCEL_SCOPE;
const execFileAsync = promisify(execFile);

if (!supabaseUrl || !serviceRoleKey || !cronSecret || !cleanupEndpoint) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET and CLEANUP_ENDPOINT are required',
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sourceId = randomUUID();
const objectPath = `retention-test/${sourceId}.png`;
let jobId = null;

// A valid transparent 1x1 PNG.
const testImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function cleanup() {
  await supabase.storage.from('proofs').remove([objectPath]);
  if (jobId) {
    await supabase.from('storage_cleanup_jobs').delete().eq('id', jobId);
  }
}

async function callCleanupEndpoint(authorization) {
  if (process.env.DIRECT_FETCH === 'true') {
    const response = await fetch(cleanupEndpoint, {
      headers: authorization ? { Authorization: authorization } : undefined,
    });
    const body = await response.text();

    return {
      status: response.status,
      body,
      json: body ? JSON.parse(body) : null,
    };
  }

  const endpoint = new URL(cleanupEndpoint);
  const curlArgs = [
    'vercel',
    'curl',
    endpoint.pathname,
    '--deployment',
    endpoint.origin,
  ];

  if (vercelScope) {
    curlArgs.push('--scope', vercelScope);
  }

  curlArgs.push('--', '--silent', '--show-error', '--write-out', '\n%{http_code}');

  if (authorization) {
    curlArgs.push('--header', `Authorization: ${authorization}`);
  }

  const { stdout } = await execFileAsync('npx', curlArgs, { maxBuffer: 1_000_000 });
  const lines = stdout.trimEnd().split('\n');
  const status = Number(lines.pop());
  const body = lines.join('\n');

  return {
    status,
    body,
    json: body ? JSON.parse(body) : null,
  };
}

try {
  const unauthorizedResponse = await callCleanupEndpoint(null);
  assert.equal(unauthorizedResponse.status, 401, 'cleanup endpoint must reject missing cron secret');

  const { error: uploadError } = await supabase.storage
    .from('proofs')
    .upload(objectPath, testImage, {
      contentType: 'image/png',
      upsert: false,
    });
  if (uploadError) throw new Error(`upload cleanup fixture: ${uploadError.message}`);

  const { data: job, error: jobError } = await supabase
    .from('storage_cleanup_jobs')
    .insert({
      bucket_id: 'proofs',
      object_path: objectPath,
      source_kind: 'attendance_photo',
      source_id: sourceId,
      retention_days: 30,
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      status: 'pending',
    })
    .select('id')
    .single();

  if (jobError) throw new Error(`insert cleanup fixture: ${jobError.message}`);
  jobId = job.id;

  const response = await callCleanupEndpoint(`Bearer ${cronSecret}`);
  const result = response.json;

  assert.equal(response.status, 200, JSON.stringify(result));
  assert.ok(result.claimed >= 1, `expected at least one claimed job: ${JSON.stringify(result)}`);
  assert.ok(result.deleted >= 1, `expected at least one deleted job: ${JSON.stringify(result)}`);
  assert.equal(result.failed, 0, JSON.stringify(result));

  const { data: completedJob, error: completedJobError } = await supabase
    .from('storage_cleanup_jobs')
    .select('status, deleted_at, last_error')
    .eq('id', jobId)
    .single();

  if (completedJobError) throw new Error(`read completed cleanup job: ${completedJobError.message}`);
  assert.equal(completedJob.status, 'deleted');
  assert.ok(completedJob.deleted_at);
  assert.equal(completedJob.last_error, null);

  const { error: downloadError } = await supabase.storage.from('proofs').download(objectPath);
  assert.ok(downloadError, 'cleanup fixture should no longer exist in Storage');

  console.log(`Storage cleanup endpoint verification passed (${JSON.stringify(result)}).`);
} finally {
  await cleanup();
}
