import { describe, it, expect } from 'vitest'
import { extractLastJsonBlock } from './extract-json'

describe('extractLastJsonBlock', () => {
  it('returns null when there is no JSON', () => {
    expect(extractLastJsonBlock('just some prose')).toBeNull()
  })

  it('extracts a bare JSON object', () => {
    expect(extractLastJsonBlock('{"a":1}')).toBe('{"a":1}')
  })

  it('extracts JSON from a ```json fence surrounded by prose', () => {
    expect(extractLastJsonBlock('here you go:\n```json\n{"a":1}\n```\nthanks')).toBe('{"a":1}')
  })

  it('extracts JSON from an unlabeled ``` fence', () => {
    expect(extractLastJsonBlock('```\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('prefers the LAST fenced block when several are present', () => {
    const text = 'draft:\n```json\n{"v":1}\n```\nfinal:\n```json\n{"v":2}\n```'
    expect(extractLastJsonBlock(text)).toBe('{"v":2}')
  })

  it('tolerates leading/trailing whitespace inside the fence', () => {
    expect(extractLastJsonBlock('```json\n\n  {"a":1}  \n\n```')).toBe('{"a":1}')
  })
})
