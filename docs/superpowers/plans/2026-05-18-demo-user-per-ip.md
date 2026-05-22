# Demo User Per-IP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind one demo session per client IP so returning visitors resume their session, and provide a reset endpoint that creates a fresh demo for the same IP.

**Architecture:** Add `ip_hash` (SHA-256 of IP) and `demo_cleartext_pwd` columns to `users`. `demo-seed.ts` gains two exported functions — `getOrCreateDemoUserForIp` (hit/miss logic) and `resetDemoUser` (delete + recreate). The demo route and a new reset route are thin wrappers around these helpers.

**Tech Stack:** Next.js App Router, SQLite (better-sqlite3 via db-adapter), bcryptjs, Node crypto, vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/db.ts` | Modify | Migration guards for `ip_hash` + `demo_cleartext_pwd` + index |
| `lib/demo-seed.ts` | Modify | Add `getOrCreateDemoUserForIp`, `resetDemoUser`, private `createFreshDemoForIp`; add bcrypt import |
| `lib/demo-seed.test.ts` | Create | Unit tests for the two new exported functions |
| `app/api/auth/demo/route.ts` | Modify | Replace inline create logic with `getOrCreateDemoUserForIp` |
| `app/api/auth/demo/route.test.ts` | Modify | Update tests to cover hit and miss paths |
| `app/api/auth/demo/reset/route.ts` | Create | `POST /api/auth/demo/reset` endpoint |
| `app/api/auth/demo/reset/route.test.ts` | Create | Unit tests for reset route |

---

### Task 1: Schema migration

**Files:**
- Modify: `lib/db.ts`

- [ ] **Step 1: Add migration guards**

In `lib/db.ts`, find the block of `hasColumn` guards for the `users` table (around line 363). Add after the last users-table guard block:

```typescript
if (!hasColumn(db, 'users', 'ip_hash'))
  db.exec(`ALTER TABLE users ADD COLUMN ip_hash TEXT`)
if (!hasColumn(db, 'users', 'demo_cleartext_pwd'))
  db.exec(`ALTER TABLE users ADD COLUMN demo_cleartext_pwd TEXT`)
db.exec(`CREATE INDEX IF NOT EXISTS idx_users_ip_hash ON users(ip_hash) WHERE is_demo = 1`)
```

- [ ] **Step 2: Verify migrations run without error**

```bash
npx tsx -e "import('./lib/db').then(m => m.getDb()).then(() => console.log('ok'))"
```

Expected: prints `ok` with no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db.ts
git commit -m "feat(demo): add ip_hash and demo_cleartext_pwd columns to users"
```

---

### Task 2: Add helpers to demo-seed.ts

