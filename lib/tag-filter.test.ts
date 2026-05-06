import { describe, it, expect } from 'vitest'
import { extractAllTags, jobMatchesTagFilter } from './tag-filter'

const makeJob = (tags: string[]) => ({ tags: JSON.stringify(tags) })

describe('extractAllTags', () => {
  it('returns sorted unique tags across all jobs', () => {
    const jobs = [makeJob(['clippings', 'un-resume']), makeJob(['clippings', 'resume-ed'])]
    expect(extractAllTags(jobs)).toEqual(['clippings', 'resume-ed', 'un-resume'])
  })

  it('returns empty array for jobs with no tags', () => {
    expect(extractAllTags([makeJob([])])).toEqual([])
  })
})

describe('jobMatchesTagFilter', () => {
  it('returns true when tagFilter is empty', () => {
    expect(jobMatchesTagFilter(makeJob(['un-resume']), '')).toBe(true)
  })

  it('returns true when job has the filter tag', () => {
    expect(jobMatchesTagFilter(makeJob(['un-resume', 'jobs']), 'un-resume')).toBe(true)
  })

  it('returns false when job lacks the filter tag', () => {
    expect(jobMatchesTagFilter(makeJob(['resume-ed']), 'un-resume')).toBe(false)
  })

  it('handles malformed tags gracefully', () => {
    expect(jobMatchesTagFilter({ tags: 'bad json' }, 'un-resume')).toBe(false)
  })
})
