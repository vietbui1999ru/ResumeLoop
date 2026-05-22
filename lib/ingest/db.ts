import { randomUUID } from 'crypto'
import { getAdapter } from '../db-adapter'
import type {
  IngestionSource, IngestionSourceRow,
  IngestionSourceType, IngestionSourceStatus, SparseProfile,
} from './types'

function rowToSource(row: IngestionSourceRow): IngestionSource {
  let extractedPartial: SparseProfile | null = null
  if (row.extracted_partial) {
    try { extractedPartial = JSON.parse(row.extracted_partial) as SparseProfile }
    catch { extractedPartial = null }
  }
  return {
    id:               row.id,
    userId:           row.user_id,
    type:             row.type,
    inputRaw:         row.input_raw,
    status:           row.status,
    extractedPartial,
    errorMsg:         row.error_msg,
    createdAt:        row.created_at,
  }
}

export async function createIngestionSource(
  userId: string, type: IngestionSourceType, inputRaw: string
): Promise<IngestionSource> {
  const db = await getAdapter()
  const id = randomUUID()
  await db.run(
    `INSERT INTO ingestion_sources (id, user_id, type, input_raw, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [id, userId, type, inputRaw],
  )
  const row = await db.queryOne<IngestionSourceRow>(
    `SELECT * FROM ingestion_sources WHERE id = ?`, [id],
  )
  return rowToSource(row!)
}

export async function updateIngestionSource(
  id: string, userId: string,
  updates: {
    status:            IngestionSourceStatus
    extractedPartial?: SparseProfile | null
    errorMsg?:         string | null
  },
): Promise<void> {
  const db = await getAdapter()
  // Only include extracted_partial in UPDATE when explicitly provided — avoid overwriting with NULL
  if (updates.extractedPartial !== undefined) {
    await db.run(
      `UPDATE ingestion_sources SET status = ?, extracted_partial = ?, error_msg = ? WHERE id = ? AND user_id = ?`,
      [updates.status, JSON.stringify(updates.extractedPartial), updates.errorMsg ?? null, id, userId],
    )
  } else {
    await db.run(
      `UPDATE ingestion_sources SET status = ?, error_msg = ? WHERE id = ? AND user_id = ?`,
      [updates.status, updates.errorMsg ?? null, id, userId],
    )
  }
}

export async function getIngestionSource(
  id: string, userId: string
): Promise<IngestionSource | null> {
  const db = await getAdapter()
  const row = await db.queryOne<IngestionSourceRow>(
    `SELECT * FROM ingestion_sources WHERE id = ? AND user_id = ?`, [id, userId],
  )
  return row ? rowToSource(row) : null
}

export async function listIngestionSources(userId: string): Promise<IngestionSource[]> {
  const db = await getAdapter()
  const rows = await db.query<IngestionSourceRow>(
    `SELECT * FROM ingestion_sources WHERE user_id = ? ORDER BY created_at DESC`,
    [userId],
  )
  return rows.map(rowToSource)
}

export async function deleteIngestionSource(
  id: string, userId: string
): Promise<boolean> {
  const db = await getAdapter()
  const existing = await db.queryOne<{ id: string }>(
    `SELECT id FROM ingestion_sources WHERE id = ? AND user_id = ?`, [id, userId],
  )
  if (!existing) return false
  await db.run(
    `DELETE FROM ingestion_sources WHERE id = ? AND user_id = ?`, [id, userId],
  )
  return true
}
