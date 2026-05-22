import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from '../db'

let mockDb: ReturnType<typeof Database>

vi.mock('../db-adapter', () => ({
  getAdapter: vi.fn().mockImplementation(async () => ({
    query:    async (sql: string, p: unknown[] = []) => mockDb.prepare(sql).all(...p),
    queryOne: async (sql: string, p: unknown[] = []) => mockDb.prepare(sql).get(...p) ?? null,
    run:      async (sql: string, p: unknown[] = []) => { mockDb.prepare(sql).run(...p) },
    runInTransaction: async (ops: Array<{ sql: string; params?: unknown[] }>) => {
      const txn = mockDb.transaction(() => {
        for (const { sql, params = [] } of ops) {
          mockDb.prepare(sql).run(...params)
        }
      })
      txn()
    },
  })),
}))

beforeEach(() => {
  vi.resetModules()
  mockDb = new Database(':memory:')
  initSchema(mockDb)
})

describe('createIngestionSource', () => {
  it('inserts a pending row and returns it', async () => {
    const { createIngestionSource } = await import('./db')
    const src = await createIngestionSource('user-1', 'paste', 'hello world')
    expect(src.userId).toBe('user-1')
    expect(src.type).toBe('paste')
    expect(src.inputRaw).toBe('hello world')
    expect(src.status).toBe('pending')
    expect(src.extractedPartial).toBeNull()
  })
})

describe('updateIngestionSource', () => {
  it('marks source as done with a partial', async () => {
    const { createIngestionSource, updateIngestionSource, getIngestionSource } = await import('./db')
    const src = await createIngestionSource('user-1', 'paste', 'text')
    const partial = { contact: { name: 'Jane' } }
    await updateIngestionSource(src.id, 'user-1', { status: 'done', extractedPartial: partial })
    const updated = await getIngestionSource(src.id, 'user-1')
    expect(updated?.status).toBe('done')
    expect(updated?.extractedPartial?.contact?.name).toBe('Jane')
  })
})

describe('listIngestionSources', () => {
  it('returns only sources for the given user', async () => {
    const { createIngestionSource, listIngestionSources } = await import('./db')
    await createIngestionSource('user-1', 'url', 'https://example.com')
    await createIngestionSource('user-2', 'paste', 'other')
    const list = await listIngestionSources('user-1')
    expect(list).toHaveLength(1)
    expect(list[0].type).toBe('url')
  })
})

describe('deleteIngestionSource', () => {
  it('removes the row; returns false if not found', async () => {
    const { createIngestionSource, deleteIngestionSource, getIngestionSource } = await import('./db')
    const src = await createIngestionSource('user-1', 'github', 'https://github.com/foo')
    expect(await deleteIngestionSource(src.id, 'user-1')).toBe(true)
    expect(await getIngestionSource(src.id, 'user-1')).toBeNull()
    expect(await deleteIngestionSource(src.id, 'user-1')).toBe(false)
  })
})
