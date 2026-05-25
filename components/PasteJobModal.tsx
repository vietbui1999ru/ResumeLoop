'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

interface PastedJob {
  id: string
  company: string
  role_title: string
  fit_pct: number
  visa_status: string
}

export function PasteJobModal({ onClose, onAdded }: { onClose: () => void; onAdded: (job: PastedJob) => void }) {
  const [content, setContent] = useState('')
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleKey])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const submit = async () => {
    if (!content.trim()) { setError('Paste the .md content first'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await res.json() as PastedJob & { error?: string }
      if (!res.ok) { setError(data.error ?? 'Failed to save job'); return }
      onAdded(data)
      onClose()
    } catch {
      setError('Network error — try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paste job posting"
        className="fixed z-[91] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl flex flex-col bg-surface-card border border-border-default rounded-2xl shadow-modal"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-border-subtle shrink-0">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Paste job posting</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Paste the full .md file content from Obsidian Web Clipper — frontmatter required
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-text-muted hover:text-text-secondary transition-colors text-lg leading-none ml-4 mt-0.5"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-3">
          <div className="text-xs text-text-muted leading-relaxed bg-surface-raised/50 border border-border-default/60 rounded-lg px-3 py-2.5">
            <span className="text-text-secondary font-medium">Expected format — </span>
            the file should start with{' '}
            <code className="text-indigo-300 bg-indigo-950/40 px-1 rounded text-2xs">---</code> frontmatter
            containing at minimum a <code className="text-indigo-300 bg-indigo-950/40 px-1 rounded text-2xs">title</code> and{' '}
            <code className="text-indigo-300 bg-indigo-950/40 px-1 rounded text-2xs">Company</code> field.
            Use the{' '}
            <a
              href="/jd-clipper-template.md"
              download="jd-clipper-template.md"
              className="text-indigo-400 hover:text-indigo-300 underline transition-colors"
            >
              ResumeLoop template
            </a>{' '}
            with Obsidian Web Clipper for best results.
          </div>

          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => { setContent(e.target.value); setError('') }}
            placeholder={`---\ncreated: 2026-05-18\ntitle: "Software Engineer"\nCompany: Anthropic\nAction: "0-Saved"\nsource: "https://boards.greenhouse.io/..."\ndescription: "Join Anthropic as a Software Engineer…"\npublished: 2026-05-01\ntags:\n  - clippings\n  - jobs\n  - un-resume\n  - un-cover-letter\noutreach:\nnotes:\n---\n\nJob description goes here…`}
            className="w-full h-64 text-xs font-mono bg-surface-raised border border-border-default rounded-lg px-3 py-2.5 text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-indigo-500 transition-colors"
            spellCheck={false}
          />

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-between shrink-0">
          <p className="text-2xs text-text-muted">
            Saved to database only — your local folder is not modified
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-xs px-3 py-2 text-text-muted hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving || !content.trim()}
              className="text-xs px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
            >
              {saving ? 'Saving…' : 'Add job'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
