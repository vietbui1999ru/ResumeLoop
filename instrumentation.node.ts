// Next.js instrumentation hook — runs once at server startup (Node.js runtime only).
// Schedules recurring maintenance tasks that require no external cron infrastructure.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { cleanupExpiredDemoUsers } = await import('./lib/demo-seed')

  async function runDemoCleanup() {
    try {
      const { purged } = await cleanupExpiredDemoUsers()
      if (purged > 0) console.log(`[cron] purged ${purged} expired demo users`)
    } catch (e) {
      console.error('[cron] demo cleanup failed:', e)
    }
  }

  // Run once at startup, then every 6 hours (half the 12h demo TTL)
  void runDemoCleanup()
  setInterval(runDemoCleanup, 6 * 60 * 60 * 1000)
}
