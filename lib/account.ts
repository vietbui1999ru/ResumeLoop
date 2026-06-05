import { randomUUID } from 'crypto'
import { getAdapter } from './db-adapter'
import { isCloud } from './app-mode'
import { hashPassword } from './password'

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
  const hash = await hashPassword(newPassword)
  const db   = await getAdapter()
  await db.run(
    `UPDATE users SET password = ?, password_changed_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [hash, userId],
  )
}

/** Register a new credentials user. Returns the new user id. */
export async function createUser(email: string, password: string): Promise<string> {
  const id   = randomUUID()
  const hash = await hashPassword(password)
  const db   = await getAdapter()
  // Only gate on email verification if Resend is actually configured.
  // Without RESEND_API_KEY the verification email is silently dropped, permanently locking users out.
  const emailVerified = (isCloud() && !!process.env.RESEND_API_KEY) ? 0 : 1
  await db.run(
    `INSERT INTO users (id, email, password, email_verified) VALUES (?, ?, ?, ?)`,
    [id, email.toLowerCase().trim(), hash, emailVerified],
  )
  await seedWelcomeOutput(id, db)
  return id
}

/** Seed a sample job + output so new users see a non-empty Output History.
 *  Called for both credentials signup and OAuth first-sign-in. */
export async function seedWelcomeOutput(userId: string, db?: Awaited<ReturnType<typeof getAdapter>>): Promise<void> {
  const resolvedDb = db ?? await getAdapter()
  const jobId    = randomUUID()
  const outputId = randomUUID()
  try {
    await resolvedDb.run(
      `INSERT INTO jd_jobs
         (id, file_path, company, role_title, tags, role_track, fit_pct, raw_content, action, hidden, user_id, scanned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)`,
      [
        jobId, 'sample/wefunder.md', 'Wefunder', 'Full Stack Product Engineer',
        JSON.stringify(['sample']),
        'Software Engineer / Full-Stack', 88,
        'Sample job — Full Stack Product Engineer at Wefunder. React, Python, PostgreSQL.',
        '1-Applied', userId,
      ],
    )
    await resolvedDb.run(
      `INSERT INTO jd_outputs
         (id, job_id, docx_path, pdf_path, variant, tagline, user_id, built_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        outputId, jobId,
        's3:demo/JohnDoe_DemoResume.docx',
        's3:demo/JohnDoe_DemoResume.pdf',
        'genai',
        'Full-Stack Engineer building product-first features with React and Python',
        userId,
      ],
    )
  } catch { /* non-fatal — don't block signup if sample seed fails */ }
}
