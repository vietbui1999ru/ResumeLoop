import { describe, it, expect } from 'vitest'
import { parseGithubUrl, validateBullets } from './github-ingest'

describe('parseGithubUrl', () => {
  it('parses owner and repo from HTTPS URL', () => {
    const result = parseGithubUrl('https://github.com/example-user/example-repo')
    expect(result).toEqual({ owner: 'example-user', repo: 'example-repo' })
  })

  it('strips .git suffix', () => {
    const result = parseGithubUrl('https://github.com/foo/bar.git')
    expect(result).toEqual({ owner: 'foo', repo: 'bar' })
  })

  it('returns null for non-github URL', () => {
    expect(parseGithubUrl('https://gitlab.com/foo/bar')).toBeNull()
  })

  it('returns null for URL without repo path', () => {
    expect(parseGithubUrl('https://github.com/foo')).toBeNull()
  })
})

describe('validateBullets', () => {
  it('trims bullets over 116 chars at last word boundary', () => {
    const long = 'Built something very impressive that does many things using many technologies, which resulted in many very good outcomes for everyone'
    const result = validateBullets([long])
    expect(result[0].length).toBeLessThanOrEqual(116)
  })

  it('passes through bullets within limit', () => {
    const short = 'Built X using Y, which produced Z'
    const result = validateBullets([short])
    expect(result[0]).toBe(short)
  })
})
