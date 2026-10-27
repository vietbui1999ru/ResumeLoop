// Process-lifetime counters for Prometheus export — module-level state, same
// shape as the in-process stores in lib/rate-limit.ts. Keys are full Prometheus
// series identifiers including labels, e.g. `resumeloop_demo_429_total{route="generate"}`,
// so the metrics route can emit them verbatim.

const counters = new Map<string, number>()

export function incrCounter(series: string): void {
  counters.set(series, (counters.get(series) ?? 0) + 1)
}

export function counterEntries(): [string, number][] {
  return [...counters.entries()].sort(([a], [b]) => a.localeCompare(b))
}

export function _resetCountersForTests(): void {
  counters.clear()
}
