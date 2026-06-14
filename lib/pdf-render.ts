import type { Browser } from 'playwright'

/**
 * The "pretty" PDF engine (ADR 0001 §5). Renders a styled, ATS-parseable PDF
 * from the SAME resume data the docx engine uses — a separate render, NOT a
 * conversion of the .docx. Replaces the LibreOffice DOCX→PDF path entirely.
 */

export interface ResumeWork {
  id: string; title: string; company: string; location?: string; dates?: string; bullets: string[]
}
export interface ResumeProject {
  id: string; name: string; url?: string; stack?: string; date?: string; bullets: string[]
}
export interface ResumeSkill { label: string; vals: string }
export interface ResumeContact {
  email?: string; phone?: string; location?: string; linkedin?: string; portfolio?: string
}
export interface ResumeData {
  name?: string
  contact?: ResumeContact
  tagline?: string
  work: ResumeWork[]
  projects: ResumeProject[]
  skills: ResumeSkill[]
}

/** HTML-escape a value for safe interpolation into the template. */
function esc(s: string | undefined): string {
  return (s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/**
 * Normalize text for ATS: em/en-dashes and smart punctuation trip legacy parsers
 * (and em-dashes read as AI-writing). Convert to plain equivalents before escaping.
 */
function ats(s: string | undefined): string {
  return esc((s ?? '')
    .replace(/—/g, '-')   // em dash
    .replace(/–/g, '-')   // en dash
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/ /g, ' '))
}

function contactLine(c: ResumeContact | undefined): string {
  if (!c) return ''
  const parts = [c.email, c.phone, c.location, c.linkedin, c.portfolio].filter(Boolean).map(ats)
  return parts.join(' &nbsp;·&nbsp; ')
}

/** Build the resume HTML document (pure — unit-testable without a browser). */
export function renderResumeHtml(data: ResumeData): string {
  const work = data.work.map(w => `
    <div class="entry">
      <div class="entry-head">
        <span class="entry-title">${ats(w.title)}${w.company ? `, ${ats(w.company)}` : ''}</span>
        <span class="entry-meta">${ats([w.location, w.dates].filter(Boolean).join(' · '))}</span>
      </div>
      <ul>${w.bullets.map(b => `<li>${ats(b)}</li>`).join('')}</ul>
    </div>`).join('')

  const projects = data.projects.map(p => `
    <div class="entry">
      <div class="entry-head">
        <span class="entry-title">${ats(p.name)}${p.stack ? ` <span class="stack">${ats(p.stack)}</span>` : ''}</span>
        <span class="entry-meta">${ats(p.date)}</span>
      </div>
      <ul>${p.bullets.map(b => `<li>${ats(b)}</li>`).join('')}</ul>
    </div>`).join('')

  const skills = data.skills.map(s =>
    `<div class="skill"><span class="skill-label">${ats(s.label)}</span> ${ats(s.vals)}</div>`).join('')

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', system-ui, -apple-system, sans-serif; font-size: 10.5px;
         line-height: 1.45; color: #1a1a1a; }
  h1 { font-family: 'Space Grotesk', system-ui, sans-serif; font-size: 23px; font-weight: 700; }
  .tagline { color: #444; font-size: 11px; margin-top: 2px; }
  .rule { height: 2px; margin: 6px 0 4px;
          background: linear-gradient(to right, hsl(187,74%,32%), hsl(270,70%,45%)); }
  .contact { font-size: 9.5px; color: #333; }
  h2 { font-family: 'Space Grotesk', system-ui, sans-serif; font-size: 12px; font-weight: 600;
       text-transform: uppercase; letter-spacing: 0.05em; color: hsl(187,74%,30%);
       margin: 12px 0 5px; border-bottom: 1px solid #e3e3e3; padding-bottom: 2px; }
  .entry { margin-bottom: 7px; }
  .entry-head { display: flex; justify-content: space-between; align-items: baseline; }
  .entry-title { font-weight: 600; font-size: 11px; }
  .stack { font-weight: 400; color: #666; font-size: 9.5px; }
  .entry-meta { color: #666; font-size: 9.5px; white-space: nowrap; padding-left: 8px; }
  ul { list-style: none; margin-top: 2px; }
  li { position: relative; padding-left: 11px; margin-bottom: 1.5px; }
  li::before { content: '‣'; position: absolute; left: 0; color: hsl(187,74%,32%); }
  .skill { margin-bottom: 2px; }
  .skill-label { font-weight: 600; }
</style></head>
<body>
  <header>
    <h1>${ats(data.name)}</h1>
    ${data.tagline ? `<div class="tagline">${ats(data.tagline)}</div>` : ''}
    <div class="rule"></div>
    <div class="contact">${contactLine(data.contact)}</div>
  </header>
  ${work ? `<section><h2>Experience</h2>${work}</section>` : ''}
  ${projects ? `<section><h2>Projects</h2>${projects}</section>` : ''}
  ${skills ? `<section><h2>Skills</h2>${skills}</section>` : ''}
</body></html>`
}

/**
 * Render the resume to a PDF Buffer via headless Chromium.
 * Chromium auto-installs on first run if absent (`npx playwright install chromium`).
 * `launcher` is injectable for tests.
 */
export async function renderPdfBuffer(
  data: ResumeData,
  launcher: () => Promise<Browser> = defaultLaunch,
): Promise<Buffer> {
  const browser = await launcher()
  try {
    const page = await browser.newPage()
    // waitUntil 'load' (not 'networkidle') so rendering never hangs offline; remote
    // fonts are a progressive enhancement over the system-font fallback stack.
    await page.setContent(renderResumeHtml(data), { waitUntil: 'load' })
    await page.evaluate(() => (document as Document).fonts.ready).catch(() => {})
    return await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', right: '0.55in', bottom: '0.5in', left: '0.55in' },
    })
  } finally {
    await browser.close()
  }
}

async function defaultLaunch(): Promise<Browser> {
  const { chromium } = await import('playwright')
  // In the container we point Playwright at the distro Chromium (PLAYWRIGHT_CHROMIUM_PATH);
  // locally, fall back to Playwright's own downloaded browser.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined
  return chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
}
