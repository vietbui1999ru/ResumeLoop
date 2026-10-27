import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockGuard = vi.hoisted(() => ({ underPressure: false }))
vi.mock('./host-guard', () => ({
  isHostUnderPressure: () => mockGuard.underPressure,
}))

import { acquireInferenceSlot, inferenceStats, _resetSemaphoreForTests } from './inference-semaphore'

beforeEach(() => {
  _resetSemaphoreForTests()
  mockGuard.underPressure = false
  vi.stubEnv('DEMO_MAX_CONCURRENT_INFERENCE', '1')
  vi.stubEnv('DEMO_QUEUE_WAIT_MS', '50')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('acquireInferenceSlot', () => {
  it('grants a slot when free', async () => {
    const slot = await acquireInferenceSlot()
    expect(slot.ok).toBe(true)
    expect(inferenceStats().inUse).toBe(1)
  })

  it('release frees the slot and is idempotent', async () => {
    const slot = await acquireInferenceSlot()
    if (!slot.ok) throw new Error('expected slot')
    slot.release()
    slot.release() // double-release must not corrupt the count
    expect(inferenceStats().inUse).toBe(0)
    const again = await acquireInferenceSlot()
    expect(again.ok).toBe(true)
  })

  it('sheds load with reason busy when the wait times out', async () => {
    const first = await acquireInferenceSlot()
    expect(first.ok).toBe(true)
    const second = await acquireInferenceSlot()
    expect(second).toEqual({ ok: false, reason: 'busy' })
  })

  it('hands the slot to a queued waiter on release', async () => {
    vi.stubEnv('DEMO_QUEUE_WAIT_MS', '1000')
    const first = await acquireInferenceSlot()
    if (!first.ok) throw new Error('expected slot')
    const pending = acquireInferenceSlot()
    expect(inferenceStats().queued).toBe(1)
    first.release()
    const second = await pending
    expect(second.ok).toBe(true)
    expect(inferenceStats().inUse).toBe(1)
    expect(inferenceStats().queued).toBe(0)
  })

  it('refuses immediately under host pressure', async () => {
    mockGuard.underPressure = true
    const slot = await acquireInferenceSlot()
    expect(slot).toEqual({ ok: false, reason: 'host_pressure' })
    expect(inferenceStats().inUse).toBe(0)
  })

  it('respects a raised concurrency cap', async () => {
    vi.stubEnv('DEMO_MAX_CONCURRENT_INFERENCE', '2')
    const a = await acquireInferenceSlot()
    const b = await acquireInferenceSlot()
    expect(a.ok && b.ok).toBe(true)
    expect(inferenceStats().inUse).toBe(2)
    const c = await acquireInferenceSlot()
    expect(c.ok).toBe(false)
  })
})
