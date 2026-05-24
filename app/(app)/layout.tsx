import { Sidebar } from '@/components/Sidebar'
import { ShellClient } from '@/components/ShellClient'
import { TourOverlay } from '@/components/TourOverlay'
import { PageTransition } from '@/components/PageTransition'
import { DemoBanner } from '@/components/DemoBanner'
import { OnboardingGate } from '@/components/OnboardingGate'
import { auth } from '@/lib/auth'
import { getAdapter } from '@/lib/db-adapter'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  let demoExpiresAt: number | null = null

  if (session?.user?.isDemo) {
    const db = await getAdapter()
    const row = await db.queryOne<{ created_at: string }>(
      'SELECT created_at FROM users WHERE id = ?',
      [session.user.id],
    )
    if (row?.created_at) {
      demoExpiresAt = new Date(row.created_at).getTime() + 12 * 60 * 60 * 1000
    }
  }

  return (
    <div className="min-h-screen lg:h-screen flex flex-col lg:overflow-hidden">
      {demoExpiresAt !== null && <DemoBanner expiresAt={demoExpiresAt} />}
      <ShellClient>
        <Sidebar />
        <TourOverlay />
        <OnboardingGate>
          <PageTransition>{children}</PageTransition>
        </OnboardingGate>
      </ShellClient>
    </div>
  )
}
