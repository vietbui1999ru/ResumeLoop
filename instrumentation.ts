// Next.js instrumentation hook — runs once at server startup (Node.js runtime only).
// Registers OTEL SDK for distributed tracing + schedules demo user cleanup cron.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // OTEL SDK — auto-instruments HTTP routes and fetch calls (LLM API calls)
    const { registerOTel } = await import('@vercel/otel')
    registerOTel({
      serviceName: 'resumeloop',
    })

    if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
      console.warn('[otel] OTEL_EXPORTER_OTLP_ENDPOINT not set — traces will not export')
    }

    // Demo user cleanup cron — runs every 6h (half the 12h demo TTL)
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
}
