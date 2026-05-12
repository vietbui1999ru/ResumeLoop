import { createHash, randomBytes } from 'crypto'
import { Resend } from 'resend'
import { getAdapter } from './db-adapter'
import { randomUUID } from 'crypto'

const FROM = 'ResumeAnalyze <noreply@resumeanalyze.app>'
const PASSWORD_RESET_TTL_MS    = 60 * 60 * 1000       // 1 hour
const EMAIL_VERIFY_TTL_MS      = 24 * 60 * 60 * 1000  // 24 hours

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY env var is not set')
  return new Resend(key)
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

// ── Password reset ────────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(userId: string, toEmail: string): Promise<void> {
  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = sha256(rawToken)
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString()

  const db = await getAdapter()
  await db.run(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [randomUUID(), userId, tokenHash, expiresAt],
  )

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const link = `${appUrl}/auth/reset-password?token=${rawToken}`

  await getResend().emails.send({
    from:    FROM,
    to:      toEmail,
    subject: 'Reset your ResumeAnalyze password',
    html:    `<p>Click to reset your password (expires in 1 hour):</p>
              <p><a href="${link}">${link}</a></p>
              <p>If you didn't request this, you can ignore this email.</p>`,
  })
}

export async function consumePasswordResetToken(rawToken: string): Promise<string | null> {
  const tokenHash = sha256(rawToken)
  const db = await getAdapter()
  const row = await db.queryOne<{ id: string; user_id: string; expires_at: string; used: number }>(
    `SELECT id, user_id, expires_at, used FROM password_reset_tokens WHERE token_hash = ?`,
    [tokenHash],
  )
  if (!row || row.used === 1) return null
  if (new Date(row.expires_at) < new Date()) return null

  await db.run(`UPDATE password_reset_tokens SET used = 1 WHERE id = ?`, [row.id])
  return row.user_id
}

// ── Email verification ────────────────────────────────────────────────────────

export async function sendVerificationEmail(userId: string, toEmail: string): Promise<void> {
  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = sha256(rawToken)
  const expiresAt = new Date(Date.now() + EMAIL_VERIFY_TTL_MS).toISOString()

  const db = await getAdapter()
  await db.run(
    `INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [randomUUID(), userId, tokenHash, expiresAt],
  )

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const link = `${appUrl}/auth/verify-email?token=${rawToken}`

  await getResend().emails.send({
    from:    FROM,
    to:      toEmail,
    subject: 'Verify your ResumeAnalyze email',
    html:    `<p>Click to verify your email address:</p>
              <p><a href="${link}">${link}</a></p>
              <p>Link expires in 24 hours.</p>`,
  })
}

export async function consumeVerificationToken(rawToken: string): Promise<string | null> {
  const tokenHash = sha256(rawToken)
  const db = await getAdapter()
  const row = await db.queryOne<{ id: string; user_id: string; expires_at: string }>(
    `SELECT id, user_id, expires_at FROM email_verification_tokens WHERE token_hash = ?`,
    [tokenHash],
  )
  if (!row) return null
  if (new Date(row.expires_at) < new Date()) return null

  await db.run(`DELETE FROM email_verification_tokens WHERE id = ?`, [row.id])
  await db.run(`UPDATE users SET email_verified = 1 WHERE id = ?`, [row.user_id])
  return row.user_id
}
