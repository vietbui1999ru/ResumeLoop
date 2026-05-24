import { describe, it, expect } from 'vitest'
import { TAG_TO_ACTION, ACTION_TO_TAG, PIPELINE_TAGS } from './pipeline-tags'

describe('TAG_TO_ACTION', () => {
  it('maps every pipeline tag key to a VALID_ACTION', () => {
    const keys = PIPELINE_TAGS.map(t => t.key)
    for (const key of keys) {
      expect(TAG_TO_ACTION[key]).toBeDefined()
      expect(TAG_TO_ACTION[key]).toMatch(/^\d-/)
    }
  })

  it('does not include 0-Saved (no tag for the default state)', () => {
    expect(Object.values(TAG_TO_ACTION)).not.toContain('0-Saved')
  })
})

describe('ACTION_TO_TAG', () => {
  it('is the exact inverse of TAG_TO_ACTION', () => {
    for (const [tagKey, action] of Object.entries(TAG_TO_ACTION)) {
      expect(ACTION_TO_TAG[action]).toBe(tagKey)
    }
  })

  it('returns undefined for 0-Saved (no tag maps to it)', () => {
    expect(ACTION_TO_TAG['0-Saved']).toBeUndefined()
  })
})
