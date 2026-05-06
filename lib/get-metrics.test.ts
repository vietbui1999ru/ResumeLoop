import { describe, it, expect } from 'vitest'

// Extract the tag-counting logic so we can test it in isolation
function countPipeline(tagRows: Array<{ tags: string }>) {
  const pipeline = { scraped: tagRows.length, visa_kill: 0, pending: 0, resume_built: 0, applied: 0, interviewed: 0, rejected: 0, offer: 0 }
  for (const { tags } of tagRows) {
    let t: string[] = []
    try { t = JSON.parse(tags ?? '[]') } catch { /* skip */ }
    if (t.includes('un-resume'))   pipeline.pending++
    if (t.includes('resume-ed'))   pipeline.resume_built++
    if (t.includes('applied'))     pipeline.applied++
    if (t.includes('interviewed')) pipeline.interviewed++
    if (t.includes('rejected'))    pipeline.rejected++
    if (t.includes('offer'))       pipeline.offer++
  }
  return pipeline
}

describe('pipeline counting', () => {
  it('counts pending jobs correctly', () => {
    const rows = [
      { tags: JSON.stringify(['clippings', 'un-resume']) },
      { tags: JSON.stringify(['clippings', 'resume-ed']) },
      { tags: JSON.stringify(['clippings']) },
    ]
    const p = countPipeline(rows)
    expect(p.scraped).toBe(3)
    expect(p.pending).toBe(1)
    expect(p.resume_built).toBe(1)
    expect(p.applied).toBe(0)
  })

  it('counts applied + interviewed correctly', () => {
    const rows = [
      { tags: JSON.stringify(['resume-ed', 'applied', 'interviewed']) },
      { tags: JSON.stringify(['resume-ed', 'applied']) },
    ]
    const p = countPipeline(rows)
    expect(p.resume_built).toBe(2)
    expect(p.applied).toBe(2)
    expect(p.interviewed).toBe(1)
  })

  it('handles malformed tags without crashing', () => {
    const rows = [{ tags: 'not json' }, { tags: '' }, { tags: '[]' }]
    expect(() => countPipeline(rows)).not.toThrow()
  })

  it('counts visa_kill separately — not from tags', () => {
    const rows = [{ tags: '[]' }, { tags: '[]' }]
    const p = countPipeline(rows)
    expect(p.visa_kill).toBe(0) // visa_kill is from visa_status field, not tags
  })
})
