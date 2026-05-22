# Demo User Per-IP Architecture

**Date:** 2026-05-18  
**Status:** Approved

## Problem

Each call to `POST /api/auth/demo` creates a brand-new demo user. Two issues:
1. No way for a returning visitor to resume their demo session — they always get a new one.
2. No way for a user to self-reset their demo data without waiting for TTL expiry.

## Goals

- Same IP returns the same demo session (within TTL).
- Users can explicitly reset their demo session via a "Reset Demo" button.
- Concurrent visitors from different IPs each get their own isolated demo user.

## Non-Goals

- Admin flush-all endpoint (not requested).
- Changing the client auth flow (still uses email + password).

---

## Schema Changes

Two new nullable columns on `users`:

```sql
ALTER TABLE users ADD COLUMN ip_hash           TEXT;  -- SHA-256(ip), NULL for real users
ALTER TABLE users ADD COLUMN demo_cleartext_pwd TEXT;  -- plaintext pwd, NULL for real users
```

Index for fast IP lookup:

```sql
CREATE INDEX IF NOT EXISTS idx_users_ip_hash ON users(ip_hash) WHERE is_demo = 1;
```

Guards follow the existing `ALTER TABLE` migration pattern in `db.ts`.

---

## Demo Route — `POST /api/auth/demo`

**Updated flow:**

1. Extract IP from `x-forwarded-for` header → compute `SHA-256(ip)` → `ip_hash`
2. Query: `SELECT id, email, demo_cleartext_pwd FROM users WHERE ip_hash = ? AND is_demo = 1 AND created_at > <cutoff>`  
   (cutoff = `now - DEMO_TTL_MS`, same 12h TTL as today)
3. **Hit** → return `{ email, password: demo_cleartext_pwd }`. No DB writes. Fast path.
4. **Miss** (first visit or expired):
   - Delete any stale demo user for this `ip_hash` (handles TTL-expired rows cleanly)
   - Generate fresh `email`, `password = randomUUID()`, bcrypt hash
   - Insert user with `ip_hash` + `demo_cleartext_pwd = password`
   - Call `seedDemoUser(id)`
   - Return `{ email, password }`

Rate limit stays on `auth:demo:${ip}` — applies to both hit and miss paths.

**Security note:** `demo_cleartext_pwd` is acceptable here. Demo accounts are ephemeral, use a fake email domain (`demo.local`), and contain no real user data. The column is `NULL` for all non-demo rows.

---

## Reset Endpoint — `POST /api/auth/demo/reset`

New route at `app/api/auth/demo/reset/route.ts`.

**Auth:** Requires active session. Server reads `userId` from session.

**Flow:**
1. Load user — verify `is_demo = 1`. Return 403 if not a demo user.
2. Read `ip_hash` from the current demo user row (carry it forward).
3. Call `deleteDemoUser(userId)` — existing function, deletes all child rows then the user row.
4. Create a fresh demo user with the same `ip_hash` (same as the Miss path in the demo route).
5. Return `{ email, password }` — client signs out and re-authenticates with the new credentials.

---

## File Touchpoints

| File | Change |
|---|---|
| `lib/db.ts` | Add two `ALTER TABLE` migration guards + index |
| `app/api/auth/demo/route.ts` | Add ip_hash lookup, store `ip_hash` + `demo_cleartext_pwd` on create |
| `app/api/auth/demo/reset/route.ts` | New file — reset endpoint |
| `lib/demo-seed.ts` | Extract shared `createDemoUserForIp(ip_hash)` helper used by both routes |
