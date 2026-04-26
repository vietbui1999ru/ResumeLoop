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
})
