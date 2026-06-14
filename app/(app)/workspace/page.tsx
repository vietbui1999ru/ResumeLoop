import { listJobs, type IndexedJob } from '@/lib/workspace/index-db'
import { workspaceRoot } from '@/lib/workspace/paths'

// Reads the rebuildable SQLite index at runtime — never prerender.
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Workspace · ResumeLoop' }

export default function WorkspacePage() {
  let jobs: IndexedJob[] = []
  let error: string | null = null
  try {
    jobs = listJobs(workspaceRoot())
  } catch (e) {
    error = (e as Error).message
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-xl font-semibold">Workspace</h1>
      <p className="mt-1 mb-4 text-sm text-neutral-500">
        Jobs from your local files (<code>data/jobs/*.md</code>), served from the rebuildable
        index. Files are the source of truth; run <code>resumeloop reindex</code> after edits.
      </p>

      {error && <p className="text-sm text-red-600" role="alert">Index error: {error}</p>}

      {!error && jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-sm text-neutral-500" data-testid="workspace-empty">
          No indexed jobs. Run <code>resumeloop init</code> then <code>resumeloop reindex</code>.
        </div>
      ) : (
        <table className="w-full text-sm" data-testid="workspace-jobs">
          <thead>
            <tr className="border-b text-left text-neutral-500">
              <th className="py-2 pr-4 font-medium">Company</th>
              <th className="py-2 pr-4 font-medium">Role</th>
              <th className="py-2 pr-4 font-medium">Visa</th>
              <th className="py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(j => (
              <tr key={j.id} className="border-b border-neutral-100" data-testid={`ws-job-${j.id}`}>
                <td className="py-2 pr-4 font-medium">{j.company || '—'}</td>
                <td className="py-2 pr-4">{j.role_title || '—'}</td>
                <td className="py-2 pr-4">
                  <span className={j.visa_status === 'kill' ? 'text-red-600' : 'text-neutral-600'}>
                    {j.visa_status}
                  </span>
                </td>
                <td className="py-2 text-neutral-600">{j.action ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
