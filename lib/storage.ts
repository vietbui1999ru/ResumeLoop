import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import fs from 'fs'
import { isCloud } from './app-mode'

const S3_PREFIX = 's3:'

// Lazy singleton — only instantiated if APP_MODE=cloud
let _s3: S3Client | null = null
function s3(): S3Client {
  if (!_s3) _s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' })
  return _s3
}

function bucket(): string {
  const b = process.env.S3_BUCKET
  if (!b) throw new Error('S3_BUCKET env var not set')
  return b
}

// Returns: S3 key with 's3:' prefix (cloud) or original local path (local)
export async function saveOutput(localPath: string, s3Key: string): Promise<string> {
  if (!isCloud()) return localPath
  const body = fs.readFileSync(localPath)
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: s3Key, Body: body }))
  try { fs.unlinkSync(localPath) } catch { /* non-fatal cleanup */ }
  return `${S3_PREFIX}${s3Key}`
}

// Returns presigned URL for an S3 key, or null for local paths
export async function getPresignedUrl(pathOrKey: string, expiresIn = 3600): Promise<string | null> {
  if (!pathOrKey.startsWith(S3_PREFIX)) return null
  const key = pathOrKey.slice(S3_PREFIX.length)
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn })
}

export function isS3Key(pathOrKey: string): boolean {
  return pathOrKey.startsWith(S3_PREFIX)
}
// Delete all S3 objects under outputs/<userId>/ — called on account hard-delete.
// No-op in local mode. Non-fatal per-object errors are swallowed; any S3 error is re-thrown.
export async function deleteUserOutputs(userId: string): Promise<void> {
  if (!isCloud()) return
  const b      = bucket()
  const client = s3()
  const prefix = `outputs/${userId}/`

  let continuationToken: string | undefined
  do {
    const list = await client.send(new ListObjectsV2Command({
      Bucket:            b,
      Prefix:            prefix,
      ContinuationToken: continuationToken,
    }))

    const keys = (list.Contents ?? []).map(o => ({ Key: o.Key! })).filter(o => o.Key)
    if (keys.length > 0) {
      await client.send(new DeleteObjectsCommand({
        Bucket: b,
        Delete: { Objects: keys, Quiet: true },
      }))
    }

    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined
  } while (continuationToken)
}
