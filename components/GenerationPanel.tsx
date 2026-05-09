'use client'
import { useEffect, useRef, useState } from 'react'

interface SSEEvent {
  stage: string
  status: 'ok' | 'fail' | 'running'
  data: Record<string, unknown>
}

interface JobProgress {
  stages: SSEEvent[]
  outputId: string | null
  docPath: string | null
  done: boolean
  failed: boolean
}

interface RatingState {
  rating: number
  note: string
  submitted: boolean
}

interface Props {
  queue: string[]
  onStageUpdate: (jobId: string, stage: string) => void
  onDone: (jobId: string) => void
  onError: (jobId: string, msg: string) => void
}

export default function GenerationPanel({ queue, onStageUpdate, onDone, onError }: Props) {
  const [progress, setProgress] = useState<Map<string, JobProgress>>(new Map())
  const [ratings, setRatings]   = useState<Map<string, RatingState>>(new Map())
  const running = useRef(false)
  const onDoneRef  = useRef(onDone)
  const onErrorRef = useRef(onError)

  // Keep refs pointing at the latest callbacks on every render
  useEffect(() => {
    onDoneRef.current  = onDone
    onErrorRef.current = onError
  })

  useEffect(() => {
    if (running.current) return
    running.current = true
    void runQueue(queue)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function runQueue(ids: string[]) {
    for (const jobId of ids) {
      await runJob(jobId)
    }
  }

  function updateProgress(jobId: string, update: Partial<JobProgress>) {
    setProgress(prev => {
      const cur = prev.get(jobId) ?? {
        stages: [], outputId: null, docPath: null, done: false, failed: false,
      }
      return new Map(prev).set(jobId, { ...cur, ...update })
    })
  }

  async function runJob(jobId: string) {
    const evtSource = new EventSource(`/api/generate/${jobId}/stream`)

    await new Promise<void>(resolve => {
      evtSource.onmessage = (e) => {
        const event: SSEEvent = JSON.parse(e.data as string)

        // Upsert stage: replace running entry for same stage, keep ok/fail
        setProgress(prev => {
          const cur = prev.get(jobId) ?? {
            stages: [], outputId: null, docPath: null, done: false, failed: false,
          }
          const filtered = cur.stages.filter(
            s => !(s.stage === event.stage && s.status === 'running')
          )
          return new Map(prev).set(jobId, { ...cur, stages: [...filtered, event] })
        })

        if (event.status === 'running') {
          onStageUpdate(jobId, event.stage)
        }

        if (event.stage === 'finalize' && event.status === 'ok') {
          updateProgress(jobId, { docPath: event.data.path as string })
        }

        if (event.stage === 'done') {
          updateProgress(jobId, { done: true, outputId: event.data.outputId as string })
          onDoneRef.current(jobId)
          evtSource.close()
          resolve()
        }

        if (event.status === 'fail') {
          updateProgress(jobId, { failed: true })
          onErrorRef.current(jobId, (event.data.message as string) ?? event.stage)
          evtSource.close()
          resolve()
        }
      }

      evtSource.onerror = () => {
        evtSource.close()
        resolve()
      }
    })
  }

  const submitRating = async (jobId: string) => {
    const r = ratings.get(jobId)
    if (!r || r.rating === 0) return
    const outputId = progress.get(jobId)?.outputId ?? ''
    await fetch('/api/generate/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, outputId, rating: r.rating, note: r.note }),
    })
    setRatings(prev => new Map(prev).set(jobId, { ...r, submitted: true }))
  }

  const stageIcon = (status: SSEEvent['status']) => {
    if (status === 'ok')      return <span className="text-green-400">✓</span>
    if (status === 'fail')    return <span className="text-red-400">✗</span>
    return <span className="text-zinc-500">⟳</span>
  }

  const stageSummary = (ev: SSEEvent): string => {
    if (ev.data.tagline)    return `tagline: "${String(ev.data.tagline)}"`
    if (ev.data.script)     return String(ev.data.script)
    if (ev.data.violations) return (ev.data.violations as string[]).join(', ')
    if (ev.data.fixed)      return (ev.data.fixed as string[]).join(', ')
    if (ev.data.message)    return String(ev.data.message)
    return ''
  }

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-semibold text-zinc-300">Generating Resumes</h3>

      {queue.map(jobId => {
        const jp = progress.get(jobId)
        const r  = ratings.get(jobId) ?? { rating: 0, note: '', submitted: false }

        return (
          <div key={jobId} className="border-t border-zinc-800 pt-3 space-y-1">
            <p className="text-xs font-mono text-zinc-400">{jobId}</p>

            {jp?.stages.map(ev => (
              <div key={`${ev.stage}-${ev.status}`} className="flex gap-2 text-xs items-start">
                {stageIcon(ev.status)}
                <span className="text-zinc-400 w-24 shrink-0">{ev.stage}</span>
                <span className="text-zinc-500 truncate max-w-xs">{stageSummary(ev)}</span>
              </div>
            ))}

            {jp?.docPath && (
              <a
                href={`/api/generate/${jobId}/download`}
                className="inline-block mt-1 text-xs text-indigo-400 hover:text-indigo-300"
                download
              >
                ↓ Download DOCX
              </a>
            )}

            {jp?.done && !r.submitted && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-zinc-500">Rate:</span>
                {([1, 2, 3] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setRatings(prev => new Map(prev).set(jobId, { ...r, rating: n }))}
                    className={`text-xs px-2 py-0.5 rounded border ${
                      r.rating === n
                        ? 'border-indigo-500 text-indigo-400'
                        : 'border-zinc-700 text-zinc-500'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <input
                  value={r.note}
                  onChange={e =>
                    setRatings(prev => new Map(prev).set(jobId, { ...r, note: e.target.value }))
                  }
                  placeholder="note…"
                  className="flex-1 text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-zinc-300"
                />
                <button
                  onClick={() => void submitRating(jobId)}
                  disabled={r.rating === 0}
                  className="text-xs px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 rounded disabled:opacity-40"
                >
                  Submit
                </button>
              </div>
            )}

            {r.submitted && (
              <p className="text-xs text-green-400 mt-1">Feedback saved ✓</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
