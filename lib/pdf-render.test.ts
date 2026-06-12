import { describe, it, expect, vi } from 'vitest'
import type { Browser } from 'playwright'
import { renderResumeHtml, renderPdfBuffer, type ResumeData } from './pdf-render'

const data: ResumeData = {
  name: 'Jane <Doe>',
  contact: { email: 'jane@example.com', location: 'Remote', linkedin: 'in/jane' },
  tagline: 'Engineer building tools — fast',
  work: [{ id: 'w1', title: 'Engineer', company: 'Acme', dates: '2024', bullets: ['Built X — shipped it'] }],
  projects: [{ id: 'p1', name: 'Proj', stack: 'Go, TS', date: '2025', bullets: ['Made a thing'] }],
  skills: [{ label: 'Languages', vals: 'Go · TypeScript' }],
}

describe('renderResumeHtml', () => {
  it('includes the candidate name, sections, and content', () => {
    const html = renderResumeHtml(data)
    expect(html).toContain('Jane')
    expect(html).toContain('Experience')
    expect(html).toContain('Projects')
    expect(html).toContain('Skills')
    expect(html).toContain('Acme')
  })

  it('escapes HTML in user data (no raw angle brackets from name)', () => {
    const html = renderResumeHtml(data)
    expect(html).toContain('Jane &lt;Doe&gt;')
    expect(html).not.toContain('Jane <Doe>')
  })

  it('normalizes em-dashes to hyphens for ATS', () => {
    const html = renderResumeHtml(data)
    expect(html).not.toContain('—')
    expect(html).toContain('Built X - shipped it')
    expect(html).toContain('building tools - fast')
  })

  it('omits a section when it has no entries', () => {
    const html = renderResumeHtml({ ...data, projects: [] })
    expect(html).not.toContain('>Projects<')
  })
})

describe('renderPdfBuffer (injected launcher)', () => {
  it('drives the browser and returns the pdf buffer', async () => {
    const fakeBuf = Buffer.from('%PDF-1.4 fake')
    const page = {
      setContent: vi.fn(async () => {}),
      evaluate: vi.fn(async () => {}),
      pdf: vi.fn(async () => fakeBuf),
    }
    const browser = { newPage: vi.fn(async () => page), close: vi.fn(async () => {}) } as unknown as Browser
    const out = await renderPdfBuffer(data, async () => browser)
    expect(out).toBe(fakeBuf)
    expect(page.setContent).toHaveBeenCalledOnce()
    expect((page.pdf as ReturnType<typeof vi.fn>).mock.calls[0][0].format).toBe('Letter')
    expect((browser.close as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce()
  })

  it('closes the browser even if pdf() throws', async () => {
    const close = vi.fn(async () => {})
    const page = {
      setContent: vi.fn(async () => {}),
      evaluate: vi.fn(async () => {}),
      pdf: vi.fn(async () => { throw new Error('boom') }),
    }
    const browser = { newPage: vi.fn(async () => page), close } as unknown as Browser
    await expect(renderPdfBuffer(data, async () => browser)).rejects.toThrow('boom')
    expect(close).toHaveBeenCalledOnce()
  })
})

// Real Chromium render — opt in with RESUMELOOP_E2E_PDF=1.
const runE2E = process.env.RESUMELOOP_E2E_PDF === '1'
describe.runIf(runE2E)('renderPdfBuffer (real chromium)', () => {
  it('produces a valid PDF', async () => {
    const buf = await renderPdfBuffer(data)
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(2000)
  }, 60_000)
})
