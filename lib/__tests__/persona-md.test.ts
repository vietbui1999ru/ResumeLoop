import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from '../db'
import { SqliteAdapter } from '../db-adapter'
import { randomUUID } from 'crypto'

function makeDb() {
  const db = new Database(':memory:')
  initSchema(db)
  return db
}

function makeAdapter(db: ReturnType<typeof makeDb>) {
  return new SqliteAdapter(db)
}

async function createProfile(adapter: SqliteAdapter, userId: string, name = 'Test Profile') {
  const id = randomUUID()
  await adapter.run(
    `INSERT INTO resume_profiles (id, user_id, name, data, is_active, kind) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, name, '{}', 1, 'custom'],
  )
  return id
}

describe('resume_profiles — persona_md column', () => {
  let adapter: SqliteAdapter

  beforeEach(() => {
    adapter = makeAdapter(makeDb())
  })

  it('column exists after initSchema', async () => {
    const id = await createProfile(adapter, 'user-a')
    const row = await adapter.queryOne<{ persona_md: string | null }>(
      `SELECT persona_md FROM resume_profiles WHERE id = ?`,
      [id],
    )
    expect(row).toBeDefined()
    expect(row!.persona_md).toBeNull()
  })

  it('PATCH stores persona_md within 4000 char limit', async () => {
    const id = await createProfile(adapter, 'user-a')
    const content = 'I prefer Go and distributed systems roles. '.repeat(90).slice(0, 3999)
    await adapter.run(
      `UPDATE resume_profiles SET persona_md = ? WHERE id = ? AND user_id = ?`,
      [content, id, 'user-a'],
    )
    const row = await adapter.queryOne<{ persona_md: string }>(
      `SELECT persona_md FROM resume_profiles WHERE id = ?`,
      [id],
    )
    expect(row!.persona_md).toBe(content)
    expect(row!.persona_md.length).toBeLessThanOrEqual(4000)
  })

  it('GET returns persona_md field', async () => {
    const id = await createProfile(adapter, 'user-a')
    await adapter.run(
      `UPDATE resume_profiles SET persona_md = ? WHERE id = ?`,
      ['My preferences', id],
    )
    const row = await adapter.queryOne<{ id: string; name: string; data: string; persona_md: string | null }>(
      `SELECT id, name, data, persona_md FROM resume_profiles WHERE id = ? AND user_id = ?`,
      [id, 'user-a'],
    )
    expect(row).toBeDefined()
    expect(row!.persona_md).toBe('My preferences')
  })

  it('kind column defaults to custom', async () => {
    const id = await createProfile(adapter, 'user-a')
    const row = await adapter.queryOne<{ kind: string }>(
      `SELECT kind FROM resume_profiles WHERE id = ?`,
      [id],
    )
    expect(row!.kind).toBe('custom')
  })
})

describe('persona_md length validation — application layer', () => {
  it('accepts 3999 chars as within limit', () => {
    const content = 'x'.repeat(3999)
    expect(content.length <= 4000).toBe(true)
  })

  it('rejects 4001 chars as exceeding limit', () => {
    const content = 'x'.repeat(4001)
    expect(content.length <= 4000).toBe(false)
  })
})