**Files:**
- Modify: `lib/demo-seed.ts`
- Create: `lib/demo-seed.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/demo-seed.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db-adapter', () => ({ getAdapter: vi.fn() }))
vi.mock('./jd-parser',  () => ({ parseJd:    vi.fn().mockReturnValue({ raw_content: '' }) }))
vi.mock('./fit-scorer', () => ({ scoreJd:    vi.fn().mockReturnValue({ fit_pct: 80, role_track: 'genai', visa_status: 'proceed', action: 'apply' }) }))
vi.mock('bcryptjs',     () => ({ default: { hash: vi.fn().mockResolvedValue('hashed') } }))

import { getAdapter } from './db-adapter'
import { getOrCreateDemoUserForIp, resetDemoUser } from './demo-seed'

const mockGetAdapter = vi.mocked(getAdapter)

function makeMockDb(overrides: Record<string, unknown> = {}) {
  return {
    queryOne: vi.fn(),
    query:    vi.fn().mockResolvedValue([]),
    run:      vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('getOrCreateDemoUserForIp', () => {
  it('returns existing creds without inserting when active demo exists for ip_hash', async () => {
    const mockDb = makeMockDb()
    mockDb.queryOne.mockResolvedValueOnce({ email: 'demo_abc@demo.local', demo_cleartext_pwd: 'secret' })
    mockGetAdapter.mockResolvedValue(mockDb as any)

    const result = await getOrCreateDemoUserForIp('hash-111')

    expect(result).toEqual({ email: 'demo_abc@demo.local', password: 'secret' })
    expect(mockDb.run).not.toHaveBeenCalled()
  })

  it('creates a new user when no active demo exists for ip_hash', async () => {
    const mockDb = makeMockDb()
    mockDb.queryOne.mockResolvedValue(undefined)
    mockGetAdapter.mockResolvedValue(mockDb as any)

    const result = await getOrCreateDemoUserForIp('hash-222')

    expect(result.email).toMatch(/^demo_[0-9a-f-]+@demo\.local$/)
    expect(typeof result.password).toBe('string')
    expect(result.password.length).toBeGreaterThan(0)

    const insertCall = mockDb.run.mock.calls.find(([sql]: [string]) => sql.includes('INSERT INTO users'))
    expect(insertCall).toBeDefined()
    expect(insertCall![1]).toContain('hash-222')
  })

  it('deletes stale expired user before creating fresh', async () => {
    const mockDb = makeMockDb()
    mockDb.queryOne.mockResolvedValueOnce(undefined)         // existing check: miss
    mockDb.queryOne.mockResolvedValueOnce({ id: 'old-id' }) // stale check: hit
    mockGetAdapter.mockResolvedValue(mockDb as any)

    await getOrCreateDemoUserForIp('hash-333')

    const deleteCall = mockDb.run.mock.calls.find(
      ([sql]: [string]) => sql.includes('DELETE FROM users') && sql.includes('id')
    )
    expect(deleteCall).toBeDefined()
    expect(deleteCall![1]).toContain('old-id')
  })
})

describe('resetDemoUser', () => {
  it('deletes old user and creates fresh one with same ip_hash', async () => {
    const mockDb = makeMockDb()
    mockDb.queryOne.mockResolvedValue(undefined)
    mockGetAdapter.mockResolvedValue(mockDb as any)

    const result = await resetDemoUser('old-id', 'hash-444')

    const deleteUsersCall = mockDb.run.mock.calls.find(
      ([sql]: [string]) => sql.includes('DELETE FROM users') && sql.includes('id')
    )
    expect(deleteUsersCall![1]).toContain('old-id')

    const insertCall = mockDb.run.mock.calls.find(([sql]: [string]) => sql.includes('INSERT INTO users'))
    expect(insertCall![1]).toContain('hash-444')

    expect(result.email).toMatch(/^demo_[0-9a-f-]+@demo\.local$/)
    expect(typeof result.password).toBe('string')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run lib/demo-seed.test.ts
```

Expected: FAIL — functions not exported yet.

- [ ] **Step 3: Add bcrypt import and helpers to demo-seed.ts**

At the top of `lib/demo-seed.ts`, add the bcrypt import:

```typescript
import bcrypt from 'bcryptjs'
```

After `deleteDemoUser` (around line 699), add the three functions. Note: `createFreshDemoForIp` calls `seedDemoUser` which is defined later in the file — place these three functions AFTER `seedDemoUser` to avoid forward-reference issues:

```typescript
async function createFreshDemoForIp(
  ipHash: string,
  db: Awaited<ReturnType<typeof getAdapter>>,
): Promise<{ id: string; email: string; password: string }> {
  const id       = randomUUID()
  const email    = `demo_${id}@demo.local`
  const password = randomUUID()
  const hash     = await bcrypt.hash(password, 10)
  await db.run(
    `INSERT INTO users (id, email, password, is_demo, email_verified, ip_hash, demo_cleartext_pwd)
     VALUES (?, ?, ?, 1, 1, ?, ?)`,
    [id, email, hash, ipHash, password],
  )
  await seedDemoUser(id)
  return { id, email, password }
}

export async function getOrCreateDemoUserForIp(
  ipHash: string,
): Promise<{ email: string; password: string }> {
  const db     = await getAdapter()
  const cutoff = new Date(Date.now() - DEMO_TTL_MS).toISOString()

  const existing = await db.queryOne<{ email: string; demo_cleartext_pwd: string }>(
    `SELECT email, demo_cleartext_pwd FROM users WHERE ip_hash = ? AND is_demo = 1 AND created_at > ?`,
    [ipHash, cutoff],
  )
  if (existing) return { email: existing.email, password: existing.demo_cleartext_pwd }

  const stale = await db.queryOne<{ id: string }>(
    `SELECT id FROM users WHERE ip_hash = ? AND is_demo = 1`,
    [ipHash],
  )
  if (stale) await deleteDemoUser(stale.id, db)

  const { email, password } = await createFreshDemoForIp(ipHash, db)
  return { email, password }
}

export async function resetDemoUser(
  userId: string,
  ipHash: string,
): Promise<{ email: string; password: string }> {
  const db = await getAdapter()
  await deleteDemoUser(userId, db)
  const { email, password } = await createFreshDemoForIp(ipHash, db)
  return { email, password }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run lib/demo-seed.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/demo-seed.ts lib/demo-seed.test.ts
git commit -m "feat(demo): add getOrCreateDemoUserForIp and resetDemoUser helpers"
```

