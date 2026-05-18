'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/Skeleton'
import type { editor as MonacoEditorNS } from 'monaco-editor'
import { parse as jsonSourceMap } from 'json-source-map'
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

// ── Types ─────────────────────────────────────────────────────────────────────

interface Profile {
  id: string
  name: string
  is_active: number
  created_at: string
}

// ── Char-limit bullet preview ─────────────────────────────────────────────────

const MAX_BULLET = 116

function charColor(len: number): string {
  if (len > MAX_BULLET) return 'border-red-500 text-red-300 bg-red-950/20'
  if (len > 100)        return 'border-amber-500 text-amber-200 bg-amber-950/10'
  return 'border-zinc-700 text-zinc-300'
}

function BulletsPreview({ json, onJump }: { json: string; onJump?: (path: string) => void }) {
  let parsed: {
    experience?: Array<{ id: string; bullets: Record<string, string[]> }>
    projects?:   Array<{ id: string; name?: string; bullets: string[] }>
  } | null = null

  try { parsed = JSON.parse(json) } catch { /* ignore parse errors */ }

  if (!parsed) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-400 text-xs font-mono px-4">
        Invalid JSON — fix syntax errors to see preview
      </div>
    )
  }

  const experience = parsed.experience ?? []
  const projects   = parsed.projects ?? []

  // skills structure: string[] | Record<string,string> | Record<string, Record<string,string>>
  const rawSkills = (parsed as Record<string, unknown>).skills ?? []
  type SkillRow = { variant?: string; label: string; value: string }
  const skillRows: SkillRow[] = (() => {
    if (Array.isArray(rawSkills)) {
      return (rawSkills as unknown[]).map((v, i) =>
        typeof v === 'string'
          ? { label: `row ${i}`, value: v }
          : { label: `row ${i}`, value: JSON.stringify(v) }
      )
    }
    if (typeof rawSkills !== 'object' || rawSkills === null) return []
    const rows: SkillRow[] = []
    for (const [k, v] of Object.entries(rawSkills as Record<string, unknown>)) {
      if (typeof v === 'string') {
        rows.push({ label: k, value: v })
      } else if (typeof v === 'object' && v !== null) {
        for (const [cat, val] of Object.entries(v as Record<string, unknown>)) {
          rows.push({ variant: k, label: cat, value: typeof val === 'string' ? val : JSON.stringify(val) })
        }
      }
    }
    return rows
  })()

  const allEmpty = experience.length === 0 && projects.length === 0 && skillRows.length === 0

  if (allEmpty) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-400 text-xs font-mono px-4">
        No entries found. Expected: experience[], projects[], skills[]
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 text-xs font-mono">
      {experience.length > 0 && (
        <section>
          <p className="text-zinc-500 uppercase tracking-widest text-2xs mb-2">Work</p>
          {experience.map((exp, ei) => (
            <div key={exp.id} className="mb-3">
              <p
                className="text-indigo-400 mb-1 cursor-pointer hover:text-indigo-300"
                onClick={() => onJump?.(`/experience/${ei}`)}
                title="Jump to JSON"
              >{exp.id}</p>
              {Object.entries(exp.bullets).map(([variant, bullets]) => (
                <div key={variant} className="mb-2 ml-2">
                  <p className="text-zinc-400 text-2xs mb-1">[{variant}]</p>
                  {(bullets as string[]).map((b, bi) => {
                    const len = b.length
                    return (
                      <div
                        key={bi}
                        className={`flex items-start gap-2 border-l-2 pl-2 py-0.5 mb-0.5 cursor-pointer hover:opacity-80 ${charColor(len)}`}
                        onClick={() => onJump?.(`/experience/${ei}/bullets/${variant}/${bi}`)}
                        title="Jump to JSON"
                      >
                        <span className="flex-1 leading-relaxed">{b}</span>
                        <span className={`shrink-0 tabular-nums text-2xs ${len > MAX_BULLET ? 'text-red-400 font-bold' : len > 100 ? 'text-amber-500' : 'text-zinc-400'}`}>
                          {len}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {projects.length > 0 && (
        <section>
          <p className="text-zinc-500 uppercase tracking-widest text-2xs mb-2">Projects</p>
          {projects.map((proj, pi) => (
            <div key={proj.id} className="mb-3">
              <p
                className="text-indigo-400 mb-1 cursor-pointer hover:text-indigo-300"
                onClick={() => onJump?.(`/projects/${pi}`)}
                title="Jump to JSON"
              >{proj.name ?? proj.id}</p>
              {(proj.bullets ?? []).map((b, bi) => {
                const len = b.length
                return (
                  <div
                    key={bi}
                    className={`flex items-start gap-2 border-l-2 pl-2 py-0.5 mb-0.5 cursor-pointer hover:opacity-80 ${charColor(len)}`}
                    onClick={() => onJump?.(`/projects/${pi}/bullets/${bi}`)}
                    title="Jump to JSON"
                  >
                    <span className="flex-1 leading-relaxed">{b}</span>
                    <span className={`shrink-0 tabular-nums text-2xs ${len > MAX_BULLET ? 'text-red-400 font-bold' : len > 100 ? 'text-amber-500' : 'text-zinc-400'}`}>
                      {len}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </section>
      )}

      {skillRows.length > 0 && (
        <section>
          <p className="text-zinc-500 uppercase tracking-widest text-2xs mb-2">Skills</p>
          {skillRows.map((row, si) => (
            <div
              key={si}
              className={`flex items-start gap-2 border-l-2 pl-2 py-0.5 mb-0.5 ${charColor(row.value.length)}`}
            >
              <span className="flex-1 leading-relaxed">
                {row.variant && <span className="text-zinc-500 mr-1">[{row.variant}]</span>}
                <span className="text-zinc-400 mr-1">{row.label}:</span>
                {row.value}
              </span>
              <span className="shrink-0 text-zinc-400 text-2xs">{row.value.length}</span>
            </div>
          ))}
        </section>
      )}

      <p className="text-zinc-500 text-2xs pt-2 border-t border-zinc-800">
        ● {MAX_BULLET} char max · red = over · amber = 100–116 · counts live-update
      </p>
    </div>
  )
}

// ── Diff helpers (reused from earlier implementation) ─────────────────────────

type DiffLine = { type: 'same' | 'del' | 'add'; text: string }

function computeDiff(current: string, backup: string): DiffLine[] {
  const a = current.split('\n')
  const b = backup.split('\n')
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: DiffLine[] = []
  let i = 0, j = 0
  while (i < m || j < n) {
    if (i < m && j < n && a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i++; j++ }
    else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) { out.push({ type: 'add', text: b[j] }); j++ }
    else { out.push({ type: 'del', text: a[i] }); i++ }
  }
  return out
}

function collapseContext(lines: DiffLine[], ctx = 3): (DiffLine | { type: 'ellipsis'; count: number })[] {
  const changedIdx = lines.reduce<number[]>((acc, l, i) => { if (l.type !== 'same') acc.push(i); return acc }, [])
  const visibleArr: number[] = []
  for (const idx of changedIdx)
    for (let k = Math.max(0, idx - ctx); k <= Math.min(lines.length - 1, idx + ctx); k++)
      if (!visibleArr.includes(k)) visibleArr.push(k)
  visibleArr.sort((a, b) => a - b)
  const out: (DiffLine | { type: 'ellipsis'; count: number })[] = []
  let prev = -1
  for (const idx of visibleArr) {
    if (prev !== -1 && idx > prev + 1) out.push({ type: 'ellipsis', count: idx - prev - 1 })
    out.push(lines[idx])
    prev = idx
  }
  if (visibleArr.length === 0) out.push({ type: 'ellipsis', count: lines.length })
  return out
}

function DiffView({ current, backup, onRestore, onClose }: {
  current: string; backup: string; onRestore: () => void; onClose: () => void
}) {
  const lines = computeDiff(current, backup)
  const collapsed = collapseContext(lines)
  const hasChanges = lines.some(l => l.type !== 'same')
  return (
    <div className="mt-3 border border-zinc-700 rounded bg-zinc-900">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700">
        <span className="text-xs text-zinc-400 font-mono">
          {hasChanges
            ? `${lines.filter(l => l.type === 'del').length} removed · ${lines.filter(l => l.type === 'add').length} restored`
            : 'No differences'}
        </span>
        <div className="flex gap-2">
          {hasChanges && (
            <button onClick={onRestore} className="text-xs px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded">
              Restore this version
            </button>
          )}
          <button onClick={onClose} className="text-xs px-2 py-1 text-zinc-500 hover:text-zinc-300">Close</button>
        </div>
      </div>
      <pre className="overflow-auto max-h-80 text-xs font-mono p-2 leading-5">
        {collapsed.map((l, idx) => {
          if (l.type === 'ellipsis') return <div key={idx} className="text-zinc-400 px-1 select-none">··· {l.count} unchanged {l.count === 1 ? 'line' : 'lines'} ···</div>
          const colors: Record<string, string> = { same: 'text-zinc-500', del: 'bg-red-950/60 text-red-300', add: 'bg-green-950/60 text-green-300' }
          const prefix = l.type === 'del' ? '− ' : l.type === 'add' ? '+ ' : '  '
          return <div key={idx} className={`px-1 whitespace-pre ${colors[l.type]}`}>{prefix}{l.text}</div>
        })}
      </pre>
    </div>
  )
}

// ── Backup panel ──────────────────────────────────────────────────────────────

interface Backup { name: string; ts: string }

function BackupPanel({ file, currentContent, onRestored }: {
  file: string; currentContent: string; onRestored: () => void
}) {
  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(false)
  const [diffTarget, setDiffTarget] = useState<{ name: string; content: string } | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/config/backups?file=${file}`)
      .then(r => r.json())
      .then(d => setBackups(d.backups ?? []))
      .finally(() => setLoading(false))
  }, [file])

  const viewDiff = async (bak: Backup) => {
    if (diffTarget?.name === bak.name) { setDiffTarget(null); return }
    const r = await fetch(`/api/config/backups?file=${file}&name=${encodeURIComponent(bak.name)}`)
    const d = await r.json()
    setDiffTarget({ name: bak.name, content: d.content ?? '' })
  }

  const restore = async () => {
    if (!diffTarget) return
    setRestoring(true)
    const r = await fetch('/api/config/backups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, name: diffTarget.name }),
    })
    if (r.ok) { setStatus('Restored'); setDiffTarget(null); onRestored() }
    else { const d = await r.json(); setStatus(`Error: ${d.error}`) }
    setRestoring(false)
    setTimeout(() => setStatus(''), 3000)
  }

  const fmtTs = (ts: string) => ts.replace('T', ' ').replace(/-(\d{2})-(\d{2})$/, ':$1:$2')

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-950 p-3 space-y-1">
      {status && <p className="text-xs text-amber-400 mb-2">{status}</p>}
      <p className="text-xs text-zinc-400 mb-2">Click a backup to diff. Restore saves current first.</p>
      {loading && <p className="text-xs text-zinc-400">Loading…</p>}
      {!loading && backups.length === 0 && <p className="text-xs text-zinc-400">No backups yet.</p>}
      {backups.map(bak => (
        <div key={bak.name}>
          <button
            onClick={() => void viewDiff(bak)}
            className={`w-full text-left text-xs px-2 py-1.5 rounded font-mono transition-colors ${diffTarget?.name === bak.name ? 'bg-zinc-700 text-zinc-200' : 'hover:bg-zinc-800 text-zinc-400'}`}
          >
            {fmtTs(bak.ts)}
          </button>
          {diffTarget?.name === bak.name && (
            <DiffView
              current={currentContent}
              backup={diffTarget.content}
              onRestore={() => void restore()}
              onClose={() => setDiffTarget(null)}
            />
          )}
        </div>
      ))}
      {restoring && <p className="text-xs text-zinc-500 mt-1">Restoring…</p>}
    </div>
  )
}

// ── Candidate profile summary card ───────────────────────────────────────────

interface CandidateProfile {
  narrative?: string
  self_assessment?: {
    portrays_well?: string[]
    known_gaps?: string[]
    not_this?: string[]
  }
  target_posture?: {
    primary_roles?: string[]
    secondary_roles?: string[]
    auth_urgency?: string
    constraints?: string[]
  }
}

function CandidateProfileCard({ json, onEdit }: { json: string; onEdit?: () => void }) {
  let profile: CandidateProfile | null = null
  try {
    const parsed = JSON.parse(json)
    profile = parsed.candidate_profile ?? null
  } catch { /* ignore */ }

  if (!profile) return null

  return (
    <div className="border border-zinc-700 rounded-lg bg-zinc-900/60 p-4 space-y-4 text-xs font-mono">
      <div className="flex items-center justify-between">
        <span className="text-2xs text-zinc-500 uppercase tracking-widest">Candidate Profile</span>
        <button
          onClick={onEdit}
          className="text-2xs text-indigo-500 hover:text-indigo-300"
        >
          edit ↗
        </button>
      </div>

      {profile.narrative && (
        <p className="text-zinc-300 leading-relaxed text-[0.6875rem]">{profile.narrative}</p>
      )}

      <div className="grid grid-cols-3 gap-4">
        {profile.self_assessment?.portrays_well && profile.self_assessment.portrays_well.length > 0 && (
          <div className="space-y-1">
            <p className="text-2xs text-green-500 uppercase tracking-widest mb-1">Portrays well</p>
            {profile.self_assessment.portrays_well.map((s, i) => (
              <p key={i} className="text-zinc-400 leading-snug">· {s}</p>
            ))}
          </div>
        )}

        {profile.self_assessment?.known_gaps && profile.self_assessment.known_gaps.length > 0 && (
          <div className="space-y-1">
            <p className="text-2xs text-amber-500 uppercase tracking-widest mb-1">Known gaps</p>
            {profile.self_assessment.known_gaps.map((s, i) => (
              <p key={i} className="text-zinc-400 leading-snug">· {s}</p>
            ))}
          </div>
        )}

        {profile.self_assessment?.not_this && profile.self_assessment.not_this.length > 0 && (
          <div className="space-y-1">
            <p className="text-2xs text-red-500 uppercase tracking-widest mb-1">Not this</p>
            {profile.self_assessment.not_this.map((s, i) => (
              <p key={i} className="text-zinc-400 leading-snug">· {s}</p>
            ))}
          </div>
        )}
      </div>

      {profile.target_posture && (
        <div className="border-t border-zinc-800 pt-3 grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-2xs text-indigo-400 uppercase tracking-widest mb-1">Primary roles</p>
            {(profile.target_posture.primary_roles ?? []).map((r, i) => (
              <p key={i} className="text-zinc-300">· {r}</p>
            ))}
            {(profile.target_posture.secondary_roles ?? []).length > 0 && (
              <>
                <p className="text-2xs text-zinc-400 uppercase tracking-widest mt-2 mb-1">Secondary</p>
                {profile.target_posture.secondary_roles!.map((r, i) => (
                  <p key={i} className="text-zinc-500">· {r}</p>
                ))}
              </>
            )}
          </div>
          <div className="space-y-2">
            {profile.target_posture.auth_urgency && (
              <div>
                <p className="text-2xs text-zinc-500 uppercase tracking-widest mb-1">Work auth</p>
                <p className="text-zinc-400 leading-snug">{profile.target_posture.auth_urgency}</p>
              </div>
            )}
            {(profile.target_posture.constraints ?? []).length > 0 && (
              <div>
                <p className="text-2xs text-zinc-500 uppercase tracking-widest mb-1">Constraints</p>
                {profile.target_posture.constraints!.map((c, i) => (
                  <p key={i} className="text-zinc-400 leading-snug">· {c}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Two-panel Monaco editor (JSON + bullets preview) ─────────────────────────

function ProfileEditor({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [, setContent]            = useState('')
  const [draft, setDraft]         = useState('')
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [status, setStatus]       = useState('')
  const [showBackups, setShowBackups] = useState(false)

  const [showProfileSummaryEditor, setShowProfileSummaryEditor] = useState(false)
  const [profileSummaryDraft, setProfileSummaryDraft] = useState('')
  const [profileSummaryError, setProfileSummaryError] = useState('')

  const profileEditorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null)

  // Rebuild source map whenever draft changes — used for preview → Monaco jumps
  const sourceMap = useMemo(() => {
    try { return jsonSourceMap(draft) } catch { return null }
  }, [draft])

  const onProfileEditorMount = useCallback((ed: MonacoEditorNS.IStandaloneCodeEditor) => {
    profileEditorRef.current = ed
  }, [])

  const jumpToJsonPath = useCallback((path: string) => {
    const ed = profileEditorRef.current
    if (!ed || !sourceMap) return
    const pointer = sourceMap.pointers[path]
    if (!pointer) return
    const line   = pointer.value.line + 1   // json-source-map is 0-indexed
    const column = pointer.value.column + 1
    ed.setPosition({ lineNumber: line, column })
    ed.revealLineInCenter(line)
    ed.focus()
  }, [sourceMap])

  const openProfileSummaryEditor = useCallback(() => {
    try {
      const parsed = JSON.parse(draft)
      setProfileSummaryDraft(JSON.stringify(parsed.candidate_profile ?? {}, null, 2))
    } catch {
      setProfileSummaryDraft('{}')
    }
    setProfileSummaryError('')
    setShowProfileSummaryEditor(v => !v)
  }, [draft])

  const applyProfileSummaryEdit = useCallback(() => {
    try {
      const updated = JSON.parse(profileSummaryDraft)
      const parsed  = JSON.parse(draft)
      parsed.candidate_profile = updated
      setDraft(JSON.stringify(parsed, null, 2))
      setShowProfileSummaryEditor(false)
      setProfileSummaryError('')
    } catch {
      setProfileSummaryError('Invalid JSON — fix before applying')
    }
  }, [profileSummaryDraft, draft])

  const loadContent = useCallback(() => {
    setLoading(true)
    fetch(`/api/profiles/${profile.id}`)
      .then(r => r.json())
      .then(d => { setContent(d.data ?? ''); setDraft(d.data ?? '') })
      .finally(() => setLoading(false))
  }, [profile.id])

  useEffect(() => { loadContent() }, [loadContent])

  const save = async () => {
    setSaving(true); setStatus('')
    const res = await fetch(`/api/profiles/${profile.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: draft }),
    })
    const d = await res.json()
    if (res.ok) { setContent(draft); setStatus('Saved'); onSaved() }
    else setStatus(`Error: ${d.error}`)
    setSaving(false)
    setTimeout(() => setStatus(''), 3000)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-zinc-300 font-mono">{profile.name}</h3>
        </div>
        <div className="flex items-center gap-2">
          {status && <span className={`text-xs ${status.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{status}</span>}
          <button
            onClick={() => setShowBackups(v => !v)}
            className={`text-xs px-2 py-1 rounded border transition-colors ${showBackups ? 'border-amber-500 text-amber-400' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}
          >
            Backups
          </button>
          <button
            onClick={() => void save()}
            disabled={saving || loading}
            className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {showBackups && (
        <BackupPanel
          file="master_resume_data.json"
          currentContent={draft}
          onRestored={() => { loadContent(); setShowBackups(false) }}
        />
      )}

      <CandidateProfileCard json={draft} onEdit={openProfileSummaryEditor} />

      {showProfileSummaryEditor && (
        <div className="border border-indigo-700/60 rounded-lg overflow-hidden bg-zinc-950">
          <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/80 border-b border-zinc-700">
            <span className="text-2xs text-indigo-400 uppercase tracking-widest font-mono">candidate_profile</span>
            <div className="flex items-center gap-2">
              {profileSummaryError && <span className="text-xs text-red-400">{profileSummaryError}</span>}
              <button
                onClick={applyProfileSummaryEdit}
                className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 rounded"
              >Apply</button>
              <button
                onClick={() => setShowProfileSummaryEditor(false)}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >Cancel</button>
            </div>
          </div>
          <textarea
            value={profileSummaryDraft}
            onChange={e => setProfileSummaryDraft(e.target.value)}
            spellCheck={false}
            rows={18}
            className="w-full bg-zinc-950 text-zinc-300 text-xs font-mono p-3 resize-y focus:outline-none"
          />
        </div>
      )}

      {/* Two-panel editor */}
      <div className="grid grid-cols-[3fr_2fr] gap-0 border border-zinc-700 rounded-lg overflow-hidden" style={{ height: 520 }}>
        {/* Monaco */}
        <div className="border-r border-zinc-700 flex flex-col min-h-0">
          <div className="px-3 py-1.5 bg-zinc-800 border-b border-zinc-700 flex items-center gap-2 shrink-0">
            <span className="text-2xs text-zinc-500 uppercase tracking-widest font-mono">Editor</span>
            <span className="ml-auto text-2xs text-zinc-400 font-mono">JSON</span>
          </div>
          {loading ? (
            <div className="flex-1 p-4 space-y-2 overflow-hidden">
              {Array.from({ length: 22 }).map((_, i) => (
                <Skeleton key={i} className={`h-3 ${
                  i % 5 === 0 ? 'w-2/3' :
                  i % 5 === 1 ? 'w-1/2' :
                  i % 5 === 2 ? 'w-3/4' :
                  i % 5 === 3 ? 'w-2/5' : 'w-full'
                }`} />
              ))}
            </div>
          ) : (
            <MonacoEditor
              height="100%"
              language="json"
              theme="vs-dark"
              value={draft}
              onChange={v => setDraft(v ?? '')}
              onMount={onProfileEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                tabSize: 2,
                fontFamily: 'JetBrains Mono, Fira Code, monospace',
              }}
            />
          )}
        </div>

        {/* Bullets preview */}
        <div className="flex flex-col bg-zinc-950 min-h-0">
          <div className="relative px-3 py-1.5 bg-zinc-800 border-b border-zinc-700 flex items-center gap-2 shrink-0">
            <span className="text-2xs text-zinc-500 uppercase tracking-widest font-mono">Bullets</span>
            <span className="ml-auto text-2xs text-zinc-400 font-mono">live</span>
          </div>
          <BulletsPreview json={draft} onJump={jumpToJsonPath} />
        </div>
      </div>
    </div>
  )
}

// ── Profile switcher bar ──────────────────────────────────────────────────────

function ProfileBar({ profiles, activeId, onSwitch, onFork, onUpload, onDelete, onRename }: {
  profiles: Profile[]
  activeId: string | null
  onSwitch: (id: string) => void
  onFork: () => void
  onUpload: () => void
  onDelete: () => void
  onRename: (id: string, name: string) => void
}) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const active = profiles.find(p => p.id === activeId) ?? profiles[0]

  const startRename = (p: Profile) => { setRenaming(p.id); setNameDraft(p.name) }

  const commitRename = async () => {
    if (!renaming || !nameDraft.trim()) { setRenaming(null); return }
    await onRename(renaming, nameDraft.trim())
    setRenaming(null)
  }

  if (profiles.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-zinc-800/60 border border-zinc-700 rounded-lg">
        <span className="text-xs text-zinc-500">No profiles yet.</span>
        <button onClick={onUpload} className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded">
          Import from disk
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-zinc-800/40 border border-zinc-700 rounded-lg">
      {/* Profile selector */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-xs text-zinc-500 shrink-0">Profile</span>
        {renaming === activeId ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={e => { if (e.key === 'Enter') void commitRename(); if (e.key === 'Escape') setRenaming(null) }}
            className="text-sm font-medium bg-zinc-700 border border-zinc-500 rounded px-2 py-0.5 text-zinc-200 focus:outline-none focus:border-indigo-500 w-48"
          />
        ) : (
          <select
            value={activeId ?? ''}
            onChange={e => onSwitch(e.target.value)}
            className="text-sm font-medium bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-zinc-200 cursor-pointer focus:outline-none focus:border-indigo-500"
          >
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        {active && renaming !== activeId && (
          <button
            onClick={() => startRename(active)}
            className="text-xs text-zinc-400 hover:text-zinc-400"
            title="Rename"
          >
            ✎
          </button>
        )}
        {active?.is_active === 1 && (
          <span className="text-2xs px-1.5 py-0.5 bg-indigo-900/60 border border-indigo-700/50 text-indigo-300 rounded font-mono">
            active
          </span>
        )}
        {active && active.is_active !== 1 && (
          <button
            onClick={() => onSwitch(active.id)}
            className="text-2xs px-2 py-0.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-400 rounded"
          >
            Set active
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onFork}
          className="text-xs px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded transition-colors"
          title="Fork from active"
        >
          Fork
        </button>
        <button
          onClick={onUpload}
          className="text-xs px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded transition-colors"
          title="Upload JSON file"
        >
          ↑ Upload
        </button>
        {profiles.length > 1 && (
          <button
            onClick={onDelete}
            className="text-xs px-2.5 py-1 bg-zinc-800 hover:bg-red-900/40 border border-zinc-700 hover:border-red-700/50 text-zinc-500 hover:text-red-400 rounded transition-colors"
            title="Delete this profile"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

// ── Fork modal ────────────────────────────────────────────────────────────────

function ForkModal({ onConfirm, onCancel }: { onConfirm: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 w-80 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-zinc-200">Fork profile</h3>
        <input
          ref={ref}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onConfirm(name.trim()); if (e.key === 'Escape') onCancel() }}
          placeholder="New profile name…"
          className="w-full text-sm bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="text-xs px-3 py-1.5 text-zinc-500 hover:text-zinc-300">Cancel</button>
          <button
            onClick={() => { if (name.trim()) onConfirm(name.trim()) }}
            disabled={!name.trim()}
            className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded disabled:opacity-40"
          >
            Fork
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConfigPage() {
  const [profiles, setProfiles]       = useState<Profile[]>([])
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [profilesLoading, setProfilesLoading] = useState(true)
  const [forkModal, setForkModal]     = useState(false)
  const [status, setStatus]           = useState('')
  const uploadRef                     = useRef<HTMLInputElement>(null)

  const loadProfiles = useCallback(async () => {
    const r = await fetch('/api/profiles')
    const d = await r.json() as { profiles: Profile[] }
    setProfiles(d.profiles ?? [])
    const active = d.profiles?.find((p: Profile) => p.is_active === 1)
    setSelectedId(prev => prev ?? active?.id ?? d.profiles?.[0]?.id ?? null)
    setProfilesLoading(false)
  }, [])

  useEffect(() => { void loadProfiles() }, [loadProfiles])

  // If no profiles exist yet, auto-create one seeded from disk
  useEffect(() => {
    if (!profilesLoading && profiles.length === 0) {
      fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Default' }),
      }).then(() => loadProfiles())
    }
  }, [profilesLoading, profiles.length, loadProfiles])

  const handleSwitch = async (id: string) => {
    setSelectedId(id)
    await fetch(`/api/profiles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ set_active: true }),
    })
    await loadProfiles()
  }

  const handleFork = () => setForkModal(true)

  const confirmFork = async (name: string) => {
    setForkModal(false)
    if (!selectedId) return
    const r = await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, fork_from: selectedId }),
    })
    const d = await r.json()
    await loadProfiles()
    if (d.id) setSelectedId(d.id)
  }

  const handleUpload = () => uploadRef.current?.click()

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    try { JSON.parse(text) } catch { setStatus('Invalid JSON — file rejected'); setTimeout(() => setStatus(''), 3000); return }
    const name = file.name.replace(/\.json$/i, '')
    const r = await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, data: text }),
    })
    const d = await r.json()
    await loadProfiles()
    if (d.id) setSelectedId(d.id)
    e.target.value = ''
  }

  const handleDelete = async () => {
    if (!selectedId || profiles.length <= 1) return
    if (!confirm('Delete this profile? This cannot be undone.')) return
    await fetch(`/api/profiles/${selectedId}`, { method: 'DELETE' })
    await loadProfiles()
    const remaining = profiles.filter(p => p.id !== selectedId)
    setSelectedId(remaining[0]?.id ?? null)
  }

  const handleRename = async (id: string, name: string) => {
    await fetch(`/api/profiles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    await loadProfiles()
  }

  const selectedProfile = profiles.find(p => p.id === selectedId) ?? null

  return (
    <div className="space-y-8 p-6 max-w-[1400px] mx-auto">
      {forkModal && selectedId && (
        <ForkModal onConfirm={confirmFork} onCancel={() => setForkModal(false)} />
      )}
      <input ref={uploadRef} type="file" accept=".json" className="hidden" onChange={onFileSelected} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Config</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Edit resume profiles. Monaco editor · live bullets preview · timestamped backups.
          </p>
        </div>
        {status && <span className="text-xs text-red-400">{status}</span>}
      </div>

      {/* Profile section */}
      <div className="space-y-4">
        <div className="relative inline-block">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Resume Profile</h2>
        </div>
        {profilesLoading ? (
          <div className="text-zinc-500 text-sm">Loading profiles…</div>
        ) : (
          <>
            <ProfileBar
              profiles={profiles}
              activeId={selectedId}
              onSwitch={handleSwitch}
              onFork={handleFork}
              onUpload={handleUpload}
              onDelete={handleDelete}
              onRename={handleRename}
            />
            {selectedProfile && (
              <ProfileEditor
                key={selectedProfile.id}
                profile={selectedProfile}
                onSaved={loadProfiles}
              />
            )}
          </>
        )}
      </div>

    </div>
  )
}
