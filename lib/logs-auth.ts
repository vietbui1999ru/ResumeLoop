import { timingSafeEqual } from 'crypto'
import { auth } from '@/lib/auth'

export async function checkLogsAuth(req: Request): Promise<boolean> {
  const session = await auth()
  if (session?.user?.id) return true

  const apiKey = process.env.LOGS_API_KEY
  if (!apiKey) return false

  const provided = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${apiKey}`
  if (provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}
