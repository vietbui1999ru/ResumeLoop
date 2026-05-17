import bcrypt from 'bcryptjs'

// Pre-computed dummy hash — ensures bcrypt.compare() takes the same time
// whether or not a user exists, preventing email enumeration via timing.
const DUMMY_HASH = bcrypt.hashSync('__timing_guard__', 10)

export interface UserRow {
  id: string; email: string; password: string; is_demo: number;
  email_verified: number; deleted_at: string | null
}

export async function validateCredentials(
  _email: string | undefined,
  password: string,
  row: UserRow | undefined,
): Promise<{ id: string; email: string; isDemo: boolean } | null> {
  const ok = await bcrypt.compare(password, row?.password ?? DUMMY_HASH)
  if (!row || !ok)         return null
  if (!row.email_verified) return null
  if (row.deleted_at)      return null
  return { id: row.id, email: row.email, isDemo: row.is_demo === 1 }
}
