import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { getAdapter } from './db-adapter'
import { isCloud } from './app-mode'

/**
 * Delete all user data in dependency order, then the user row.
 * Non-transactional on Neon (statements are individual) but ordered so
 * FK constraints don't block — children before parents.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const db = await getAdapter()

  // Leaf tables first (no outbound FK references)
  await db.run(`DELETE FROM ai_usage_log             WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM email_verification_tokens WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM password_reset_tokens    WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM oauth_accounts           WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM user_settings            WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM app_settings             WHERE key LIKE ?`, [`%:${userId}`])
  await db.run(`DELETE FROM chat_messages            WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM resume_sessions          WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM resume_profiles          WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM jd_metrics               WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM outreach_items           WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM jd_outputs               WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM jd_jobs                  WHERE user_id = ?`, [userId])

  // Parent last
  await db.run(`DELETE FROM users WHERE id = ?`, [userId])
}

/**
 * Change password: hashes new password and stamps password_changed_at
 * so any in-flight JWTs issued before this timestamp are implicitly invalidated
 * once they expire (max 15 min).
 */
export async function changePassword(userId: string, newPassword: string): Promise<void> {
  const hash = await bcrypt.hash(newPassword, 12)
  const db   = await getAdapter()
  await db.run(
    `UPDATE users SET password = ?, password_changed_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [hash, userId],
  )
}

/** Register a new credentials user. Returns the new user id. */
export async function createUser(email: string, password: string): Promise<string> {
  const id   = randomUUID()
  const hash = await bcrypt.hash(password, 12)
  const db   = await getAdapter()
  // Cloud mode requires email verification before login. Self-hosted has no email system,
  // so auto-verify immediately to avoid permanent lockout after signup.
  const emailVerified = isCloud() ? 0 : 1
  await db.run(
    `INSERT INTO users (id, email, password, email_verified) VALUES (?, ?, ?, ?)`,
    [id, email.toLowerCase().trim(), hash, emailVerified],
  )
  return id
}
