import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runPipeline, SSEEvent } from './generate-pipeline'

vi.mock('./db-adapter', () => ({ getAdapter: vi.fn() }))
vi.mock('./ai-reason', () => ({ reasonForJob: vi.fn() }))
vi.mock('./settings', () => ({ getSetting: vi.fn().mockResolvedValue('/tmp/test-output') }))
vi.mock('./sessions', () => ({
  ensureDefaultSession: vi.fn(),
  getSession: vi.fn(),
}))
vi.mock('./generation-logger', () => ({
  GenerationLogger: vi.fn().mockImplementation(() => ({
    stage: vi.fn(),
    finish: vi.fn(),
    setAIDecision: vi.fn(),
    setScript: vi.fn(),
  })),
}))
vi.mock('./app-mode', () => ({ isCloud: vi.fn().mockReturnValue(false) }))
vi.mock('./storage', () => ({ saveOutput: vi.fn(), isS3Key: vi.fn().mockReturnValue(false) }))
vi.mock('./paths', () => ({
  PATHS: {
    pipeline: { builder: '/fake/buildv2.js', masterData: '/fake/master.json' },
  },
}))
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    copyFileSync: vi.fn(),
    realpathSync: vi.fn(),
    readFileSync: vi.fn(),
    renameSync: vi.fn(),
    rmSync: vi.fn(),
  }
})
vi.mock('child_process', () => ({
  spawn: vi.fn().mockReturnValue({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  }),
}))

import { getAdapter } from './db-adapter'
import { getSession, ensureDefaultSession } from './sessions'

const mockedGetAdapter = vi.mocked(getAdapter)
const mockedGetSession = vi.mocked(getSession)
const mockedEnsureDefaultSession = vi.mocked(ensureDefaultSession)

async function collect(gen: AsyncGenerator<SSEEvent>): Promise<SSEEvent[]> {
  const events: SSEEvent[] = []
  for await (const e of gen) events.push(e)
  return events
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runPipeline', () => {
  it('yields preflight error when job not found', async () => {
    mockedGetAdapter.mockResolvedValue({
      queryOne: vi.fn().mockResolvedValue(null),
      run: vi.fn(),
      query: vi.fn(),
    } as any)

    const events = await collect(runPipeline('missing-job-id'))

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ stage: 'preflight', status: 'fail' })
    expect(events[0].data.message).toContain('missing-job-id')
  })

  it('stops early when signal is already aborted before preflight', async () => {
    const fakeJob = {
      id: 'job-1',
      company: 'Acme',
      role_title: 'Engineer',
      file_path: '/jobs/job.md',
      raw_content: 'JD content',
    }
    mockedGetAdapter.mockResolvedValue({
      queryOne: vi.fn().mockResolvedValue(fakeJob),
      run: vi.fn(),
      query: vi.fn(),
    } as any)
    mockedEnsureDefaultSession.mockResolvedValue(undefined)
    mockedGetSession.mockResolvedValue({ id: 'default', data: '{}' } as any)

    const signal = AbortSignal.abort()
    const events = await collect(runPipeline('job-1', 'default', 'default', signal))

    const errorEvent = events.find(e => e.status === 'fail')
    expect(errorEvent).toBeDefined()
    expect(errorEvent!.status).toBe('fail')
  })
})
