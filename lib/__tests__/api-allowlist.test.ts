import { describe, it, expect } from 'vitest'
import { FILE_MAP } from '../chat-tools'

const PROPRIETARY_KEYS = ['claude_full', 'ats_guidelines', 'ats_system', 'spec']
const PROPRIETARY_FILE_NAMES = [
  'ats-optimization-guidelines.md',
  'CLAUDE-full.md',
  'ats-optimized-resume-system.md',
  'spec-job-match-resume-generator.md',
]

describe('chat-tools FILE_MAP — proprietary files removed', () => {
  it('does not contain claude_full key', () => {
    expect(Object.keys(FILE_MAP)).not.toContain('claude_full')
  })

  it('does not contain ats_guidelines key', () => {
    expect(Object.keys(FILE_MAP)).not.toContain('ats_guidelines')
  })

  it('does not contain ats_system key', () => {
    expect(Object.keys(FILE_MAP)).not.toContain('ats_system')
  })

  it('does not contain spec key', () => {
    expect(Object.keys(FILE_MAP)).not.toContain('spec')
  })

  it('does not reference any docs/reference file path in values', () => {
    const values = Object.values(FILE_MAP)
    for (const fname of PROPRIETARY_FILE_NAMES) {
      const hasRef = values.some(v => v.includes(fname))
      expect(hasRef, `FILE_MAP still references ${fname}`).toBe(false)
    }
  })

  it('still contains master_resume_data key (not removed)', () => {
    expect(Object.keys(FILE_MAP)).toContain('master_resume_data')
  })
})

describe('config/read ALLOWED — proprietary files blocked', () => {
  it('verifies PROPRIETARY_KEYS are not in FILE_MAP (proxy for read allowlist)', () => {
    // The read route ALLOWED is tested via its own route test.
    // Here we verify the FILE_MAP (chat tool) doesn't expose them either.
    for (const key of PROPRIETARY_KEYS) {
      expect(Object.keys(FILE_MAP)).not.toContain(key)
    }
  })
})
