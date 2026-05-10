import { RoleTrackChart } from '@/components/RoleTrackChart'
import { FitDistChart } from '@/components/FitDistChart'
import { OutputHistoryTable } from '@/components/OutputHistoryTable'
import { PipelineSankeyChart } from '@/components/PipelineSankeyChart'
import { computeMetrics } from '@/lib/get-metrics'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  let data
  try {
    data = computeMetrics()
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
        <RoleTrackChart data={data.role_track_dist} />
        <FitDistChart data={data.fit_dist} />
      </div>
      {data.pipeline && <PipelineSankeyChart data={data.pipeline} />}
      <OutputHistoryTable outputs={data.outputs} />
    </div>
  )
}
