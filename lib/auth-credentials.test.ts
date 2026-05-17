import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'
import { validateCredentials, type UserRow } from './auth-credentials'

const VALID_HASH = bcrypt.hashSync('correct-password', 10)

function makeRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-1',
    email: 'test@example.com',
    password: VALID_HASH,
    is_demo: 0,
    email_verified: 1,
    deleted_at: null,
    ...overrides,
  }
}

describe('validateCredentials', () => {
  it('returns user when credentials are valid', async () => {
    const result = await validateCredentials('test@example.com', 'correct-password', makeRow())
    expect(result).toMatchObject({ id: 'user-1', email: 'test@example.com', isDemo: false })
  })

  it('returns null when user row is not found', async () => {
    const result = await validateCredentials('ghost@example.com', 'any-password', undefined)
    expect(result).toBeNull()
  })

  it('returns null when password is wrong', async () => {
    const result = await validateCredentials('test@example.com', 'wrong-password', makeRow())
    expect(result).toBeNull()
  })

  it('returns null when email is not verified', async () => {
    const result = await validateCredentials('test@example.com', 'correct-password', makeRow({ email_verified: 0 }))
    expect(result).toBeNull()
  })

  it('returns null when account is soft-deleted', async () => {
    const result = await validateCredentials('test@example.com', 'correct-password', makeRow({ deleted_at: '2026-04-01T00:00:00Z' }))
    expect(result).toBeNull()
  })

  it('returns isDemo true for demo accounts', async () => {
    const result = await validateCredentials('test@example.com', 'correct-password', makeRow({ is_demo: 1 }))
    expect(result?.isDemo).toBe(true)
  })
})
