'use client'
import { useEffect, useCallback, useState, type ReactNode } from 'react'

const CHROME_EXT  = 'https://chromewebstore.google.com/detail/obsidian-web-clipper/cnjifjpddelmedmihgijeibhnjfabmlf'
const FIREFOX_EXT = 'https://addons.mozilla.org/en-US/firefox/addon/web-clipper-obsidian/'

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-6 h-6 rounded-full bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center mt-0.5">
        <span className="text-2xs font-bold text-indigo-400">{n}</span>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-zinc-100 mb-2">{title}</h3>
        {children}
      </div>
    </div>
  )
}

export function JobImportGuide({ onClose }: { onClose: () => void }) {
  const [templateContent, setTemplateContent] = useState<string | null>(null)
  const [showTemplate, setShowTemplate]       = useState(false)
  const [copied, setCopied]                   = useState(false)

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleKey])

  const toggleTemplate = async () => {
    if (!showTemplate && templateContent === null) {
      const res = await fetch('/jd-clipper-template.md')
      setTemplateContent(res.ok ? await res.text() : '(failed to load template)')
    }
    setShowTemplate(v => !v)
  }

  const copyTemplate = async () => {
    if (!templateContent) return
    await navigator.clipboard.writeText(templateContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
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
        aria-label="How to import jobs from the web"
        className="fixed z-[91] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[85vh] flex flex-col bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl shadow-black/60"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Import jobs from the web</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Clip any job listing in one click — no manual copy-paste
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-500 hover:text-zinc-300 transition-colors text-lg leading-none ml-4 mt-0.5"
          >
            ✕
          </button>
        </div>

        {/* Steps */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">

          <Step n={1} title="Install Obsidian Web Clipper">
            <p className="text-xs text-zinc-300 leading-relaxed">
              The clipper saves any web page — including job listings — as a structured{' '}
              <code className="text-indigo-300 bg-indigo-950/40 px-1 rounded text-2xs">.md</code> file
              directly to a local folder. No Obsidian app required.
            </p>
            <div className="flex gap-2 mt-3">
              <a
                href={CHROME_EXT}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-200 transition-colors"
              >
                <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
                  <circle cx="10" cy="10" r="4" fill="#4285F4" />
                  <path d="M10 6h8a10 10 0 0 0-8-4.6V6z" fill="#EA4335" />
                  <path d="M18 10a8 8 0 0 1-8 8l-4-6.9A4 4 0 0 0 14 10h4z" fill="#34A853" />
                  <path d="M2 10a8 8 0 0 0 6 7.7L4 10.8A4 4 0 0 1 6 6L2 10z" fill="#FBBC05" />
                </svg>
                Chrome extension ↗
              </a>
              <a
                href={FIREFOX_EXT}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-200 transition-colors"
              >
                <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" aria-hidden="true">
                  <circle cx="10" cy="10" r="9" fill="#FF7139" />
                  <circle cx="10" cy="10" r="5" fill="#FFC537" />
                  <circle cx="10" cy="10" r="2.5" fill="#20123A" />
                </svg>
                Firefox add-on ↗
              </a>
            </div>
          </Step>

          <Step n={2} title="Download the templates">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xs font-semibold px-1.5 py-0.5 rounded bg-red-900/60 border border-red-700/60 text-red-300 uppercase tracking-wide">
                Required
              </span>
              <span className="text-xs text-zinc-400">
                The scanner uses frontmatter from this template to read job files correctly.
              </span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Two templates — one for job listings, one for LinkedIn profiles (used as outreach
              contacts). Each tells the clipper exactly what to extract.
            </p>
            <div className="flex flex-col gap-2 mt-3">
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href="/jd-clipper-template.md"
                  download="jd-clipper-template.md"
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium transition-colors"
                >
                  ↓ Job listing template
                </a>
                <button
                  onClick={() => void toggleTemplate()}
                  className="text-xs px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-300 transition-colors"
                >
                  {showTemplate ? 'Hide template' : 'View template'}
                </button>
              </div>
              {showTemplate && (
                <div className="relative">
                  <pre className="text-2xs font-mono text-zinc-300 bg-zinc-800/80 border border-zinc-700 rounded-lg p-3 overflow-x-auto leading-relaxed max-h-48 overflow-y-auto">
                    {templateContent ?? 'Loading…'}
                  </pre>
                  <button
                    onClick={() => void copyTemplate()}
                    className="absolute top-2 right-2 text-2xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
                  >
                    {copied ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
              )}
              <a
                href="/obsidian-linkedin-outreach-template.md"
                download="obsidian-linkedin-outreach-template.md"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded-lg text-zinc-200 font-medium transition-colors w-fit"
              >
                ↓ LinkedIn contact template
              </a>
            </div>
          </Step>

          <Step n={3} title="Import templates into Web Clipper">
            <div className="mb-3 bg-amber-950/30 border border-amber-700/40 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-200 leading-relaxed">
                <strong>Do not open the downloaded file</strong> — import it directly inside the
                Web Clipper extension. If your OS asks which app to open a{' '}
                <code className="text-amber-300 bg-amber-950/40 px-1 rounded text-2xs">.md</code>{' '}
                file with, close that dialog and follow the steps below instead.
              </p>
            </div>
            <ol className="text-xs text-zinc-300 leading-relaxed space-y-2 list-decimal list-inside">
              <li>Click the Web Clipper icon in your browser toolbar</li>
              <li>
                Open <strong className="text-zinc-100">Settings</strong> (gear icon, bottom-left)
              </li>
              <li>
                Go to <strong className="text-zinc-100">Templates</strong> → click{' '}
                <strong className="text-zinc-100">Import</strong> → select the downloaded{' '}
                <code className="text-indigo-300 bg-indigo-950/40 px-1 rounded text-2xs">.md</code>{' '}
                files — import both
              </li>
              <li>
                The <strong className="text-zinc-100">Job listing</strong> template auto-triggers on
                job board URLs (Greenhouse, Ashby, LinkedIn Jobs, and more)
              </li>
              <li>
                The <strong className="text-zinc-100">LinkedIn contact</strong> template triggers on{' '}
                <code className="text-indigo-300 bg-indigo-950/40 px-1 rounded text-2xs">
                  linkedin.com/in/
                </code>{' '}
                profile pages — clip people you want to reach out to
              </li>
            </ol>
          </Step>

          <Step n={4} title="Set the save folder in Web Clipper">
            <p className="text-xs text-zinc-300 leading-relaxed">
              In Web Clipper settings, set{' '}
              <strong className="text-zinc-100">Default save location</strong> to your Jobs folder —
              use the same path you&apos;ll configure in ResumeLoop.
            </p>
            <div className="mt-3 bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2.5 space-y-1">
              <p className="text-2xs text-zinc-400 font-mono">~/Documents/Jobs</p>
              <p className="text-2xs text-zinc-400 font-mono">~/Obsidian/JobSearch/Jobs</p>
            </div>
            <p className="text-2xs text-zinc-500 mt-2">
              Pick any folder — just keep it consistent between Web Clipper and ResumeLoop.
            </p>
          </Step>

          <Step n={5} title="Clip a job, then scan">
            <p className="text-xs text-zinc-300 leading-relaxed">
              On any job listing page, click the Web Clipper icon and confirm — the{' '}
              <code className="text-indigo-300 bg-indigo-950/40 px-1 rounded text-2xs">.md</code> file
              saves to your Jobs folder automatically.
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed mt-2">
              In ResumeLoop, set <strong className="text-zinc-200">Settings → Jobs Folder</strong> to
              that same path, then click <strong className="text-zinc-200">Scan</strong> on the Jobs
              page. Clipped jobs appear as cards with company, role, fit score, and visa status —
              ready to generate resumes.
            </p>
          </Step>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-zinc-800 px-6 py-3 flex justify-end bg-zinc-900 rounded-b-2xl">
          <button
            onClick={onClose}
            className="text-xs px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </>
  )
}
