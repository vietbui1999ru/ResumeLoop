import { getAdapter } from './db-adapter'

export async function logAiUsage(
  userId: string,
  provider: string,
  model: string,
  feature: string,
  inputTok: number,
  outputTok: number,
): Promise<void> {
  try {
    const db = await getAdapter()
    await db.run(
      `INSERT INTO ai_usage_log (user_id, provider, model, feature, input_tok, output_tok) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, provider, model, feature, inputTok, outputTok],
    )
  } catch {
    // never break main flow for logging
  }
}
