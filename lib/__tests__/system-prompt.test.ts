import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from '../db'
import { SqliteAdapter } from '../db-adapter'

// Build an isolated in-memory DB with the full schema (including system_prompts)
function makeDb() {
  const db = new Database(':memory:')
  initSchema(db)
  return db
}

function makeAdapter(db: ReturnType<typeof makeDb>) {
  return new SqliteAdapter(db)
}

// Use REPLACE to overwrite any rows seeded from disk during initSchema
function seedPrompts(adapter: SqliteAdapter) {
  return Promise.all([
    adapter.run(
      `INSERT OR REPLACE INTO system_prompts (id, prompt_key, version, content, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      ['sp-reason', 'reason', 1, 'REASON PROMPT CONTENT', 1],
    ),
    adapter.run(
      `INSERT OR REPLACE INTO system_prompts (id, prompt_key, version, content, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      ['sp-cover-letter', 'cover-letter', 1, 'COVER LETTER PROMPT CONTENT', 1],
    ),
    adapter.run(
      `INSERT OR REPLACE INTO system_prompts (id, prompt_key, version, content, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      ['sp-chat', 'chat', 1, 'CHAT PROMPT CONTENT', 1],
    ),
  ])
}

describe('system_prompts table — schema', () => {
  it('table exists after initSchema', () => {
    const db = makeDb()
    const row = db
      .prepare(`SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='system_prompts'`)
      .get() as { c: number }
    expect(row.c).toBe(1)
  })

  it('has required columns', () => {
    const db = makeDb()
    const cols = db
      .prepare(`SELECT name FROM pragma_table_info('system_prompts')`)
      .all() as { name: string }[]
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('prompt_key')
    expect(names).toContain('version')
    expect(names).toContain('content')
    expect(names).toContain('is_active')
  })

  it('enforces unique (prompt_key, version)', async () => {
    const adapter = makeAdapter(makeDb())
    // Use a key that won't conflict with disk-seeded rows (reason/chat/cover-letter)
    await adapter.run(
      `INSERT INTO system_prompts (id, prompt_key, version, content) VALUES (?, ?, ?, ?)`,
      ['id1', 'test-key', 1, 'content1'],
    )
    await expect(
      adapter.run(
        `INSERT INTO system_prompts (id, prompt_key, version, content) VALUES (?, ?, ?, ?)`,
        ['id2', 'test-key', 1, 'content2'],
      ),
    ).rejects.toThrow()
  })
})

describe('getSystemPrompt — DB reads', () => {
  let adapter: SqliteAdapter

  beforeEach(async () => {
    adapter = makeAdapter(makeDb())
    await seedPrompts(adapter)
  })

  it('returns content for reason key', async () => {
    const row = await adapter.queryOne<{ content: string }>(
      `SELECT content FROM system_prompts WHERE prompt_key = ? AND is_active = 1 ORDER BY version DESC LIMIT 1`,
      ['reason'],
    )
    expect(row?.content).toBe('REASON PROMPT CONTENT')
  })

  it('returns content for cover-letter key', async () => {
    const row = await adapter.queryOne<{ content: string }>(
      `SELECT content FROM system_prompts WHERE prompt_key = ? AND is_active = 1 ORDER BY version DESC LIMIT 1`,
      ['cover-letter'],
    )
    expect(row?.content).toBe('COVER LETTER PROMPT CONTENT')
  })

  it('returns content for chat key', async () => {
    const row = await adapter.queryOne<{ content: string }>(
      `SELECT content FROM system_prompts WHERE prompt_key = ? AND is_active = 1 ORDER BY version DESC LIMIT 1`,
      ['chat'],
    )
    expect(row?.content).toBe('CHAT PROMPT CONTENT')
  })

  it('returns undefined for nonexistent key', async () => {
    const row = await adapter.queryOne<{ content: string }>(
      `SELECT content FROM system_prompts WHERE prompt_key = ? AND is_active = 1 ORDER BY version DESC LIMIT 1`,
      ['nonexistent'],
    )
    expect(row).toBeUndefined()
  })

  it('returns highest version when multiple versions exist', async () => {
    await adapter.run(
      `INSERT INTO system_prompts (id, prompt_key, version, content, is_active) VALUES (?, ?, ?, ?, ?)`,
      ['sp-reason-v2', 'reason', 2, 'REASON PROMPT V2', 1],
    )
    const row = await adapter.queryOne<{ content: string }>(
      `SELECT content FROM system_prompts WHERE prompt_key = ? AND is_active = 1 ORDER BY version DESC LIMIT 1`,
      ['reason'],
    )
    expect(row?.content).toBe('REASON PROMPT V2')
  })

  it('skips inactive rows', async () => {
    await adapter.run(
      `INSERT INTO system_prompts (id, prompt_key, version, content, is_active) VALUES (?, ?, ?, ?, ?)`,
      ['sp-chat-v2', 'chat', 2, 'INACTIVE CONTENT', 0],
    )
    const row = await adapter.queryOne<{ content: string }>(
      `SELECT content FROM system_prompts WHERE prompt_key = ? AND is_active = 1 ORDER BY version DESC LIMIT 1`,
      ['chat'],
    )
    expect(row?.content).toBe('CHAT PROMPT CONTENT')
  })
})