---

### Task 3: Update POST /api/auth/demo route

**Files:**
- Modify: `app/api/auth/demo/route.ts`
- Modify: `app/api/auth/demo/route.test.ts`

- [ ] **Step 1: Update tests first**

Replace the contents of `app/api/auth/demo/route.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/demo-seed',  () => ({ getOrCreateDemoUserForIp: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimitAsync: vi.fn() }))
vi.mock('next/headers',     () => ({ headers: vi.fn() }))

import { getOrCreateDemoUserForIp } from '@/lib/demo-seed'
import { checkRateLimitAsync }       from '@/lib/rate-limit'
import { headers }                   from 'next/headers'
import { POST }                      from './route'

const mockGetOrCreate = vi.mocked(getOrCreateDemoUserForIp)
const mockCheckRL     = vi.mocked(checkRateLimitAsync)
const mockHeaders     = vi.mocked(headers)

function makeHeaderMap(ip = '1.2.3.4'): { get: (k: string) => string | null } {
  return { get: (k: string) => (k === 'x-forwarded-for' ? ip : null) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockHeaders.mockResolvedValue(makeHeaderMap() as any)
  mockCheckRL.mockResolvedValue({ success: true } as any)
  mockGetOrCreate.mockResolvedValue({ email: 'demo_x@demo.local', password: 'pass123' })
})

describe('POST /api/auth/demo', () => {
  it('returns 429 when rate limit exceeded', async () => {
    mockCheckRL.mockResolvedValue({ success: false } as any)
    const res = await POST()
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'Too many requests' })
  })

  it('returns email and password from getOrCreateDemoUserForIp', async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ email: 'demo_x@demo.local', password: 'pass123' })
  })

  it('passes sha256 hash of ip to getOrCreateDemoUserForIp', async () => {
    await POST()
    const [ipHash] = mockGetOrCreate.mock.calls[0] as [string]
    expect(ipHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('uses different ip_hash for different IPs', async () => {
    mockHeaders.mockResolvedValue(makeHeaderMap('5.6.7.8') as any)
    await POST()
    const [hash1] = mockGetOrCreate.mock.calls[0] as [string]

    vi.clearAllMocks()
    mockHeaders.mockResolvedValue(makeHeaderMap('9.9.9.9') as any)
    mockCheckRL.mockResolvedValue({ success: true } as any)
    mockGetOrCreate.mockResolvedValue({ email: 'demo_y@demo.local', password: 'pass456' })
    await POST()
    const [hash2] = mockGetOrCreate.mock.calls[0] as [string]

    expect(hash1).not.toBe(hash2)
  })

  it('returns 500 when getOrCreateDemoUserForIp throws', async () => {
    mockGetOrCreate.mockRejectedValue(new Error('db error'))
    const res = await POST()
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run app/api/auth/demo/route.test.ts
```

Expected: FAIL — route still uses old logic.

- [ ] **Step 3: Update the route**

Replace the contents of `app/api/auth/demo/route.ts` with:

