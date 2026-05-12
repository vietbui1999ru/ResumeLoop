import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from './db'
import { SqliteAdapter } from './db-adapter'
import { randomUUID } from 'crypto'

function makeTestDb() {
  const db = new Database(':memory:')
  initSchema(db)
  return db
}

function makeAdapter(db: ReturnType<typeof makeTestDb>) {
  return new SqliteAdapter(db)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface Profile {
  id: string
  user_id: string
  name: string
  data: string
  is_active: number
}

async function createProfile(
  adapter: SqliteAdapter,
  userId: string,
  name = 'My Profile',
  data = '{}',
): Promise<string> {
  const count = (
    await adapter.query<{ c: number }>(
      'SELECT COUNT(*) as c FROM resume_profiles WHERE user_id = ?',
      [userId],
    )
  )[0]?.c ?? 0
  const is_active = count === 0 ? 1 : 0
  const id = randomUUID()
  await adapter.run(
    'INSERT INTO resume_profiles (id, user_id, name, data, is_active) VALUES (?, ?, ?, ?, ?)',
    [id, userId, name, data, is_active],
  )
  return id
}

async function setActive(adapter: SqliteAdapter, id: string, userId: string) {
  await adapter.run('UPDATE resume_profiles SET is_active = 0 WHERE user_id = ?', [userId])
  await adapter.run('UPDATE resume_profiles SET is_active = 1 WHERE id = ? AND user_id = ?', [id, userId])
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resume_profiles — create', () => {
  let db: ReturnType<typeof makeTestDb>
  let adapter: SqliteAdapter

  beforeEach(() => {
    db = makeTestDb()
    adapter = makeAdapter(db)
  })

  it('stores profile with correct user_id', async () => {
    const id = await createProfile(adapter, 'user-a', 'Resume v1')
    const row = await adapter.queryOne<Profile>(
      'SELECT * FROM resume_profiles WHERE id = ?',
      [id],
    )
    expect(row).toBeDefined()
    expect(row!.user_id).toBe('user-a')
    expect(row!.name).toBe('Resume v1')
  })

  it('first profile is marked active automatically', async () => {
    const id = await createProfile(adapter, 'user-a')
    const row = await adapter.queryOne<Profile>(
      'SELECT is_active FROM resume_profiles WHERE id = ?',
      [id],
    )
    expect(row!.is_active).toBe(1)
  })

  it('second profile is not marked active by default', async () => {
    await createProfile(adapter, 'user-a', 'First')
    const id2 = await createProfile(adapter, 'user-a', 'Second')
    const row = await adapter.queryOne<Profile>(
      'SELECT is_active FROM resume_profiles WHERE id = ?',
      [id2],
    )
    expect(row!.is_active).toBe(0)
  })

  it('two users each get their own first-profile active flag', async () => {
    const idA = await createProfile(adapter, 'user-a')
    const idB = await createProfile(adapter, 'user-b')

    const rowA = await adapter.queryOne<Profile>('SELECT is_active FROM resume_profiles WHERE id = ?', [idA])
    const rowB = await adapter.queryOne<Profile>('SELECT is_active FROM resume_profiles WHERE id = ?', [idB])
    expect(rowA!.is_active).toBe(1)
    expect(rowB!.is_active).toBe(1)
  })
})

