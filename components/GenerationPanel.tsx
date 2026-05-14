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
  aborted: boolean
}

interface RatingState {
  rating: number
  note: string
  submitted: boolean
}

interface Props {
  queue: string[]
  sessionId: string
  onStageUpdate: (jobId: string, stage: string) => void
  onDone: (jobId: string) => void
  onError: (jobId: string, msg: string) => void
  minimized: boolean
  onMinimize: () => void
  onClose: () => void
}

export default function GenerationPanel({
  queue, sessionId,
  onStageUpdate, onDone, onError,
  minimized, onMinimize, onClose,
}: Props) {
  const [progress, setProgress] = useState<Map<string, JobProgress>>(new Map())
  const [ratings, setRatings]   = useState<Map<string, RatingState>>(new Map())
  // collapsed = done-success (auto) or user-toggled; expanded = in-progress or failed (default)
  const [collapsedJobs, setCollapsedJobs] = useState<Set<string>>(new Set())

  const startedRef      = useRef<Set<string>>(new Set())
  const abortFnsRef     = useRef<Map<string, () => void>>(new Map())
  const onDoneRef       = useRef(onDone)
  const onErrorRef      = useRef(onError)
  const onStageRef      = useRef(onStageUpdate)
  const onCloseRef      = useRef(onClose)

  useEffect(() => {
    onDoneRef.current  = onDone
    onErrorRef.current = onError
    onStageRef.current = onStageUpdate
    onCloseRef.current = onClose
  })

  // Detect new IDs appended to queue and start them
  useEffect(() => {
    const newIds = queue.filter(id => !startedRef.current.has(id))
    for (const id of newIds) {
      startedRef.current.add(id)
      void runJob(id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue])

  // Auto-close panel when all jobs are done
  useEffect(() => {
    if (queue.length === 0) return
    const allDone = queue.every(id => progress.get(id)?.done)
    if (!allDone) return
    const timer = setTimeout(() => onCloseRef.current(), 3000)
    return () => clearTimeout(timer)
  }, [progress, queue])

  function updateProgress(jobId: string, update: Partial<JobProgress>) {
    setProgress(prev => {
      const cur = prev.get(jobId) ?? {
        stages: [], outputId: null, docPath: null, done: false, failed: false, aborted: false,
      }
      return new Map(prev).set(jobId, { ...cur, ...update })
    })
  }

  async function runJob(jobId: string) {
    const evtSource = new EventSource(`/api/generate/${jobId}/stream?sessionId=${sessionId}`)

    abortFnsRef.current.set(jobId, () => {
      evtSource.close()
      updateProgress(jobId, { aborted: true, done: true })
      abortFnsRef.current.delete(jobId)
      onDoneRef.current(jobId)
    })

    await new Promise<void>(resolve => {
      evtSource.onmessage = (e) => {
        const event: SSEEvent = JSON.parse(e.data as string)

        setProgress(prev => {
          const cur = prev.get(jobId) ?? {
            stages: [], outputId: null, docPath: null, done: false, failed: false, aborted: false,
          }
          const filtered = cur.stages.filter(
            s => !(s.stage === event.stage && s.status === 'running')
          )
          return new Map(prev).set(jobId, { ...cur, stages: [...filtered, event] })
        })

        if (event.status === 'running') onStageRef.current(jobId, event.stage)

        if (event.stage === 'finalize' && event.status === 'ok') {
          updateProgress(jobId, { docPath: event.data.path as string })
        }

        if (event.stage === 'done') {
          updateProgress(jobId, { done: true, outputId: event.data.outputId as string })
          setCollapsedJobs(prev => new Set(prev).add(jobId))  // auto-collapse on success
          abortFnsRef.current.delete(jobId)
          onDoneRef.current(jobId)
          evtSource.close()
          resolve()
        }

        if (event.status === 'fail') {
          updateProgress(jobId, { failed: true, done: true })
          // stay expanded on failure — do NOT add to collapsedJobs
          abortFnsRef.current.delete(jobId)
          onErrorRef.current(jobId, (event.data.message as string) ?? event.stage)
          evtSource.close()
          resolve()
        }
      }

      evtSource.onerror = () => { evtSource.close(); resolve() }
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

  const runningCount = queue.filter(id => !progress.get(id)?.done).length
  const doneCount    = queue.filter(id => { const p = progress.get(id); return p?.done && !p.failed && !p.aborted }).length

  const stageIcon = (status: SSEEvent['status']) => {
    if (status === 'ok')   return <span className="text-green-400">✓</span>
    if (status === 'fail') return <span className="text-red-400">✗</span>
    return <span className="text-zinc-400 animate-spin inline-block">⟳</span>
  }

  const stageSummary = (ev: SSEEvent): string => {
    if (ev.data.tagline)    return `tagline: "${String(ev.data.tagline)}"`
    if (ev.data.script)     return String(ev.data.script)
    if (ev.data.violations) return (ev.data.violations as string[]).join(', ')
    if (ev.data.fixed)      return (ev.data.fixed as string[]).join(', ')
    if (ev.data.message)    return String(ev.data.message)
    return ''
  }

  const toggleCollapsed = (jobId: string) =>
    setCollapsedJobs(prev => {
      const next = new Set(prev)
      next.has(jobId) ? next.delete(jobId) : next.add(jobId)
      return next
    })

  // Minimized bar
  if (minimized) {
    return (
      <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2">
        <span className="text-sm text-zinc-300">
          {runningCount > 0
            ? <span className="flex items-center gap-1.5"><span className="text-indigo-400 animate-pulse">⟳</span>{runningCount} running</span>
            : <span className="text-green-400">✓ {doneCount} done</span>
          }
        </span>
        <span className="text-xs text-zinc-500">{queue.length} total</span>
        <button
          onClick={onMinimize}
          className="ml-auto text-xs text-zinc-400 hover:text-zinc-200 px-2 py-0.5 rounded border border-zinc-700 hover:border-zinc-500"
        >
          Expand
        </button>
        <button onClick={onClose} className="text-xs text-zinc-500 hover:text-red-400" title="Clear">✕</button>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden flex flex-col" style={{ maxHeight: '40vh' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 shrink-0">
        <h3 className="text-sm font-semibold text-zinc-300 flex-1">
          Resume Generation
          {runningCount > 0
            ? <span className="ml-2 text-xs text-indigo-400">{runningCount} running…</span>
            : <span className="ml-2 text-xs text-zinc-500">{doneCount}/{queue.length} done</span>
          }
        </h3>
        <button onClick={onMinimize} className="text-zinc-400 hover:text-zinc-200 w-5 h-5 text-sm leading-none" title="Minimize">—</button>
        <button onClick={onClose}    className="text-zinc-400 hover:text-red-400 w-5 h-5 text-sm leading-none" title="Clear">✕</button>
      </div>

      {/* Job list */}
      <div className="overflow-y-auto flex-1 px-3 py-2 space-y-2">
        {queue.map(jobId => {
          const jp = progress.get(jobId)
          const r  = ratings.get(jobId) ?? { rating: 0, note: '', submitted: false }
          const isCollapsed  = collapsedJobs.has(jobId)
          const isRunning    = !jp?.done
          const canAbort     = isRunning && abortFnsRef.current.has(jobId)

          let statusLine: React.ReactNode
          if (!jp || isRunning) {
            const curStage = jp?.stages.findLast(s => s.status === 'running')?.stage ?? 'queued'
            statusLine = <span className="text-zinc-400">⟳ {curStage}</span>
          } else if (jp.aborted) {
            statusLine = <span className="text-zinc-500">— aborted</span>
          } else if (jp.failed) {
            statusLine = <span className="text-red-400">✗ failed</span>
          } else {
            statusLine = <span className="text-green-400">✓ done</span>
          }

          return (
            <div key={jobId} className={`border border-zinc-800 rounded p-2.5 ${jp?.aborted ? 'opacity-50' : ''}`}>
              {/* Job header row */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleCollapsed(jobId)}
                  className="flex-1 min-w-0 text-left flex items-center gap-2 text-xs"
                >
                  <span className="shrink-0">{statusLine}</span>
                  <span className="text-zinc-600 font-mono truncate">{jobId.slice(0, 8)}</span>
                  <span className="text-zinc-600 ml-auto shrink-0">{isCollapsed ? '▼' : '▲'}</span>
                </button>

                {canAbort && (
                  <button
                    onClick={() => abortFnsRef.current.get(jobId)?.()}
                    className="text-xs px-2 py-0.5 border border-red-800 text-red-400 hover:bg-red-900/30 rounded shrink-0"
                  >
                    Abort
                  </button>
                )}

                {jp?.docPath && (
                  <a
                    href={`/api/generate/${jobId}/download`}
                    className="text-xs text-indigo-400 hover:text-indigo-300 shrink-0"
                    download
                  >
                    ↓ DOCX
                  </a>
                )}
              </div>

              {/* Stage log — hidden when collapsed */}
              {!isCollapsed && jp?.stages && jp.stages.length > 0 && (
                <div className="mt-2 space-y-0.5 border-t border-zinc-800 pt-2">
                  {jp.stages.map(ev => (
                    <div key={`${ev.stage}-${ev.status}`} className="flex gap-2 text-xs items-start">
                      {stageIcon(ev.status)}
                      <span className="text-zinc-400 w-24 shrink-0">{ev.stage}</span>
                      <span className="text-zinc-500 truncate max-w-xs">{stageSummary(ev)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Rating row */}
              {jp?.done && !jp.failed && !jp.aborted && !r.submitted && (
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
                    onChange={e => setRatings(prev => new Map(prev).set(jobId, { ...r, note: e.target.value }))}
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

              {r.submitted && <p className="text-xs text-green-400 mt-1">Feedback saved ✓</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