```typescript
import { NextResponse }              from 'next/server'
import { createHash }                from 'crypto'
import { getOrCreateDemoUserForIp } from '@/lib/demo-seed'
import { checkRateLimitAsync }       from '@/lib/rate-limit'
import { headers }                   from 'next/headers'

export async function POST() {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rl = await checkRateLimitAsync(`auth:demo:${ip}`, 30, 60_000)
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const ipHash = createHash('sha256').update(ip).digest('hex')
  try {
    const { email, password } = await getOrCreateDemoUserForIp(ipHash)
    return NextResponse.json({ email, password })
  } catch (e) {
    console.error('[demo] Failed to create demo session:', e)
    return NextResponse.json({ error: 'Failed to create demo session' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run app/api/auth/demo/route.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/demo/route.ts app/api/auth/demo/route.test.ts
git commit -m "feat(demo): use ip_hash lookup in demo route via getOrCreateDemoUserForIp"
```

---

### Task 4: Add reset route

**Files:**
- Create: `app/api/auth/demo/reset/route.ts`
- Create: `app/api/auth/demo/reset/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/api/auth/demo/reset/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth',       () => ({ auth: vi.fn() }))
vi.mock('@/lib/db-adapter', () => ({ getAdapter: vi.fn() }))
vi.mock('@/lib/demo-seed',  () => ({ resetDemoUser: vi.fn() }))

import { auth }          from '@/lib/auth'
import { getAdapter }    from '@/lib/db-adapter'
import { resetDemoUser } from '@/lib/demo-seed'
import { POST }          from './route'

const mockAuth       = vi.mocked(auth)
const mockGetAdapter = vi.mocked(getAdapter)
const mockResetDemo  = vi.mocked(resetDemoUser)

function makeDb(ipHash: string | null = 'hash-abc') {
  return {
    queryOne: vi.fn().mockResolvedValue(ipHash !== null ? { ip_hash: ipHash } : undefined),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: 'demo-123', isDemo: true } } as any)
  mockGetAdapter.mockResolvedValue(makeDb() as any)
  mockResetDemo.mockResolvedValue({ email: 'demo_new@demo.local', password: 'newpass' })
})

describe('POST /api/auth/demo/reset', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null as any)
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is not a demo account', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'real-user', isDemo: false } } as any)
    const res = await POST()
    expect(res.status).toBe(403)
  })

  it('returns 404 when demo user has no ip_hash', async () => {
    mockGetAdapter.mockResolvedValue(makeDb(null) as any)
    const res = await POST()
    expect(res.status).toBe(404)
  })

  it('calls resetDemoUser with userId and ip_hash', async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    expect(mockResetDemo).toHaveBeenCalledWith('demo-123', 'hash-abc')
  })

  it('returns new email and password', async () => {
    const res = await POST()
    expect(await res.json()).toEqual({ email: 'demo_new@demo.local', password: 'newpass' })
  })

  it('returns 500 when resetDemoUser throws', async () => {
    mockResetDemo.mockRejectedValue(new Error('db error'))
    const res = await POST()
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run app/api/auth/demo/reset/route.test.ts
```

Expected: FAIL — route file does not exist yet.

- [ ] **Step 3: Create the reset route**

Create `app/api/auth/demo/reset/route.ts`:

```typescript
import { NextResponse }  from 'next/server'
import { auth }          from '@/lib/auth'
import { getAdapter }    from '@/lib/db-adapter'
import { resetDemoUser } from '@/lib/demo-seed'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id)   return NextResponse.json({ error: 'Unauthorized' },       { status: 401 })
  if (!session.user.isDemo) return NextResponse.json({ error: 'Not a demo account' }, { status: 403 })

  const db  = await getAdapter()
  const row = await db.queryOne<{ ip_hash: string }>(
    `SELECT ip_hash FROM users WHERE id = ?`,
    [session.user.id],
  )
  if (!row?.ip_hash) return NextResponse.json({ error: 'Demo user not found' }, { status: 404 })

  try {
    const { email, password } = await resetDemoUser(session.user.id, row.ip_hash)
    return NextResponse.json({ email, password })
  } catch (e) {
    console.error('[demo/reset] Failed to reset demo session:', e)
    return NextResponse.json({ error: 'Failed to reset demo session' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run reset route tests**

```bash
npx vitest run app/api/auth/demo/reset/route.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: all previously passing tests still PASS, new tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/auth/demo/reset/route.ts app/api/auth/demo/reset/route.test.ts
git commit -m "feat(demo): add POST /api/auth/demo/reset endpoint"
```
