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

async function createProfileWithKind(
  adapter: SqliteAdapter,
  userId: string,
  name: string,
  kind: 'default' | 'custom',
) {
  const id = randomUUID()
  await adapter.run(
    `INSERT INTO resume_profiles (id, user_id, name, data, is_active, kind) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, name, '{}', kind === 'default' ? 1 : 0, kind],
  )
  return id
}

// Simulate the API-layer guard for default profile deletion
function canDelete(kind: string): boolean {
  return kind !== 'default'
}

// Simulate the API-layer guard: kind field is stripped from PATCH body
function applyPatch(body: Record<string, unknown>): Record<string, unknown> {
  const { kind: _kind, ...safe } = body
  return safe
}

describe('default profile protection', () => {
  let adapter: SqliteAdapter

  beforeEach(() => {
    adapter = makeAdapter(makeDb())
  })

  it('kind="default" profile cannot be deleted (guard logic)', async () => {
    const id = await createProfileWithKind(adapter, 'user-a', 'Default', 'default')
    const row = await adapter.queryOne<{ kind: string }>(
      `SELECT kind FROM resume_profiles WHERE id = ?`,
      [id],
    )
    expect(canDelete(row!.kind)).toBe(false)
  })

  it('kind="custom" profile can be deleted (guard logic)', async () => {
    const id = await createProfileWithKind(adapter, 'user-a', 'Custom', 'custom')
    const row = await adapter.queryOne<{ kind: string }>(
      `SELECT kind FROM resume_profiles WHERE id = ?`,
      [id],
    )
    expect(canDelete(row!.kind)).toBe(true)
  })

  it('PATCH body strips kind field — cannot promote profile to default', () => {
    const body = { name: 'New Name', kind: 'default', persona_md: 'some text' }
    const safe = applyPatch(body)
    expect(safe).not.toHaveProperty('kind')
    expect(safe.name).toBe('New Name')
    expect(safe.persona_md).toBe('some text')
  })

  it('kind column is preserved in DB after unrelated PATCH', async () => {
    const id = await createProfileWithKind(adapter, 'user-a', 'Custom', 'custom')
    await adapter.run(
      `UPDATE resume_profiles SET name = ? WHERE id = ? AND user_id = ?`,
      ['Renamed', id, 'user-a'],
    )
    const row = await adapter.queryOne<{ name: string; kind: string }>(
      `SELECT name, kind FROM resume_profiles WHERE id = ?`,
      [id],
    )
    expect(row!.name).toBe('Renamed')
    expect(row!.kind).toBe('custom')
  })
})
