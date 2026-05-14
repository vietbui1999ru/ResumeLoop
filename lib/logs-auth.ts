import { auth } from '@/lib/auth'

export async function checkLogsAuth(req: Request): Promise<boolean> {
  const session = await auth()
  if (session?.user?.id) return true

  const apiKey = process.env.LOGS_API_KEY
  if (!apiKey) return false

  return req.headers.get('authorization') === `Bearer ${apiKey}`
}