describe('resume_profiles — set active', () => {
  let db: ReturnType<typeof makeTestDb>
  let adapter: SqliteAdapter

  beforeEach(() => {
    db = makeTestDb()
    adapter = makeAdapter(db)
  })

  it('set_active clears other active flags for same user', async () => {
    const id1 = await createProfile(adapter, 'user-a', 'First') // is_active = 1
    const id2 = await createProfile(adapter, 'user-a', 'Second') // is_active = 0

    await setActive(adapter, id2, 'user-a')

    const row1 = await adapter.queryOne<Profile>('SELECT is_active FROM resume_profiles WHERE id = ?', [id1])
    const row2 = await adapter.queryOne<Profile>('SELECT is_active FROM resume_profiles WHERE id = ?', [id2])
    expect(row1!.is_active).toBe(0)
    expect(row2!.is_active).toBe(1)
  })

  it("set_active does not affect other users' profiles", async () => {
    const idA = await createProfile(adapter, 'user-a') // active for user-a
    const idB1 = await createProfile(adapter, 'user-b', 'B-First')
    const idB2 = await createProfile(adapter, 'user-b', 'B-Second')

    // Activate B-Second for user-b
    await setActive(adapter, idB2, 'user-b')

    // user-a profile should be untouched
    const rowA = await adapter.queryOne<Profile>('SELECT is_active FROM resume_profiles WHERE id = ?', [idA])
    expect(rowA!.is_active).toBe(1)

    // user-b first profile should now be inactive
    const rowB1 = await adapter.queryOne<Profile>('SELECT is_active FROM resume_profiles WHERE id = ?', [idB1])
    expect(rowB1!.is_active).toBe(0)
  })
})

describe('resume_profiles — delete', () => {
  let db: ReturnType<typeof makeTestDb>
  let adapter: SqliteAdapter

  beforeEach(() => {
    db = makeTestDb()
    adapter = makeAdapter(db)
  })

  it('deletes a non-active profile successfully', async () => {
    const id1 = await createProfile(adapter, 'user-a', 'Active') // active
    const id2 = await createProfile(adapter, 'user-a', 'Inactive') // not active

    await adapter.run('DELETE FROM resume_profiles WHERE id = ? AND user_id = ?', [id2, 'user-a'])

    const remaining = await adapter.query<Profile>('SELECT id FROM resume_profiles WHERE user_id = ?', ['user-a'])
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(id1)
  })

  it('only profile remains in DB after delete attempt (API must guard, DB does not)', async () => {
    const id = await createProfile(adapter, 'user-a', 'Only Profile')

    // The DB itself has no constraint preventing deletion of the last profile.
    // The API route checks count <= 1 before deleting.
    // This test documents that the raw delete succeeds at the DB level.
    await adapter.run('DELETE FROM resume_profiles WHERE id = ?', [id])
    const count = (
      await adapter.query<{ c: number }>('SELECT COUNT(*) as c FROM resume_profiles WHERE user_id = ?', ['user-a'])
    )[0]?.c ?? 0
    expect(count).toBe(0)
  })
})

describe('resume_profiles — user isolation', () => {
  let db: ReturnType<typeof makeTestDb>
  let adapter: SqliteAdapter

  beforeEach(() => {
    db = makeTestDb()
    adapter = makeAdapter(db)
  })

  it('user A cannot read user B profiles via WHERE user_id filter', async () => {
    await createProfile(adapter, 'user-b', 'B Profile')

    const rowsForA = await adapter.query<Profile>(
      'SELECT * FROM resume_profiles WHERE user_id = ?',
      ['user-a'],
    )
    expect(rowsForA).toHaveLength(0)
  })

  it('each user sees only their own profiles', async () => {
    await createProfile(adapter, 'user-a', 'A-One')
    await createProfile(adapter, 'user-a', 'A-Two')
    await createProfile(adapter, 'user-b', 'B-One')

    const aProfiles = await adapter.query<Profile>(
      'SELECT * FROM resume_profiles WHERE user_id = ?',
      ['user-a'],
    )
    const bProfiles = await adapter.query<Profile>(
      'SELECT * FROM resume_profiles WHERE user_id = ?',
      ['user-b'],
    )

    expect(aProfiles).toHaveLength(2)
    expect(bProfiles).toHaveLength(1)
    expect(aProfiles.every(p => p.user_id === 'user-a')).toBe(true)
    expect(bProfiles[0].user_id).toBe('user-b')
  })

  it('queryOne with id + user_id returns undefined for wrong user', async () => {
    const id = await createProfile(adapter, 'user-a')

    const row = await adapter.queryOne<Profile>(
      'SELECT * FROM resume_profiles WHERE id = ? AND user_id = ?',
      [id, 'user-b'],
    )
    expect(row).toBeUndefined()
  })
})
