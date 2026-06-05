import bcrypt from 'bcryptjs'

/** Hash a plaintext password using bcrypt with rounds=12. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}
