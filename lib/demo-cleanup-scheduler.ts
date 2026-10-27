import { cleanupExpiredDemoUsers } from './demo-seed'

// Lazily started from the root layout (Node.js server runtime) rather than
// instrumentation.ts: instrumentation.ts is bundled by webpack for the Edge
// runtime too (this app has Edge middleware), and Edge can't resolve the
// Node builtins (fs/path/crypto, better-sqlite3) that demo-seed pulls in
// transitively via lib/db.ts and lib/crypto.ts.
let started = false

export function ensureDemoCleanupScheduler(): void {
  if (started) return
  started = true

  async function runDemoCleanup() {
    try {
      const { purged } = await cleanupExpiredDemoUsers()
      if (purged > 0) console.log(`[cron] purged ${purged} expired demo users`)
    } catch (e) {
      console.error('[cron] demo cleanup failed:', e)
    }
  }

  // Run shortly after first request (not instantly — this fires on the very
  // first page render, which in dev/test can race a separate process doing
  // its own first-time getDb()/migration against the same fresh db file),
  // then every 6 hours (half the 12h demo TTL). unref() so these timers alone
  // can't keep the process alive.
  setTimeout(() => void runDemoCleanup(), 5000).unref()
  setInterval(runDemoCleanup, 6 * 60 * 60 * 1000).unref()
}
