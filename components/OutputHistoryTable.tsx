'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'

const JobDetailModal = dynamic(() => import('@/components/JobDetailModal'), { ssr: false })

export interface Output {
  job_id: string
  company: string; role_title: string; role_track: string
  job_fit: number; docx_path: string; built_at: string
}

export function OutputHistoryTable({ outputs: initialOutputs }: { outputs: Output[] }) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [outputs, setOutputs] = useState<Output[]>(initialOutputs)
  const [refreshing, setRefreshing] = useState(false)

  async function refresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/metrics')
      if (res.ok) {
        const data = await res.json() as { outputs: Output[] }
        setOutputs(data.outputs ?? [])
      }
    } catch { /* ignore */ } finally {
      setRefreshing(false)
    }
  }

  return (
    <>
      <div className="bg-surface-card rounded-lg p-4 border border-border-default">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-secondary">Resume Output History</h2>
          <button
            onClick={refresh}
            disabled={refreshing}
            title="Refresh"
            aria-label="Refresh output history"
            className="text-text-muted hover:text-text-primary disabled:opacity-40 transition-colors"
          >
            <svg
              className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
              fill="none" stroke="currentColor" strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 4v5h.582M20 20v-5h-.581M4.582 9a8 8 0 0115.356 2M19.418 15a8 8 0 01-15.356-2" />
            </svg>
          </button>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border-default">
                <th className="pb-2 pr-4">Company</th>
                <th className="pb-2 pr-4">Role</th>
                <th className="pb-2 pr-4">Track</th>
                <th className="pb-2 pr-4">Fit%</th>
                <th className="pb-2">Built</th>
              </tr>
            </thead>
            <tbody>
              {outputs.map((o, i) => (
                <tr
                  key={i}
                  onClick={() => setSelectedJobId(o.job_id)}
                  className="border-b border-border-subtle hover:bg-surface-raised/50 cursor-pointer"
                >
                  <td className="py-2 pr-4 text-text-primary">{o.company}</td>
                  <td className="py-2 pr-4 text-text-secondary">{o.role_title}</td>
                  <td className="py-2 pr-4 text-text-muted text-xs">{o.role_track}</td>
                  <td className="py-2 pr-4">
                    <span className={o.job_fit >= 60 ? 'text-green-400' : 'text-text-secondary'}>{o.job_fit}%</span>
                  </td>
                  <td className="py-2 text-text-muted text-xs">{new Date(o.built_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {outputs.length === 0 && <p className="text-text-secondary text-sm mt-4">No resumes built yet.</p>}
        </div>
      </div>

      {selectedJobId && (
        <JobDetailModal jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />
      )}
    </>
  )
}
