import { describe, it, expect } from 'vitest'
import { parseRegistry, getRegistry, getSpec } from './registry'

describe('parseRegistry', () => {
  it('parses spawn + http specs and applies defaults', () => {
    const yaml = [
      'providers:',
      '  - id: x',
      '    label: X CLI',
      '    transport: spawn',
      '    bin: x',
      '  - id: h',
      '    label: H',
      '    transport: http',
      '    baseUrl: http://localhost:1234/v1',
      '    model: m',
    ].join('\n')
    const specs = parseRegistry(yaml)
    const x = specs.find(p => p.id === 'x')!
    expect(x.transport).toBe('spawn')
    if (x.transport === 'spawn') {
      expect(x.promptVia).toBe('stdin') // default
      expect(x.envelope).toBe('raw')    // default
      expect(x.nativeJson).toBe(false)  // default
      expect(x.args).toEqual([])        // default
    }
    expect(specs.find(p => p.id === 'h')?.transport).toBe('http')
  })

  it('throws on a spawn spec missing bin', () => {
    const yaml = 'providers:\n  - id: x\n    label: X\n    transport: spawn'
    expect(() => parseRegistry(yaml)).toThrow()
  })

  it('throws on an unknown transport', () => {
    const yaml = 'providers:\n  - id: x\n    label: X\n    transport: carrier-pigeon'
    expect(() => parseRegistry(yaml)).toThrow()
  })
})

describe('getRegistry (shipped config/providers.yml)', () => {
  it('loads claude (spawn) + ollama (http) + gemini', () => {
    const r = getRegistry()
    expect(r.find(p => p.id === 'claude')?.transport).toBe('spawn')
    expect(r.find(p => p.id === 'ollama')?.transport).toBe('http')
    expect(getSpec('gemini')?.transport).toBe('spawn')
    expect(getSpec('nope')).toBeUndefined()
  })

  it('claude carries the nativeJson + envelope flags', () => {
    const claude = getSpec('claude')
    expect(claude?.transport).toBe('spawn')
    if (claude?.transport === 'spawn') {
      expect(claude.nativeJson).toBe(true)
      expect(claude.envelope).toBe('claude')
    }
  })
})
