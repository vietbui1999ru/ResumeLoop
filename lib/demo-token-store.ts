import { randomBytes } from 'crypto'

const TTL_MS = 30_000

interface DemoToken {
  email:     string
  password:  string
  expiresAt: number
}

const store = new Map<string, DemoToken>()

export function createDemoToken(email: string, password: string): string {
  const token = randomBytes(32).toString('hex')
  store.set(token, { email, password, expiresAt: Date.now() + TTL_MS })
  return token
}

export function consumeDemoToken(token: string): { email: string; password: string } | null {
  const entry = store.get(token)
  store.delete(token)
  if (!entry || Date.now() > entry.expiresAt) return null
  return { email: entry.email, password: entry.password }
}
