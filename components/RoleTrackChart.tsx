'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { TEXT_COLORS, SURFACE_COLORS, BORDER_COLORS, CHART_COLORS } from '@/lib/tokens'

export function RoleTrackChart({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data)
    .map(([track, count]) => ({ track, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
      <h2 className="text-sm font-semibold text-zinc-400 mb-3">Role-Track Distribution</h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ bottom: 60 }}>
          <XAxis dataKey="track" tick={{ fill: TEXT_COLORS.secondary, fontSize: 12 }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fill: TEXT_COLORS.secondary, fontSize: 13 }} />
          <Tooltip contentStyle={{ background: SURFACE_COLORS.card, border: `1px solid ${BORDER_COLORS.default}`, color: '#fff' }} />
          <Bar dataKey="count" fill={CHART_COLORS.scraped} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
