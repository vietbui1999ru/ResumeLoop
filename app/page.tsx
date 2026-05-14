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
      <div className="min-h-[40vh] flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-lg font-semibold text-text-primary mb-2">Dashboard</h1>
        <p className="text-sm text-text-secondary">
          No data yet.{' '}
          <a href="/jobs" className="text-indigo-400 hover:text-indigo-300 underline transition-colors duration-100">
            Go to Jobs → Scan
          </a>{' '}
          to populate.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-muted">{data.total} JDs · {data.visaKill} visa-kill</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="relative bg-white/[0.025] border border-zinc-800 rounded-xl p-5 hover:border-indigo-500/20 hover:-translate-y-px transition-all duration-100">
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
        <div className="bg-white/[0.025] border border-zinc-800 rounded-xl p-5 hover:border-indigo-500/20 hover:-translate-y-px transition-all duration-100">
          <FitDistChart data={data.fit_dist} />
        </div>
      </div>
      {data.pipeline && (
        <div className="bg-white/[0.025] border border-zinc-800 rounded-xl p-5 hover:border-indigo-500/20 hover:-translate-y-px transition-all duration-100">
          <PipelineSankeyChart data={data.pipeline} />
        </div>
      )}
      <div className="relative bg-white/[0.025] border border-zinc-800 rounded-xl p-5 hover:border-indigo-500/20 hover:-translate-y-px transition-all duration-100">
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
