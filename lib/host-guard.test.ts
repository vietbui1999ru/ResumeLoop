import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockOs = vi.hoisted(() => ({
  loadavg: vi.fn(() => [1, 1, 1]),
  cpus: vi.fn(() => new Array(4).fill({})),
  freemem: vi.fn(() => 8_000_000_000),
  totalmem: vi.fn(() => 16_000_000_000),
}))

vi.mock('os', () => ({ default: mockOs, ...mockOs }))

import { getHostPressure, isHostUnderPressure } from './host-guard'

beforeEach(() => {
  mockOs.loadavg.mockReturnValue([1, 1, 1])
  mockOs.cpus.mockReturnValue(new Array(4).fill({}))
  mockOs.freemem.mockReturnValue(8_000_000_000)
  mockOs.totalmem.mockReturnValue(16_000_000_000)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getHostPressure', () => {
  it('computes load per core and free memory fraction', () => {
    mockOs.loadavg.mockReturnValue([2, 0, 0])
    const p = getHostPressure()
    expect(p.load1).toBe(2)
    expect(p.cores).toBe(4)
    expect(p.loadPerCore).toBe(0.5)
    expect(p.freeMemPct).toBe(0.5)
  })

  it('never divides by zero when cpus() is empty', () => {
    mockOs.cpus.mockReturnValue([])
    const p = getHostPressure()
    expect(p.cores).toBe(1)
    expect(Number.isFinite(p.loadPerCore)).toBe(true)
  })
})

describe('isHostUnderPressure', () => {
  it('is false under normal load and memory', () => {
    expect(isHostUnderPressure()).toBe(false)
  })

  it('trips when load per core exceeds the threshold', () => {
    mockOs.loadavg.mockReturnValue([8, 0, 0]) // 2.0 per core > default 1.5
    expect(isHostUnderPressure()).toBe(true)
  })

  it('trips when free memory drops below the floor', () => {
    mockOs.freemem.mockReturnValue(800_000_000) // 5% free < default 10%
    expect(isHostUnderPressure()).toBe(true)
  })

  it('honors env-tuned thresholds', () => {
    vi.stubEnv('HOST_GUARD_LOAD_THRESHOLD', '3')
    mockOs.loadavg.mockReturnValue([8, 0, 0]) // 2.0 per core < tuned 3
    expect(isHostUnderPressure()).toBe(false)
  })
})
