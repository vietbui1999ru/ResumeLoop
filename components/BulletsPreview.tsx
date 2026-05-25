'use client'

import { useState, useRef } from 'react'
import { toBulletsMarkdown } from '@/lib/bullets-md'
import { validateBulletsJson } from '@/lib/bullets-validate'
import { MAX_BULLET_CHARS as MAX_BULLET, AMBER_BULLET_CHARS, COPY_FLASH_MS } from '@/lib/config'

export function charColor(len: number): string {
  if (len > MAX_BULLET) return 'border-red-500 text-red-300 bg-red-950/20'
  if (len > AMBER_BULLET_CHARS) return 'border-amber-500 text-amber-200 bg-amber-950/10'
  return 'border-zinc-700 text-zinc-300'
}

type Tab = 'rendered' | 'markdown' | 'json'

export function BulletsPreview({
  json,
  profileId,
  onSaved,
  onJump,
}: {
  json: string
  profileId?: string
  onSaved?: () => void
  onJump?: (path: string) => void
}) {
  const [tab, setTab] = useState<Tab>('rendered')
  const [draft, setDraft] = useState(json)
  const [saving, setSaving] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [flashOk, setFlashOk] = useState(false)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep draft in sync when json prop changes externally (e.g. after loadProfile)
  // but only if JSON tab is not dirty (user hasn't made edits)
  const lastSavedJson = useRef(json)
  if (json !== lastSavedJson.current && draft === lastSavedJson.current) {
    lastSavedJson.current = json
    setDraft(json)
  }

  async function handleSave() {
    if (saving || !profileId) return

    setClientError(null)
    setServerError(null)

    const syntaxErr = validateBulletsJson(draft)
    if (syntaxErr) {
      setClientError(syntaxErr)
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/profiles/${profileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: draft }),
      })
      const payload = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) {
        setServerError(payload.error ?? `Error ${res.status}`)
        return
      }
      lastSavedJson.current = draft
      if (flashTimer.current) clearTimeout(flashTimer.current)
      setFlashOk(true)
      flashTimer.current = setTimeout(() => setFlashOk(false), COPY_FLASH_MS)
      onSaved?.()
    } catch {
      setServerError('Network error — check your connection')
    } finally {
      setSaving(false)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'rendered', label: 'Rendered' },
    { id: 'markdown', label: 'Markdown' },
    { id: 'json',     label: 'JSON' },
  ]

  let parsed: {
    experience?: Array<{ id: string; bullets: Record<string, string[]> }>
    projects?:   Array<{ id: string; name?: string; bullets: string[] }>
  } | null = null
  try { parsed = JSON.parse(json) } catch { /* ignore */ }

  const experience = parsed?.experience ?? []
  const projects   = parsed?.projects ?? []

  const rawSkills = (parsed as Record<string, unknown> | null)?.skills ?? []
  type SkillRow = { variant?: string; label: string; value: string }
  const skillRows: SkillRow[] = (() => {
    if (Array.isArray(rawSkills)) {
      return (rawSkills as unknown[]).map((v, i) =>
        typeof v === 'string' ? { label: `row ${i}`, value: v } : { label: `row ${i}`, value: JSON.stringify(v) }
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

  const jumpable = onJump != null
  const itemCls = (len: number) =>
    `flex items-start gap-2 border-l-2 pl-2 py-0.5 mb-0.5 ${charColor(len)} ${jumpable ? 'cursor-pointer hover:opacity-80' : ''}`

  return (
    <div className="flex flex-col h-full" data-testid="bullets-preview">
      {/* Tab bar */}
      <div className="flex border-b border-zinc-800 shrink-0" role="tablist" aria-label="Bullets view">
        {tabs.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-mono transition-colors ${
              tab === t.id
                ? 'text-indigo-300 border-b-2 border-indigo-400 -mb-px'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Rendered tab */}
      {tab === 'rendered' && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 text-xs font-mono">
          {!parsed && (
            <div className="flex-1 flex items-center justify-center text-zinc-400 text-xs font-mono px-4">
              {json ? 'Invalid JSON — fix syntax errors to see preview' : 'No profile loaded'}
            </div>
          )}

          {parsed && experience.length === 0 && projects.length === 0 && skillRows.length === 0 && (
            <div className="text-zinc-400 text-xs font-mono px-4">
              No entries found. Expected: experience[], projects[], skills[]
            </div>
          )}

          {experience.length > 0 && (
            <section>
              <p className="text-zinc-500 uppercase tracking-widest text-2xs mb-2">Work</p>
              {experience.map((exp, ei) => (
                <div key={exp.id} className="mb-3">
                  <p
                    className={`text-indigo-400 mb-1 ${jumpable ? 'cursor-pointer hover:text-indigo-300' : ''}`}
                    onClick={() => onJump?.(`/experience/${ei}`)}
                  >{exp.id}</p>
                  {Object.entries(exp.bullets).map(([variant, bullets]) => (
                    <div key={variant} className="mb-2 ml-2">
                      <p className="text-zinc-400 text-2xs mb-1">[{variant}]</p>
                      {(bullets as string[]).map((b, bi) => {
                        const len = b.length
                        return (
                          <div key={bi} className={itemCls(len)} onClick={() => onJump?.(`/experience/${ei}/bullets/${variant}/${bi}`)}>
                            <span className="flex-1 leading-relaxed">{b}</span>
                            <span className={`shrink-0 tabular-nums text-2xs ${len > MAX_BULLET ? 'text-red-400 font-bold' : len > AMBER_BULLET_CHARS ? 'text-amber-500' : 'text-zinc-400'}`}>{len}</span>
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
                    className={`text-indigo-400 mb-1 ${jumpable ? 'cursor-pointer hover:text-indigo-300' : ''}`}
                    onClick={() => onJump?.(`/projects/${pi}`)}
                  >{proj.name ?? proj.id}</p>
                  {(proj.bullets ?? []).map((b, bi) => {
                    const len = b.length
                    return (
                      <div key={bi} className={itemCls(len)} onClick={() => onJump?.(`/projects/${pi}/bullets/${bi}`)}>
                        <span className="flex-1 leading-relaxed">{b}</span>
                        <span className={`shrink-0 tabular-nums text-2xs ${len > MAX_BULLET ? 'text-red-400 font-bold' : len > AMBER_BULLET_CHARS ? 'text-amber-500' : 'text-zinc-400'}`}>{len}</span>
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
                <div key={si} className={`flex items-start gap-2 border-l-2 pl-2 py-0.5 mb-0.5 ${charColor(row.value.length)}`}>
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
            ● {MAX_BULLET} char max · red = over · amber = 100–116
          </p>
        </div>
      )}

      {/* Markdown tab */}
      {tab === 'markdown' && (
        <div className="flex-1 overflow-y-auto px-4 py-4 text-xs font-mono text-zinc-300 whitespace-pre-wrap" data-testid="markdown-content">
          {toBulletsMarkdown(json) || <span className="text-zinc-500">No bullets to display</span>}
        </div>
      )}

      {/* JSON tab */}
      {tab === 'json' && (
        <div className="flex flex-col flex-1 min-h-0 px-4 py-4 gap-2">
          <textarea
            data-testid="json-textarea"
            className="flex-1 resize-none bg-zinc-900 border border-zinc-700 rounded text-xs font-mono text-zinc-200 p-2 focus:outline-none focus:border-indigo-500"
            value={draft}
            onChange={e => {
              setDraft(e.target.value)
              setClientError(null)
              setServerError(null)
            }}
            spellCheck={false}
          />

          {clientError && (
            <p data-testid="client-error" className="text-red-400 text-xs font-mono whitespace-pre-wrap">{clientError}</p>
          )}
          {serverError && (
            <p data-testid="server-error" className="text-red-400 text-xs font-mono">{serverError}</p>
          )}

          <button
            data-testid="save-button"
            onClick={() => void handleSave()}
            disabled={saving || !profileId}
            className={`shrink-0 px-3 py-1.5 text-xs font-mono rounded transition-colors ${
              flashOk
                ? 'bg-green-700 text-green-100'
                : saving
                ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                : 'bg-indigo-700 hover:bg-indigo-600 text-white'
            } disabled:opacity-50`}
          >
            {flashOk ? 'Saved ✓' : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}
