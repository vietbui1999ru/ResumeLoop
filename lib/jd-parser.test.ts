import { describe, it, expect } from 'vitest'
import { parseJd } from './jd-parser'

const SAMPLE = `---
title: "(1) IT Intern | Alta Equipment Group"
tags:
  - "clippings"
  - "jobs"
  - "un-resume"
---
# Raw content
Looking for a candidate with Linux skills. Must be authorized to work in the US.
`

describe('parseJd', () => {
  it('extracts company and role from frontmatter title', () => {
    const r = parseJd('/fake/(1) IT Intern  Alta Equipment Group.md', SAMPLE)
    expect(r.company).toBe('Alta Equipment Group')
    expect(r.role_title).toBe('IT Intern')
  })

  it('stores tags as JSON array string', () => {
    const r = parseJd('/fake/test.md', SAMPLE)
    expect(JSON.parse(r.tags)).toContain('un-resume')
  })

  it('sets visa_status to proceed for "authorized to work in the US"', () => {
    const r = parseJd('/fake/test.md', SAMPLE)
    expect(r.visa_status).toBe('proceed')
  })

  it('sets visa_status to kill for US Citizen requirement', () => {
    const kill = SAMPLE.replace('authorized to work in the US', 'US Citizen or Green Card only required')
    const r = parseJd('/fake/test.md', kill)
    expect(r.visa_status).toBe('kill')
  })

  it('generates id as lowercase slug', () => {
    const r = parseJd('/fake/(1) IT Intern  Alta Equipment Group.md', SAMPLE)
    expect(r.id).toMatch(/^[a-z0-9-]+$/)
  })

  it('action_FrontmatterHasValidAction_ReturnsIt', () => {
    const content = SAMPLE.replace('tags:', 'Action: "1-Applied"\ntags:')
    const r = parseJd('/fake/test.md', content)
    expect(r.action).toBe('1-Applied')
  })

  it('action_FrontmatterMissingAction_ReturnsNull', () => {
    const r = parseJd('/fake/test.md', SAMPLE)
    expect(r.action).toBeNull()
  })

  it('action_FrontmatterHasInvalidValue_ReturnsNull', () => {
    const content = SAMPLE.replace('tags:', 'Action: "typo-value"\ntags:')
    const r = parseJd('/fake/test.md', content)
    expect(r.action).toBeNull()
  })
})

// ── apply_url extraction ──────────────────────────────────────────────────────

describe('parseJd — apply_url', () => {
  const withSource = `---
title: Software Engineer | Acme Corp
source: https://jobs.acme.com/apply/123
created: 2026-05-01T00:00:00.000Z
tags: [software, backend]
---
Job content here
`

  it('extracts apply_url from frontmatter source field', () => {
    const r = parseJd('/fake/acme.md', withSource)
    expect(r.apply_url).toBe('https://jobs.acme.com/apply/123')
  })

  it('returns null apply_url when source field is absent', () => {
    const noSource = `---
title: Software Engineer | Acme Corp
tags: [software, backend]
---
Job content here
`
    const r = parseJd('/fake/acme.md', noSource)
    expect(r.apply_url).toBeNull()
  })

  it('returns null apply_url when source is empty string', () => {
    const emptySource = `---
title: Software Engineer | Acme Corp
source: ""
tags: [software, backend]
---
Job content here
`
    const r = parseJd('/fake/acme.md', emptySource)
    expect(r.apply_url).toBeNull()
  })

  it('returns null apply_url when source is whitespace only', () => {
    const wsSource = `---
title: Software Engineer | Acme Corp
source: "   "
tags: [software, backend]
---
Job content here
`
    const r = parseJd('/fake/acme.md', wsSource)
    expect(r.apply_url).toBeNull()
  })
})

// ── clipped_at extraction ─────────────────────────────────────────────────────

describe('parseJd — clipped_at', () => {
  it('parses ISO string in created field', () => {
    const content = `---
title: Backend Engineer | Acme
created: 2026-05-01T00:00:00.000Z
---
body
`
    const r = parseJd('/fake/f.md', content)
    expect(r.clipped_at).not.toBeNull()
    expect(new Date(r.clipped_at!).getFullYear()).toBe(2026)
  })

  it('parses YYYY-MM-DD date field (gray-matter emits Date object)', () => {
    const content = `---
title: Backend Engineer | Acme
date: 2025-12-15
---
body
`
    const r = parseJd('/fake/f.md', content)
    expect(r.clipped_at).not.toBeNull()
    expect(r.clipped_at).toMatch(/^2025-12-15/)
  })

  it('parses date from clipped field', () => {
    const content = `---
title: Backend Engineer | Acme
clipped: 2024-03-20T10:30:00.000Z
---
body
`
    const r = parseJd('/fake/f.md', content)
    expect(r.clipped_at).not.toBeNull()
    expect(new Date(r.clipped_at!).getMonth()).toBe(2) // March = index 2
  })

  it('returns null clipped_at when no date fields present', () => {
    const content = `---
title: Backend Engineer | Acme
tags: [jobs]
---
body
`
    const r = parseJd('/fake/f.md', content)
    expect(r.clipped_at).toBeNull()
  })

  it('returns null clipped_at for invalid date string', () => {
    const content = `---
title: Backend Engineer | Acme
created: "not-a-date"
---
body
`
    const r = parseJd('/fake/f.md', content)
    expect(r.clipped_at).toBeNull()
  })
})

// ── visa detection ────────────────────────────────────────────────────────────

describe('parseJd — visa_status detection', () => {
  function makeJd(body: string) {
    return `---\ntitle: Engineer | Corp\n---\n${body}`
  }

  it('returns kill for "US Citizen or Green Card"', () => {
    const r = parseJd('/fake/f.md', makeJd('Requires US Citizen or Green Card.'))
    expect(r.visa_status).toBe('kill')
  })

  it('returns kill for "no sponsorship"', () => {
    const r = parseJd('/fake/f.md', makeJd('We do not offer no sponsorship for this role.'))
    expect(r.visa_status).toBe('kill')
  })

  it('returns kill for "must be a US citizen"', () => {
    const r = parseJd('/fake/f.md', makeJd('Applicant must be a US citizen.'))
    expect(r.visa_status).toBe('kill')
  })

  it('returns kill for "export control"', () => {
    const r = parseJd('/fake/f.md', makeJd('This position is subject to export control regulations.'))
    expect(r.visa_status).toBe('kill')
  })

  it('returns proceed for "authorized to work in the US"', () => {
    const r = parseJd('/fake/f.md', makeJd('Candidates must be authorized to work in the US.'))
    expect(r.visa_status).toBe('proceed')
  })

  it('returns proceed for "equal opportunity employer"', () => {
    const r = parseJd('/fake/f.md', makeJd('We are an Equal Opportunity Employer.'))
    expect(r.visa_status).toBe('proceed')
  })

  it('returns unknown when no visa signals present', () => {
    const r = parseJd('/fake/f.md', makeJd('Great team, competitive salary, remote work.'))
    expect(r.visa_status).toBe('unknown')
  })

  it('kill takes precedence over proceed patterns', () => {
    const body = 'Must be authorized to work in the US. No sponsorship available. US Citizen or Green Card only.'
    const r = parseJd('/fake/f.md', makeJd(body))
    expect(r.visa_status).toBe('kill')
  })
})
