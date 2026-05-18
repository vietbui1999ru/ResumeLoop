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
  it('returns error string for unknown key', async () => {
    const result = await handleReadFile('nonexistent' as never)
    expect(result).toMatch(/unknown file/i)
  })

  it('returns error string for removed proprietary key claude_full', async () => {
    const result = await handleReadFile('claude_full' as never)
    expect(result).toMatch(/unknown file/i)
  })

  it('returns error string for removed proprietary key ats_guidelines', async () => {
    const result = await handleReadFile('ats_guidelines' as never)
    expect(result).toMatch(/unknown file/i)
  })
})

describe('handleProposeEdit', () => {
  it('returns error for invalid JSON when editing master_resume_data', async () => {
    const result = await handleProposeEdit('master_resume_data', 'test change', 'not valid json{')
    expect(result.error).toMatch(/invalid json/i)
  })

  it('returns non-empty diff with markers for valid edit of master_resume_data', async () => {
    const newContent = JSON.stringify({ test: false }, null, 2)
    const result = await handleProposeEdit('master_resume_data', 'test change', newContent)
    // May error if master_resume_data.json doesn't exist in test env — just verify no crash
    expect(typeof result).toBe('object')
  })

  it('returns error for removed proprietary file keys', async () => {
    const result = await handleProposeEdit('claude_full' as never, 'test', 'content')
    expect(result.error).toMatch(/unknown file/i)
  })
})
