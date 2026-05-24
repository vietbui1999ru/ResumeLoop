'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import type { OutreachItem, OutreachRole, OutreachStatus, AiCard } from '@/lib/outreach'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FsResponse {
  path: string
  parent: string
  dirs: string[]
  files: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCard(raw: string | null): AiCard | null {
  if (!raw) return null
  try { return JSON.parse(raw) as AiCard } catch { return null }
}

const STATUS_COLORS: Record<OutreachStatus, string> = {
  not_contacted: 'bg-zinc-700 text-zinc-400',
  drafted:       'bg-blue-900 text-blue-300',
  sent:          'bg-green-900 text-green-300',
  replied:       'bg-emerald-900 text-emerald-300',
}

// ── ContactCard ───────────────────────────────────────────────────────────────

function ContactCard({
  item,
  jobId,
  onUpdate,
}: {
  item: OutreachItem
  jobId: string
  onUpdate: (updated: OutreachItem) => void
}) {
  const card = parseCard(item.ai_card)
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState('')
  const [factsOpen, setFactsOpen] = useState(false)
  const [copied, setCopied] = useState<'linkedin' | 'email' | null>(null)

  async function patch(fields: Partial<Pick<OutreachItem, 'role' | 'role_custom' | 'notes' | 'email' | 'status'>>) {
    try {
      const res = await fetch(`/api/jobs/${jobId}/outreach/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      if (res.ok) onUpdate(await res.json() as OutreachItem)
    } catch { /* ignore */ }
  }

  async function draftMessages() {
    setDrafting(true); setDraftError('')
    try {
      const res = await fetch(`/api/jobs/${jobId}/outreach/${item.id}/draft`, { method: 'POST' })
      if (!res.ok) { setDraftError('Draft generation failed'); return }
      const data = await res.json() as { linkedin_draft: string; email_draft: string }
      onUpdate({ ...item, linkedin_draft: data.linkedin_draft, email_draft: data.email_draft, status: 'drafted' })
    } catch (e) {
      setDraftError(String(e))
    } finally {
      setDrafting(false)
    }
  }

  async function copy(text: string, which: 'linkedin' | 'email') {
    await navigator.clipboard.writeText(text)
    setCopied(which)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="border border-zinc-700 rounded-md p-3 flex flex-col gap-2 text-sm">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-zinc-100">{card?.name ?? '(unknown)'}</p>
          {card?.title && <p className="text-xs text-zinc-400">{card.title}</p>}
        </div>
        <select
          value={item.status}
          onChange={e => patch({ status: e.target.value as OutreachStatus })}
          className={`text-xs px-2 py-0.5 rounded border-0 cursor-pointer ${STATUS_COLORS[item.status]}`}
        >
          {(['not_contacted', 'drafted', 'sent', 'replied'] as OutreachStatus[]).map(s => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      {/* Role + email row */}
      <div className="flex gap-2">
        <select
          value={item.role ?? ''}
          onChange={e => patch({ role: e.target.value as OutreachRole || null })}
          className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-zinc-300 flex-1"
        >
          <option value="">Role...</option>
          {(['recruiter', 'hiring_manager', 'alumni', 'employee', 'other'] as OutreachRole[]).map(r => (
            <option key={r} value={r}>{r.replace('_', ' ')}</option>
          ))}
        </select>
        {item.role === 'other' && (
          <input
            defaultValue={item.role_custom ?? ''}
            onBlur={e => patch({ role_custom: e.target.value || null })}
            placeholder="Custom role"
            className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-zinc-300 flex-1"
          />
        )}
      </div>

      <input
        defaultValue={item.email ?? ''}
        onBlur={e => patch({ email: e.target.value || null })}
        placeholder="email@company.com"
        className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-zinc-300 w-full"
      />

      <textarea
        defaultValue={item.notes ?? ''}
        onBlur={e => patch({ notes: e.target.value || null })}
        placeholder="Relationship notes..."
        rows={2}
        className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-zinc-300 w-full resize-none"
      />

      {/* Key facts (collapsible) */}
      {(card?.key_facts?.length ?? 0) > 0 && (
        <div>
          <button
            onClick={() => setFactsOpen(v => !v)}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            {factsOpen ? '▾ Hide facts' : `▸ ${card!.key_facts.length} key facts`}
          </button>
          {factsOpen && (
            <ul className="mt-1 list-disc pl-4 space-y-0.5">
              {card!.key_facts.slice(0, 3).map((f, i) => (
                <li key={i} className="text-xs text-zinc-400">{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Draft messages button */}
      <button
        onClick={draftMessages}
        disabled={drafting}
        className="self-start text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
      >
        {drafting ? 'Generating...' : 'Draft messages'}
      </button>
      {draftError && <p className="text-xs text-red-400">{draftError}</p>}

      {/* Drafts */}
      {item.linkedin_draft && (
        <DraftBlock label="LinkedIn" text={item.linkedin_draft} copied={copied === 'linkedin'} onCopy={() => copy(item.linkedin_draft!, 'linkedin')} />
      )}
      {item.email_draft && (
        <DraftBlock label="Email" text={item.email_draft} copied={copied === 'email'} onCopy={() => copy(item.email_draft!, 'email')} />
      )}
    </div>
  )
}

function DraftBlock({ label, text, copied, onCopy }: { label: string; text: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="border border-zinc-700 rounded p-2">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-zinc-500 uppercase">{label}</span>
        <button onClick={onCopy} className="text-xs text-zinc-400 hover:text-zinc-200">
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">{text}</pre>
    </div>
  )
}

// ── SourceCard ────────────────────────────────────────────────────────────────

function SourceCard({ item }: { item: OutreachItem }) {
  const card = parseCard(item.ai_card)
  const [rawOpen, setRawOpen] = useState(false)

  return (
    <div className="border border-zinc-700 rounded-md p-3 flex flex-col gap-1.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-xs px-1.5 py-0.5 bg-zinc-700 text-zinc-400 rounded">{item.kind}</span>
        <p className="font-medium text-zinc-100">{card?.name ?? card?.company ?? '(unknown)'}</p>
      </div>
      {card?.title && <p className="text-xs text-zinc-400">{card.title}</p>}
      {(card?.key_facts?.length ?? 0) > 0 && (
        <ul className="list-disc pl-4 space-y-0.5">
          {card!.key_facts.slice(0, 3).map((f, i) => (
            <li key={i} className="text-xs text-zinc-400">{f}</li>
          ))}
        </ul>
      )}
      <button
        onClick={() => setRawOpen(v => !v)}
        className="self-start text-xs text-zinc-500 hover:text-zinc-300"
      >
        {rawOpen ? 'Hide source' : 'Show source'}
      </button>
      {rawOpen && (
        <pre className="text-xs text-zinc-500 whitespace-pre-wrap max-h-32 overflow-y-auto font-sans">{item.raw_markdown.slice(0, 1000)}</pre>
      )}
    </div>
  )
}

// ── InlinePaste ───────────────────────────────────────────────────────────────

function InlinePaste({
  jobId,
  onIngest,
}: {
  jobId: string
  onIngest: (items: OutreachItem[]) => void
}) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function submit(content: string) {
    if (!content.trim()) return
    setSubmitting(true); setError('')
    try {
      const res = await fetch(`/api/jobs/${jobId}/outreach/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content }),
      })
      const data = await res.json() as { items?: OutreachItem[]; error?: string }
      if (!res.ok) { setError(data.error ?? 'Ingest failed'); return }
      onIngest(data.items ?? [])
      setText('')
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const content = ev.target?.result as string
      void submit(content)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste LinkedIn profile, resume, or company page text…"
          rows={3}
          className="flex-1 text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 placeholder-zinc-600 resize-none focus:outline-none focus:border-indigo-500"
        />
        <div className="flex flex-col gap-1 justify-start">
          <button
            onClick={() => void submit(text)}
            disabled={submitting || !text.trim()}
            className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded text-white transition-colors"
          >
            {submitting ? '…' : 'Add'}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={submitting}
            title="Import .md or .txt file"
            className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 rounded text-zinc-300 transition-colors"
          >
            File
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".md,.txt"
            className="hidden"
            onChange={handleFile}
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ── FilePicker ────────────────────────────────────────────────────────────────

