import { isHostUnderPressure } from './host-guard'

// Process-wide gate on concurrent local-model inference. The per-user inFlight
// map in the generate stream route caps a single user; this caps the box — on
// CPU-only hardware, concurrent gemma inference degrades every request rather
// than parallelizing, so the default is 1 slot (keep OLLAMA_NUM_PARALLEL in the
// compose file in agreement). Bounded queue wait, then callers shed load (429).

const MAX_SLOTS  = () => Math.max(1, Number(process.env.DEMO_MAX_CONCURRENT_INFERENCE ?? '1'))
const QUEUE_WAIT = () => Math.max(0, Number(process.env.DEMO_QUEUE_WAIT_MS ?? '5000'))

let inUse = 0

interface Waiter {
  grant: () => void
  timeout: NodeJS.Timeout
}
const waiters: Waiter[] = []

export type SlotResult =
  | { ok: true; release: () => void }
  | { ok: false; reason: 'busy' | 'host_pressure' }

function makeRelease(): () => void {
  let released = false
  return () => {
    if (released) return
    released = true
    const next = waiters.shift()
    if (next) {
      clearTimeout(next.timeout)
      next.grant() // slot hands off directly — inUse count unchanged
    } else {
      inUse--
    }
  }
}

export async function acquireInferenceSlot(): Promise<SlotResult> {
  if (isHostUnderPressure()) return { ok: false, reason: 'host_pressure' }
  if (inUse < MAX_SLOTS()) {
    inUse++
    return { ok: true, release: makeRelease() }
  }
  return new Promise<SlotResult>((resolve) => {
    const waiter: Waiter = {
      grant: () => resolve({ ok: true, release: makeRelease() }),
      timeout: setTimeout(() => {
        const i = waiters.indexOf(waiter)
        if (i !== -1) waiters.splice(i, 1)
        resolve({ ok: false, reason: 'busy' })
      }, QUEUE_WAIT()),
    }
    waiters.push(waiter)
  })
}

export function inferenceStats(): { inUse: number; queued: number } {
  return { inUse, queued: waiters.length }
}

export function _resetSemaphoreForTests(): void {
  inUse = 0
  for (const w of waiters) clearTimeout(w.timeout)
  waiters.length = 0
}
