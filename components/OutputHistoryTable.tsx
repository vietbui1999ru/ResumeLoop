'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'

const JobDetailModal = dynamic(() => import('@/components/JobDetailModal'), { ssr: false })

export interface Output {
  job_id: string
  company: string; role_title: string; role_track: string
  job_fit: number; docx_path: string; built_at: string
}

export function OutputHistoryTable({ outputs }: { outputs: Output[] }) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  return (
    <>
      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-400 mb-3">Resume Output History</h2>
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
          {outputs.length === 0 && <p className="text-zinc-600 text-sm mt-4">No resumes built yet.</p>}
        </div>
      </div>

      {selectedJobId && (
        <JobDetailModal jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />
      )}
    </>
  )
}
