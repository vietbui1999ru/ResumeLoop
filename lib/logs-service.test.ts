import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    unlinkSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
  }
}))

vi.mock('./generation-logger', () => ({
  listLogs: vi.fn(),
  readLog: vi.fn(),
}))

import fs from 'fs'
import { listLogs, readLog } from './generation-logger'
import {
  resolveLogPath, toSummary, listSummaries, listFull,
  getLog, deleteLog, purgeAll,
} from './logs-service'
import type { GenerationLog } from './generation-logger'

const mockFs   = vi.mocked(fs)
const mockList = vi.mocked(listLogs)
const mockRead = vi.mocked(readLog)

const LOG_DIR = path.join(process.cwd(), 'logs', 'generate')

const validId = 'acme-swe__2026-05-09T20-53-46'
const sampleLog: GenerationLog = {
  jobId: 'acme-swe', company: 'Acme', role_title: 'SWE',
  started_at: '2026-05-09T20:53:46.000Z',
  completed_at: '2026-05-09T20:54:10.000Z',
  outcome: 'success',
  ai_decision: { score: 90 },
  script_content: 'console.log("hi")',
  stages: [{ stage: 'fetch', status: 'ok', ts: '', data: {} }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFs.existsSync.mockReturnValue(true)
})

describe('resolveLogPath', () => {
  it('accepts valid id and returns correct absolute path', () => {
    const result = resolveLogPath(validId)
    expect(result).toBe(path.join(LOG_DIR, `${validId}.json`))
  })

  it('rejects ids with ".."', () => {
    expect(resolveLogPath('../etc/passwd__2026-05-09T20-53-46')).toBeNull()
  })

  it('rejects ids with "/"', () => {
    expect(resolveLogPath('acme/swe__2026-05-09T20-53-46')).toBeNull()
  })

  it('rejects wrong format (missing timestamp)', () => {
    expect(resolveLogPath('acme-swe')).toBeNull()
  })

  it('rejects ids with null bytes', () => {
    expect(resolveLogPath('acme-swe__2026-05-09T20-53-\x0046')).toBeNull()
  })
})

describe('toSummary', () => {
  it('strips heavy fields and sets stage_count + id', () => {
    const summary = toSummary(sampleLog, validId)
    expect(summary.id).toBe(validId)
    expect(summary.stage_count).toBe(1)
    expect('stages' in summary).toBe(false)
    expect('ai_decision' in summary).toBe(false)
    expect('script_content' in summary).toBe(false)
  })
})

describe('listSummaries', () => {
  it('respects limit', () => {
    const paths = Array.from({ length: 5 }, (_, i) =>
      path.join(LOG_DIR, `job-${i}__2026-05-0${i + 1}T10-00-00.json`)
    )
    mockList.mockReturnValue(paths)
    mockRead.mockImplementation(p => ({ ...sampleLog, jobId: path.basename(p, '.json').split('__')[0] }))
    const result = listSummaries({ limit: 2 })
    expect(result).toHaveLength(2)
  })

  it('forwards jobId filter to listLogs', () => {
    mockList.mockReturnValue([])
    listSummaries({ limit: 10, jobId: 'acme' })
    expect(mockList).toHaveBeenCalledWith('acme')
  })
})

describe('listFull', () => {
  it('returns full GenerationLog bodies', () => {
    const logPath = path.join(LOG_DIR, `${validId}.json`)
    mockList.mockReturnValue([logPath])
    mockRead.mockReturnValue(sampleLog)
    const result = listFull({ limit: 10 })
    expect(result).toHaveLength(1)
    expect('stages' in result[0]).toBe(true)
  })
})

describe('getLog', () => {
  it('returns null for invalid id', () => {
    expect(getLog('bad-id')).toBeNull()
  })

  it('returns parsed log for valid id', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockRead.mockReturnValue(sampleLog)
    expect(getLog(validId)).toEqual(sampleLog)
  })
})

describe('deleteLog', () => {
  it('returns false for invalid id', () => {
    expect(deleteLog('bad-id')).toBe(false)
  })

  it('calls unlinkSync and returns true for valid id', () => {
    mockFs.existsSync.mockReturnValue(true)
    const result = deleteLog(validId)
    expect(result).toBe(true)
    expect(mockFs.unlinkSync).toHaveBeenCalledWith(path.join(LOG_DIR, `${validId}.json`))
  })
})

describe('purgeAll', () => {
  it('deletes all files and returns count', () => {
    const files = ['a__2026-05-01T10-00-00.json', 'b__2026-05-01T10-00-00.json']
    mockList.mockReturnValue(files.map(f => path.join(LOG_DIR, f)))
    const count = purgeAll()
    expect(count).toBe(2)
    expect(mockFs.unlinkSync).toHaveBeenCalledTimes(2)
  })

  it('returns count of successfully deleted files only', () => {
    const files = ['a__2026-05-01T10-00-00.json', 'b__2026-05-01T10-00-00.json']
    mockList.mockReturnValue(files.map(f => path.join(LOG_DIR, f)))
    mockFs.unlinkSync.mockImplementationOnce(() => { throw new Error('EACCES') })
    // First file fails, second succeeds
    const count = purgeAll()
    expect(count).toBe(1)
  })
})
