'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

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
          <XAxis dataKey="track" tick={{ fill: '#a1a1aa', fontSize: 12 }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fill: '#a1a1aa', fontSize: 13 }} />
          <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', color: '#fff' }} />
          <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
