import 'server-only'
import { getAdapter } from './db-adapter'
import { encrypt, decrypt } from './crypto'

export type Provider = 'anthropic' | 'openai' | 'google' | 'groq' | 'openrouter' | 'ollama'

export const PROVIDERS: Provider[] = ['anthropic', 'openai', 'google', 'groq', 'openrouter', 'ollama']

export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic:  'claude-sonnet-4-6',
  openai:     'gpt-4o-mini',
  google:     'gemini-2.5-flash',
  groq:       'llama-3.3-70b-versatile',
  openrouter: 'anthropic/claude-3-haiku',
  ollama:     'gemma4:e2b',
}

interface Row {
  provider:      Provider
  encrypted_key: string
  model:         string
  base_url:      string | null
}

export interface ProviderConfig {
  provider: Provider
  apiKey:   string
  model:    string
  baseUrl?: string
}

export interface ProviderHint {
  provider: Provider
  model:    string
  key_hint: string
  base_url?: string
  is_active: boolean
}

// Active provider stored in app_settings under key 'active_ai_provider'
export async function getActiveProvider(userId: string): Promise<Provider | null> {
  const db = await getAdapter()
  const row = await db.queryOne<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = ?`,
    [`active_ai_provider:${userId}`],
  )
  return (row?.value as Provider) ?? null
}

export async function setActiveProvider(userId: string, provider: Provider): Promise<void> {
  const db = await getAdapter()
  await db.run(
    `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [`active_ai_provider:${userId}`, provider],
  )
}

export async function getActiveConfig(userId: string): Promise<ProviderConfig | null> {
  const provider = await getActiveProvider(userId)
  if (!provider) return null
  return getProviderConfig(userId, provider)
}

export async function getProviderConfig(userId: string, provider: Provider): Promise<ProviderConfig | null> {
  const db = await getAdapter()
  const row = await db.queryOne<Row>(
    `SELECT provider, encrypted_key, model, base_url FROM user_settings WHERE user_id = ? AND provider = ?`,
    [userId, provider],
  )
  if (!row) return null
  try {
    return {
      provider: row.provider,
      apiKey:   provider === 'ollama' ? '' : await decrypt(row.encrypted_key),
      model:    row.model,
      baseUrl:  row.base_url ?? undefined,
    }
  } catch (e) {
    // Row exists but GCM auth-tag failed — likely ENCRYPTION_KEY rotation or DB tampering.
    // Log the event (never the ciphertext) so ops can detect key-rotation mistakes.
    console.error('[user-settings] decrypt failed — possible key rotation or tampering', { userId, provider, error: String(e) })
    return null
  }
}

export async function setProviderConfig(userId: string, provider: Provider, apiKey: string, model: string, baseUrl?: string): Promise<void> {
  const encryptedKey = provider === 'ollama' ? '' : await encrypt(apiKey)
  const db = await getAdapter()
  await db.run(
    `INSERT INTO user_settings (user_id, provider, encrypted_key, model, base_url, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, provider) DO UPDATE SET
       encrypted_key = excluded.encrypted_key,
       model         = excluded.model,
       base_url      = excluded.base_url,
       updated_at    = excluded.updated_at`,
    [userId, provider, encryptedKey, model, baseUrl ?? null],
  )
}

export async function deleteProviderConfig(userId: string, provider: Provider): Promise<void> {
  const db = await getAdapter()
  await db.run(`DELETE FROM user_settings WHERE user_id = ? AND provider = ?`, [userId, provider])
  // If deleted provider was active, clear active
  if ((await getActiveProvider(userId)) === provider) {
    await db.run(`DELETE FROM app_settings WHERE key = ?`, [`active_ai_provider:${userId}`])
  }
}

export async function listProviderHints(userId: string): Promise<ProviderHint[]> {
  const active = await getActiveProvider(userId)
  const db = await getAdapter()
  const rows = await db.query<Row>(
    `SELECT provider, encrypted_key, model, base_url FROM user_settings WHERE user_id = ? ORDER BY provider`,
    [userId],
  )
  const hints = await Promise.all(rows.map(async (r): Promise<ProviderHint | null> => {
    try {
      return {
        provider:  r.provider,
        model:     r.model,
        key_hint:  r.provider === 'ollama' ? '' : keyHint(await decrypt(r.encrypted_key)),
        base_url:  r.base_url ?? undefined,
        is_active: r.provider === active,
      }
    } catch (e) {
      console.error('[user-settings] decrypt failed in listProviderHints', { userId, provider: r.provider, error: String(e) })
      return null
    }
  }))
  return hints.filter((h): h is ProviderHint => h !== null)
}

export function maskKey(key: string): string {
  if (!key) return '••••'
  // Show only the provider prefix (up to first separator or 8 chars) — no trailing chars
  const prefixEnd = Math.min(key.search(/[-_:]/), 8)
  const prefix = prefixEnd > 0 ? key.slice(0, prefixEnd) : key.slice(0, 4)
  return `${prefix}-••••••••••••`
}

function keyHint(key: string): string {
  return maskKey(key)
}
