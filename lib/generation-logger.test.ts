import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs', () => {
  const mkdirSync = vi.fn()
  const writeFileSync = vi.fn()
  const existsSync = vi.fn().mockReturnValue(true)
  const readdirSync = vi.fn().mockReturnValue([])
  const readFileSync = vi.fn()
  return { default: { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } }
})

import fs from 'fs'
import { GenerationLogger, listLogs, readLog } from './generation-logger'

const mockFs = vi.mocked(fs)

beforeEach(() => {
  vi.clearAllMocks()
  mockFs.existsSync.mockReturnValue(true)
  mockFs.readdirSync.mockReturnValue([] as never)
})

describe('GenerationLogger constructor', () => {
  it('creates log dir and writes initial JSON', () => {
    new GenerationLogger('job-1', 'Acme', 'SWE')
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('logs/generate'), { recursive: true })
    expect(mockFs.writeFileSync).toHaveBeenCalled()
    const written = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string)
    expect(written.jobId).toBe('job-1')
    expect(written.company).toBe('Acme')
    expect(written.role_title).toBe('SWE')
    expect(written.stages).toEqual([])
  })
})

describe('GenerationLogger.stage', () => {
  it('appends a new stage entry', () => {
    const logger = new GenerationLogger('job-1', 'Acme', 'SWE')
    mockFs.writeFileSync.mockClear()
    logger.stage({ stage: 'fetch', status: 'ok', data: {} })
    const written = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string)
    expect(written.stages).toHaveLength(1)
    expect(written.stages[0].stage).toBe('fetch')
    expect(written.stages[0].status).toBe('ok')
  })

  it('replaces existing running entry for same stage', () => {
    const logger = new GenerationLogger('job-1', 'Acme', 'SWE')
    logger.stage({ stage: 'build', status: 'running', data: { attempt: 1 } })
    logger.stage({ stage: 'build', status: 'running', data: { attempt: 2 } })
    const written = JSON.parse(mockFs.writeFileSync.mock.calls.at(-1)![1] as string)
    expect(written.stages).toHaveLength(1)
    expect(written.stages[0].data.attempt).toBe(2)
  })

  it('replaces running entry when transitioning to ok status', () => {
    const logger = new GenerationLogger('job-1', 'Acme', 'SWE')
    logger.stage({ stage: 'build', status: 'running', data: { attempt: 1 } })
    logger.stage({ stage: 'build', status: 'ok', data: { result: 'success' } })
    const written = JSON.parse(mockFs.writeFileSync.mock.calls.at(-1)![1] as string)
    expect(written.stages).toHaveLength(1)
    expect(written.stages[0].status).toBe('ok')
  })
})

describe('GenerationLogger.setAIDecision', () => {
  it('sets ai_decision and flushes', () => {
    const logger = new GenerationLogger('job-1', 'Acme', 'SWE')
    logger.setAIDecision({ score: 90 })
    const written = JSON.parse(mockFs.writeFileSync.mock.calls.at(-1)![1] as string)
    expect(written.ai_decision).toEqual({ score: 90 })
  })

  it('overwrites previous ai_decision', () => {
    const logger = new GenerationLogger('job-1', 'Acme', 'SWE')
    logger.setAIDecision({ score: 80 })
    logger.setAIDecision({ score: 95, reason: 'updated' })
    const written = JSON.parse(mockFs.writeFileSync.mock.calls.at(-1)![1] as string)
    expect(written.ai_decision).toEqual({ score: 95, reason: 'updated' })
  })
})

describe('GenerationLogger.setScript', () => {
  it('sets script_path + script_content and flushes', () => {
    const logger = new GenerationLogger('job-1', 'Acme', 'SWE')
    logger.setScript('/tmp/build.js', 'console.log("hi")')
    const written = JSON.parse(mockFs.writeFileSync.mock.calls.at(-1)![1] as string)
    expect(written.script_path).toBe('/tmp/build.js')
    expect(written.script_content).toBe('console.log("hi")')
  })
})

describe('GenerationLogger.finish', () => {
  it('sets outcome + completed_at and flushes', () => {
    const logger = new GenerationLogger('job-1', 'Acme', 'SWE')
    logger.finish('success')
    const written = JSON.parse(mockFs.writeFileSync.mock.calls.at(-1)![1] as string)
    expect(written.outcome).toBe('success')
    expect(written.completed_at).toBeTruthy()
  })

  it('accepts failed outcome', () => {
    const logger = new GenerationLogger('job-1', 'Acme', 'SWE')
    logger.finish('failed')
    const written = JSON.parse(mockFs.writeFileSync.mock.calls.at(-1)![1] as string)
    expect(written.outcome).toBe('failed')
  })
})

describe('listLogs', () => {
  it('returns empty array when dir absent', () => {
    mockFs.existsSync.mockReturnValue(false)
    expect(listLogs()).toEqual([])
  })

  it('returns files sorted newest-first', () => {
    mockFs.readdirSync.mockReturnValue([
      'job-1__2026-05-01T10-00-00.json',
      'job-1__2026-05-03T10-00-00.json',
      'job-1__2026-05-02T10-00-00.json',
    ] as never)
    const result = listLogs()
    expect(result[0]).toContain('2026-05-03')
    expect(result[2]).toContain('2026-05-01')
  })

  it('filters by jobId prefix', () => {
    mockFs.readdirSync.mockReturnValue([
      'job-a__2026-05-01T10-00-00.json',
      'job-b__2026-05-01T10-00-00.json',
    ] as never)
    const result = listLogs('job-a')
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('job-a')
  })

  it('ignores non-JSON files', () => {
    mockFs.readdirSync.mockReturnValue([
      'job-1__2026-05-01T10-00-00.json',
      'job-1__2026-05-01T10-00-00.log',
      'readme.txt',
    ] as never)
    const result = listLogs()
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('.json')
  })
})

describe('readLog', () => {
  it('parses valid JSON and returns log', () => {
    const log = { jobId: 'x', company: 'A', role_title: 'B', started_at: '', stages: [] }
    mockFs.readFileSync.mockReturnValue(JSON.stringify(log) as never)
    expect(readLog('/any/path.json')).toEqual(log)
  })

  it('returns null on missing or corrupt file', () => {
    mockFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    expect(readLog('/bad/path.json')).toBeNull()
  })
})
