import { RoleTrackChart } from '@/components/RoleTrackChart'
import { FitDistChart } from '@/components/FitDistChart'
import { OutputHistoryTable } from '@/components/OutputHistoryTable'
import { PipelineSankeyChart } from '@/components/PipelineSankeyChart'
import { TourBubble } from '@/components/TourBubble'
import { computeMetrics } from '@/lib/get-metrics'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return null  // middleware redirects unauthenticated users before this

  let data
  try {
    data = await computeMetrics(userId)
  } catch {
    data = null
  }

  if (!data || data.total === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-zinc-500 text-sm">
          No data yet.{' '}
          <a href="/jobs" className="text-indigo-400 underline">Go to Jobs → Scan</a> to populate.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-zinc-500">{data.total} JDs · {data.visaKill} visa-kill</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="relative">
          <RoleTrackChart data={data.role_track_dist} />
          <TourBubble
            tourKey="dashboard-role-chart"
            title="Role category breakdown"
            body="Shows which role tracks your scanned jobs fall into. Use this to spot where demand clusters — helpful for deciding which resume profile to keep active."
            position="below"
            align="left"
            width={270}
          />
        </div>
        <FitDistChart data={data.fit_dist} />
      </div>
      {data.pipeline && <PipelineSankeyChart data={data.pipeline} />}
      <div className="relative">
        <OutputHistoryTable outputs={data.outputs} />
        <TourBubble
          tourKey="dashboard-outputs"
          title="Generated resumes"
          body="Every resume generation run appears here. Download the DOCX directly or re-open the job to regenerate with updated profile data."
          position="above"
          align="left"
          width={270}
        />
      </div>
    </div>
  )
}
