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
      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-400">Resume Output History</h2>
          <button
            onClick={refresh}
            disabled={refreshing}
            title="Refresh"
            className="text-zinc-500 hover:text-zinc-200 disabled:opacity-40 transition-colors"
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
              <tr className="text-left text-zinc-500 border-b border-zinc-700">
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
                  className="border-b border-zinc-800 hover:bg-zinc-800/50 cursor-pointer"
                >
                  <td className="py-2 pr-4 text-zinc-200">{o.company}</td>
                  <td className="py-2 pr-4 text-zinc-300">{o.role_title}</td>
                  <td className="py-2 pr-4 text-zinc-400 text-xs">{o.role_track}</td>
                  <td className="py-2 pr-4">
                    <span className={o.job_fit >= 60 ? 'text-green-400' : 'text-zinc-400'}>{o.job_fit}%</span>
                  </td>
                  <td className="py-2 text-zinc-500 text-xs">{new Date(o.built_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {outputs.length === 0 && <p className="text-zinc-400 text-sm mt-4">No resumes built yet.</p>}
        </div>
      </div>

      {selectedJobId && (
        <JobDetailModal jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />
      )}
    </>
  )
}
