import { describe, it, expect } from 'vitest'
import { toBulletsMarkdown } from './bullets-md'

const SAMPLE = JSON.stringify({
  experience: [
    {
      id: 'gitlab',
      bullets: {
        genai: ['Built pipeline using Python', 'Automated review using Claude API'],
        systems: ['Wrote Go service for CI'],
      },
    },
  ],
  projects: [
    { id: 'resumeloop', name: 'ResumeLoop', bullets: ['Deployed on AWS ECS using GitHub Actions'] },
    { id: 'ethswitch', bullets: ['Implemented IEEE 802.3 in Go'] },
  ],
})

describe('toBulletsMarkdown', () => {
  it('formats experience entry as ## id header with all variant bullets flattened', () => {
    const md = toBulletsMarkdown(JSON.stringify({
      experience: [
        { id: 'gitlab', bullets: { genai: ['Built X using Y'] } },
      ],
    }))
    expect(md).toContain('## gitlab')
    expect(md).toContain('- Built X using Y')
  })

  it('flattens all variants under the same experience header', () => {
    const md = toBulletsMarkdown(SAMPLE)
    const lines = md.split('\n')
    const headerIdx = lines.findIndex(l => l === '## gitlab')
    expect(headerIdx).toBeGreaterThanOrEqual(0)
    // all bullets from both variants appear after the header
    expect(md).toContain('- Built pipeline using Python')
    expect(md).toContain('- Automated review using Claude API')
    expect(md).toContain('- Wrote Go service for CI')
    // only ONE gitlab header
    expect(lines.filter(l => l === '## gitlab')).toHaveLength(1)
  })

  it('formats project with name as ## name header', () => {
    const md = toBulletsMarkdown(SAMPLE)
    expect(md).toContain('## ResumeLoop')
    expect(md).toContain('- Deployed on AWS ECS using GitHub Actions')
  })

  it('falls back to project id when name is absent', () => {
    const md = toBulletsMarkdown(SAMPLE)
    expect(md).toContain('## ethswitch')
  })

  it('returns empty string for invalid JSON', () => {
    expect(toBulletsMarkdown('not json{')).toBe('')
  })

  it('returns empty string when both experience and projects are empty', () => {
    expect(toBulletsMarkdown(JSON.stringify({ experience: [], projects: [] }))).toBe('')
  })
})
