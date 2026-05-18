import 'server-only'
import { getAdapter } from './db-adapter'

/**
 * Retrieve the active system prompt content for a given key.
 * Returns the highest-version active row, or empty string if not found.
 * Keys: 'reason' | 'chat' | 'cover-letter'
 */
export async function getSystemPrompt(key: string): Promise<string> {
  const db = await getAdapter()
  const row = await db.queryOne<{ content: string }>(
    `SELECT content FROM system_prompts
     WHERE prompt_key = ? AND is_active = 1
     ORDER BY version DESC LIMIT 1`,
    [key],
  )
  return row?.content ?? ''
}