function FilePicker({
  jobId,
  onIngest,
}: {
  jobId: string
  onIngest: (items: OutreachItem[]) => void
}) {
  const [pickerPath, setPickerPath] = useState('')
  const [fsData, setFsData] = useState<FsResponse | null>(null)
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerError, setPickerError] = useState('')
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [ingesting, setIngesting] = useState(false)
  const [ingestError, setIngestError] = useState('')

  // Seed picker from settings outreach_path on first mount
  useEffect(() => {
    const ac = new AbortController()
    fetch('/api/settings', { signal: ac.signal })
      .then(r => r.ok ? r.json() as Promise<{ outreach_path?: string }> : null)
      .then((s: { outreach_path?: string } | null) => {
        if (s?.outreach_path) {
          setPickerPath(s.outreach_path)
          browse(s.outreach_path)
        }
      })
      .catch(() => {})
    return () => ac.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function browse(p: string) {
    setPickerLoading(true); setPickerError('')
    try {
      const res = await fetch(`/api/fs?path=${encodeURIComponent(p)}`)
      const data = await res.json() as FsResponse & { error?: string }
      if (!res.ok) { setPickerError(data.error ?? 'Browse failed'); return }
      setFsData(data)
      setPickerPath(data.path)
      setSelectedPaths(new Set())
    } catch (e) {
      setPickerError(String(e))
    } finally {
      setPickerLoading(false)
    }
  }

  function toggleFile(fullPath: string) {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      if (next.has(fullPath)) next.delete(fullPath); else next.add(fullPath)
      return next
    })
  }

  async function ingest() {
    setIngesting(true); setIngestError('')
    try {
      const res = await fetch(`/api/jobs/${jobId}/outreach/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: Array.from(selectedPaths) }),
      })
      const data = await res.json() as { items?: OutreachItem[]; error?: string }
      if (!res.ok) { setIngestError(data.error ?? 'Ingest failed'); return }
      onIngest(data.items ?? [])
      setSelectedPaths(new Set())
    } catch (e) {
      setIngestError(String(e))
    } finally {
      setIngesting(false)
    }
  }

  const currentDirFiles = fsData?.files ?? []

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={pickerPath}
          onChange={e => setPickerPath(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && browse(pickerPath)}
          placeholder="~/repos/Obsidian/..."
          className="flex-1 text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-zinc-300"
        />
        <button
          onClick={() => browse(pickerPath)}
          disabled={pickerLoading}
          className="text-xs px-3 py-1.5 bg-zinc-700 text-zinc-300 hover:bg-zinc-600 rounded disabled:opacity-50"
        >
          {pickerLoading ? '...' : 'Browse'}
        </button>
      </div>

      {pickerError && <p className="text-xs text-red-400">{pickerError}</p>}

      {fsData && (
        <div className="border border-zinc-700 rounded max-h-48 overflow-y-auto text-xs">
          {/* Parent nav */}
          {fsData.parent && fsData.parent !== fsData.path && (
            <button
              onClick={() => browse(fsData.parent)}
              className="w-full text-left px-3 py-1.5 text-zinc-400 hover:bg-zinc-800 border-b border-zinc-700"
            >
              .. (up)
            </button>
          )}
          {/* Dirs */}
          {fsData.dirs.map(d => (
            <button
              key={d}
              onClick={() => browse(`${fsData.path}/${d}`)}
              className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
            >
              <span>📁</span> {d}
            </button>
          ))}
          {/* Files */}
          {currentDirFiles.map(f => {
            const fullPath = `${fsData.path}/${f}`
            return (
              <label key={f} className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 cursor-pointer text-zinc-300">
                <input
                  type="checkbox"
                  checked={selectedPaths.has(fullPath)}
                  onChange={() => toggleFile(fullPath)}
                  className="accent-indigo-500"
                />
                {f}
              </label>
            )
          })}
          {fsData.dirs.length === 0 && currentDirFiles.length === 0 && (
            <p className="px-3 py-2 text-zinc-500">Empty directory</p>
          )}
        </div>
      )}

      {selectedPaths.size > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">{selectedPaths.size} selected</span>
          <button
            onClick={ingest}
            disabled={ingesting}
            className="text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-50"
          >
            {ingesting ? 'Ingesting...' : 'Ingest selected'}
          </button>
        </div>
      )}
      {ingestError && <p className="text-xs text-red-400">{ingestError}</p>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OutreachPanel({ jobId }: { jobId: string }) {
  const [items, setItems] = useState<OutreachItem[]>([])
  const [brief, setBrief] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [briefStreaming, setBriefStreaming] = useState(false)
  const [briefText, setBriefText] = useState('')
  const [briefError, setBriefError] = useState('')
  const briefReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetch(`/api/jobs/${jobId}/outreach`, { signal: ac.signal })
      .then(r => r.ok ? r.json() as Promise<{ items: OutreachItem[]; brief: string | null }> : Promise.reject(r.status))
      .then((data: { items: OutreachItem[]; brief: string | null }) => {
        setItems(data.items)
        setBrief(data.brief)
      })
      .catch(e => { if ((e as DOMException)?.name !== 'AbortError') setLoadError('Failed to load outreach data') })
      .finally(() => { if (!ac.signal.aborted) setLoading(false) })
    return () => ac.abort()
  }, [jobId])

  useEffect(() => {
    return () => { briefReaderRef.current?.cancel() }
  }, [])

  const handleIngest = useCallback((newItems: OutreachItem[]) => {
    setItems(prev => [...prev, ...newItems])
  }, [])

  const handleUpdate = useCallback((updated: OutreachItem) => {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
  }, [])

  async function streamResearchBrief() {
    setBriefStreaming(true); setBriefText(''); setBriefError('')
    try {
      const res = await fetch(`/api/jobs/${jobId}/outreach/brief/stream`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        setBriefError(err.error ?? 'Brief generation failed')
        return
      }
      const reader = res.body!.getReader()
      briefReaderRef.current = reader
      const decoder = new TextDecoder()
      let text = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setBriefText(text)
      }
      setBrief(text)
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') setBriefError(String(e))
    } finally {
      briefReaderRef.current = null
      setBriefStreaming(false)
    }
  }

  const personItems = items.filter(i => i.kind === 'person')
  const otherItems  = items.filter(i => i.kind !== 'person')
  const displayBrief = brief ?? (briefText || null)

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">Loading…</div>
  }
  if (loadError) {
    return <div className="flex-1 flex items-center justify-center text-red-400 text-sm">{loadError}</div>
  }

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto p-2">
      {/* Inline paste + file import */}
      <section>
        <h3 className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Add sources</h3>
        <InlinePaste jobId={jobId} onIngest={handleIngest} />
      </section>

      {/* Vault file picker */}
      <section>
        <h3 className="text-xs text-zinc-500 uppercase tracking-wide mb-2">From vault</h3>
        <FilePicker jobId={jobId} onIngest={handleIngest} />
      </section>

      {/* Empty state */}
      {items.length === 0 && (
        <p className="text-sm text-zinc-500 text-center py-4">
          No sources yet. Use the file picker above to ingest LinkedIn profiles or company pages from your Obsidian vault.
        </p>
      )}

      {/* Contact cards */}
      {personItems.length > 0 && (
        <section>
          <h3 className="text-xs text-zinc-500 uppercase tracking-wide mb-2">
            Contacts ({personItems.length})
          </h3>
          <div className="flex flex-col gap-2">
            {personItems.map(item => (
              <ContactCard key={item.id} item={item} jobId={jobId} onUpdate={handleUpdate} />
            ))}
          </div>
        </section>
      )}

      {/* Other sources */}
      {otherItems.length > 0 && (
        <section>
          <h3 className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Sources</h3>
          <div className="flex flex-col gap-2">
            {otherItems.map(item => (
              <SourceCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* Research brief */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs text-zinc-500 uppercase tracking-wide">Research brief</h3>
          <button
            onClick={streamResearchBrief}
            disabled={briefStreaming || items.length === 0}
            className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
          >
            {briefStreaming ? 'Synthesizing...' : 'Synthesize'}
          </button>
        </div>
        {briefError && <p className="text-xs text-red-400 mb-1">{briefError}</p>}
        {briefStreaming && !briefText && (
          <p className="text-xs text-zinc-500 animate-pulse">Generating brief…</p>
        )}
        {(displayBrief) && (
          <div className="text-sm text-zinc-300 leading-relaxed overflow-y-auto max-h-64 [&_h2]:text-indigo-300 [&_h2]:font-semibold [&_h2]:text-sm [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-zinc-200 [&_h3]:text-xs [&_h3]:font-medium [&_h3]:mt-2 [&_ul]:list-disc [&_ul]:pl-4 [&_p]:mb-1.5">
            <ReactMarkdown>{displayBrief}</ReactMarkdown>
          </div>
        )}
      </section>
    </div>
  )
}
