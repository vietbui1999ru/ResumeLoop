import { describe, it, expect } from 'vitest'
import { handleReadFile, handleProposeEdit, CHAT_TOOLS } from './chat-tools'

describe('CHAT_TOOLS', () => {
  it('exports two tools with correct names', () => {
    expect(CHAT_TOOLS).toHaveLength(2)
    const names = CHAT_TOOLS.map(t => t.name)
    expect(names).toContain('read_file')
    expect(names).toContain('propose_edit')
  })
})

describe('handleReadFile', () => {
  it('returns content for spec key', async () => {
    const result = await handleReadFile('spec')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns error string for unknown key', async () => {
    const result = await handleReadFile('nonexistent' as never)
    expect(result).toMatch(/unknown file/i)
  })
})

describe('handleProposeEdit', () => {
  it('returns error for invalid JSON when editing master_resume_data', async () => {
    const result = await handleProposeEdit('master_resume_data', 'test change', 'not valid json{')
    expect(result.error).toMatch(/invalid json/i)
  })

  it('returns non-empty diff with markers for valid edit', async () => {
    const newContent = JSON.stringify({ test: false }, null, 2)
    const result = await handleProposeEdit('spec', 'test change', newContent)
    expect(result.error).toBeUndefined()
    expect(result.diff).toMatch(/^---/m)    // diff header present
    expect(result.diff).toMatch(/^\+/m)     // has added lines
  })
})
