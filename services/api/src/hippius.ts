import { STORAGE_RETENTION_DAYS } from './storage-policy.js';
import { createHash } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { Config } from './config.js';
import type { JobExecutor } from './providers.js';
import { ApiFailure } from './errors.js';

const limit = 256 * 1024;
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export function createHippiusStorage(config: Config, client = new S3Client({
  endpoint: 'https://s3.hippius.com', region: 'decentralized', forcePathStyle: true,
  credentials: { accessKeyId: config.hippiusAccessKey ?? '', secretAccessKey: config.hippiusSecretKey ?? '' },
  maxAttempts: 2,
})) {
  const location = (id: string) => {
    if (!config.hippiusBucket || !config.hippiusAccessKey || !config.hippiusSecretKey) throw new ApiFailure('provider_unavailable', 'Hippius storage is not configured.', 503);
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiFailure('invalid_job', 'Storage requires a persisted job.', 500);
    return { Bucket: config.hippiusBucket, Key: `subswarm/${id}` };
  };
  const execute: JobExecutor = async (input, context) => {
    if (!context) throw new ApiFailure('job_context_required', 'Storage requires a persisted job.', 500);
    const object = location(context.jobId);
    const bytes = Buffer.from(input.fileBase64 ?? '', 'base64');
    if (!bytes.length || bytes.length > limit || bytes.toString('base64') !== input.fileBase64 || !input.fileName || !/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,119}$/.test(input.fileName)) throw new ApiFailure('invalid_file', 'Choose a file of at most 256 KiB with a simple filename.', 422);
    const sha256 = digest(bytes);
    let versionId: string | undefined;
    try {
      const stored = await client.send(new PutObjectCommand({ ...object, Body: bytes, ContentType: 'application/octet-stream', Metadata: { sha256 } }), { abortSignal: AbortSignal.timeout(30_000) });
      versionId = stored.VersionId;
    } catch { throw new ApiFailure('storage_upload_failed', 'The upload could not be confirmed. Retry after checking storage access and credit.', 502); }
    const expiresAt = new Date(Date.now() + STORAGE_RETENTION_DAYS * 86400000).toISOString();
    return { title: input.fileName, text: `${input.fileName} stored privately (${bytes.length} bytes).`, storageSha256: sha256, storageVersionId: versionId, storageExpiresAt: expiresAt,
      blocks: [{ type: 'stored-file', name: input.fileName, bytes: bytes.length, sha256, jobId: context.jobId, expiresAt }] };
  };
  async function download(id: string, name: string, sha256: string, versionId?: string): Promise<Response> {
    try {
      const result = await client.send(new GetObjectCommand({ ...location(id), VersionId: versionId }), { abortSignal: AbortSignal.timeout(30_000) });
      if (!result.Body) throw new Error('Missing object');
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
        size += chunk.length;
        if (size > limit) throw new Error('Oversized object');
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (digest(bytes) !== sha256) throw new Error('Object integrity mismatch');
      const filename = name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120);
      return new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${filename}"`, 'Content-Length': String(bytes.length), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure('storage_download_failed', 'The stored file could not be retrieved and verified.', 502);
    }
  }
  async function remove(id: string, versionId?: string) {
    try { await client.send(new DeleteObjectCommand({ ...location(id), VersionId: versionId }), { abortSignal: AbortSignal.timeout(30_000) }); }
    catch (error) { if (error instanceof ApiFailure) throw error; throw new ApiFailure('storage_delete_failed', 'File deletion could not be confirmed. You can retry safely.', 502); }
  }
  return { execute, download, remove };
}
