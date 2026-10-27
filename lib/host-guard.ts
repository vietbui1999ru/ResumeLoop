import os from 'os'

// Host resource guard for the public demo box. Ollama runs as a separate process
// (or container), so app-level concurrency counters can't see its CPU usage —
// loadavg/freemem can. On Linux, /proc/loadavg is not cgroup-virtualized, so a
// containerized app still observes real host pressure; verify on the target
// kernel and cross-check node-exporter if values look wrong.

export interface HostPressure {
  load1: number
  cores: number
  loadPerCore: number
  freeMemPct: number
}

export function getHostPressure(): HostPressure {
  const load1 = os.loadavg()[0]
  const cores = os.cpus().length || 1
  return {
    load1,
    cores,
    loadPerCore: load1 / cores,
    freeMemPct: os.freemem() / os.totalmem(),
  }
}

export function isHostUnderPressure(): boolean {
  const { loadPerCore, freeMemPct } = getHostPressure()
  const loadThreshold = Number(process.env.HOST_GUARD_LOAD_THRESHOLD ?? '1.5')
  const memThreshold  = Number(process.env.HOST_GUARD_MIN_FREE_MEM_PCT ?? '0.1')
  return loadPerCore > loadThreshold || freeMemPct < memThreshold
}
