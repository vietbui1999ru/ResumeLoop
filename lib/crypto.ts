import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LEN    = 12

// Async so a future AWS Secrets Manager fetch is a one-line swap here.
async function getKey(): Promise<Buffer> {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY env var is not set. ' +
      'Generate one with: openssl rand -hex 32'
    )
  }
  const buf = Buffer.from(raw, 'hex')
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY must be 64 hex chars (32 bytes)')
  return buf
}

// Returns "ivB64:authTagB64:ciphertextB64"
export async function encrypt(plaintext: string): Promise<string> {
  const key    = await getKey()
  const iv     = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const data   = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`
}

export async function decrypt(ciphertext: string): Promise<string> {
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted value format')
  const [ivB64, tagB64, dataB64] = parts
  const key      = await getKey()
  const iv       = Buffer.from(ivB64,   'base64')
  const tag      = Buffer.from(tagB64,  'base64')
  const data     = Buffer.from(dataB64, 'base64')
  if (iv.length !== IV_LEN) throw new Error('Invalid IV length in encrypted value')
  if (tag.length !== 16) throw new Error('Invalid auth tag length in encrypted value')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(data).toString('utf8') + decipher.final('utf8')
}
