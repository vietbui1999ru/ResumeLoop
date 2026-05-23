'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { TEXT_COLORS, SURFACE_COLORS, BORDER_COLORS } from '@/lib/tokens'

export function FitDistChart({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data).map(([bucket, count]) => ({ bucket, count }))

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
      <h2 className="text-sm font-semibold text-zinc-400 mb-3">Fit% Distribution</h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData}>
          <XAxis dataKey="bucket" tick={{ fill: TEXT_COLORS.secondary, fontSize: 13 }} />
          <YAxis tick={{ fill: TEXT_COLORS.secondary, fontSize: 13 }} />
          <Tooltip contentStyle={{ background: SURFACE_COLORS.card, border: `1px solid ${BORDER_COLORS.default}`, color: '#fff' }} />
          <Bar dataKey="count" fill="#22c55e" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
