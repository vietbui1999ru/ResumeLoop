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
  const mocked = {
    ...actual,
    existsSync:   vi.fn(),
    mkdirSync:    vi.fn(),
    writeFileSync: vi.fn(),
    copyFileSync: vi.fn(),
    realpathSync: vi.fn(),
    readFileSync: vi.fn(),
    renameSync:   vi.fn(),
    rmSync:       vi.fn(),
  }
  // CJS interop: set `default` explicitly so `import fs from 'fs'` in tested
  // modules gets the mocked object, not the real CJS default.
  return { ...mocked, default: mocked }
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
import { saveOutput } from './storage'
import { isCloud } from './app-mode'
import { reasonForJob } from './ai-reason'
import { spawn } from 'child_process'
import * as fs from 'fs'

const mockedGetAdapter = vi.mocked(getAdapter)
const mockedGetSession = vi.mocked(getSession)
const mockedEnsureDefaultSession = vi.mocked(ensureDefaultSession)
const mockedReasonForJob = vi.mocked(reasonForJob)
const mockedSpawn = vi.mocked(spawn)
const mockedIsCloud = vi.mocked(isCloud)
const mockedSaveOutput = vi.mocked(saveOutput)
// fs is a CJS module — cast existsSync to access vi.fn() methods
const mockedExistsSync = fs.existsSync as unknown as ReturnType<typeof vi.fn>

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

  it('falls back to disk master data when profile data is missing a work id', async () => {
    const fakeJob = {
      id: 'job-stale', company: 'Acme', role_title: 'Engineer',
      file_path: '/jobs/acme.md', raw_content: 'JD content',
    }

    mockedSpawn.mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn().mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === 'close') cb(0)
      }),
      kill: vi.fn(),
    } as any)

    mockedExistsSync.mockReturnValue(true)
    mockedIsCloud.mockReturnValue(false)

    // Profile has OLD data — 'gitlab' not present
    const staleProfile = JSON.stringify({
      experience: [
        { id: 'techcorp',     bullets: { genai: ['Built A', 'Built B', 'Built C', 'Built D', 'Built E'] } },
        { id: 'startup',      bullets: { genai: ['Built A', 'Built B', 'Built C', 'Built D', 'Built E'] } },
        { id: 'research',     bullets: { genai: ['Built A', 'Built B', 'Built C', 'Built D', 'Built E'] } },
      ],
      projects: [
        { id: 'CalAI', bullets: ['Built X', 'Built Y', 'Built Z'] },
        { id: 'MRR Dashboard', bullets: ['Built X', 'Built Y', 'Built Z'] },
        { id: 'HomeBoard', bullets: ['Built X', 'Built Y', 'Built Z'] },
      ],
      skills: {},
    })
    // Disk file has the correct/current data with 'gitlab'
    const diskMaster = JSON.stringify({
      experience: [
        { id: 'gitlab',       bullets: { genai: ['Built A', 'Built B', 'Built C', 'Built D', 'Built E'] } },
        { id: 'carboncopies', bullets: { genai: ['Built A', 'Built B', 'Built C', 'Built D', 'Built E'] } },
        { id: 'udayton',      bullets: { genai: ['Built A', 'Built B', 'Built C', 'Built D', 'Built E'] } },
      ],
      projects: [
        { id: 'CalAI', bullets: ['Built X', 'Built Y', 'Built Z'] },
        { id: 'MRR Dashboard', bullets: ['Built X', 'Built Y', 'Built Z'] },
        { id: 'HomeBoard', bullets: ['Built X', 'Built Y', 'Built Z'] },
      ],
      skills: {},
    })

    const mockedReadFileSync = fs.readFileSync as unknown as ReturnType<typeof vi.fn>
    mockedReadFileSync.mockImplementation((p: string) => {
      if (String(p).endsWith('master.json')) return diskMaster
      return ''
    })

    mockedGetAdapter.mockResolvedValue({
      queryOne: vi.fn()
        .mockResolvedValueOnce(fakeJob)    // job lookup
        .mockResolvedValueOnce({ data: staleProfile }),  // active profile
      run: vi.fn(),
      query: vi.fn(),
    } as any)
    mockedEnsureDefaultSession.mockResolvedValue(undefined)
    mockedGetSession.mockResolvedValue({ id: 'sess-1', data: staleProfile } as any)
    mockedReasonForJob.mockResolvedValue({
      track: 'genai', workVariant: 'genai',
      workIds: ['gitlab', 'carboncopies', 'udayton'],
      projects: ['CalAI', 'MRR Dashboard', 'HomeBoard'],
      personaTitle: 'Software Engineer',
      tagline: 'Software Engineer building AI tools',
      skillsRows: ['TypeScript · React', 'Go · Python', 'Docker · k8s', 'PostgreSQL', 'Prometheus'],
      reasoning: 'good fit',
    } as any)

    const events = await collect(runPipeline('job-stale', 'sess-1', 'user-123'))
    const scriptError = events.find(e => e.stage === 'write-script' && e.status === 'fail')
    expect(scriptError).toBeUndefined() // must NOT fail with "Unknown work id: gitlab"
    expect(events.some(e => e.stage === 'write-script' && e.status === 'ok')).toBe(true)
  })

  it('uploads DOCX to S3 under outputs/<userId>/<jobId>/ in cloud mode', async () => {
    const fakeJob = {
      id: 'job-cloud',
      company: 'Acme',
      role_title: 'Engineer',
      file_path: '/jobs/acme.md',
      raw_content: 'JD content',
    }

    // spawn always succeeds (build + validate + pdf all return code 0)
    mockedSpawn.mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn().mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === 'close') cb(0)
      }),
      kill: vi.fn(),
    } as any)

    mockedExistsSync.mockReturnValue(true)
    mockedIsCloud.mockReturnValue(true)
    mockedSaveOutput.mockResolvedValue('s3:outputs/user-123/job-cloud/acme_engineer_VietBui.docx')

    mockedGetAdapter.mockResolvedValue({
      queryOne: vi.fn()
        .mockResolvedValueOnce(fakeJob)  // job lookup
        .mockResolvedValueOnce(null),    // active profile lookup
      run: vi.fn(),
      query: vi.fn(),
    } as any)
    mockedEnsureDefaultSession.mockResolvedValue(undefined)
    const masterData = JSON.stringify({
      experience: [
        { id: 'gitlab',       bullets: ['Built A', 'Built B', 'Built C', 'Built D', 'Built E'] },
        { id: 'carboncopies', bullets: ['Built A', 'Built B', 'Built C', 'Built D', 'Built E'] },
        { id: 'udayton',      bullets: ['Built A', 'Built B', 'Built C', 'Built D', 'Built E'] },
      ],
      projects: [
        { id: 'CalAI',         bullets: ['Built X', 'Built Y', 'Built Z'] },
        { id: 'MRR Dashboard', bullets: ['Built X', 'Built Y', 'Built Z'] },
        { id: 'HomeBoard',     bullets: ['Built X', 'Built Y', 'Built Z'] },
      ],
      skills: ['TypeScript · React · Node.js'],
    })
    mockedGetSession.mockResolvedValue({ id: 'sess-1', data: masterData } as any)
    mockedReasonForJob.mockResolvedValue({
      track: 'genai', workVariant: 'genai',
      workIds: ['gitlab', 'carboncopies', 'udayton'],
      projects: ['CalAI', 'MRR Dashboard', 'HomeBoard'],
      personaTitle: 'Software Engineer',
      tagline: 'Software Engineer building AI tools',
      skillsRows: ['TypeScript · React'],
      reasoning: 'good fit',
    } as any)

    await collect(runPipeline('job-cloud', 'sess-1', 'user-123'))

    // The first saveOutput call must use the userId-scoped key
    const firstCall = mockedSaveOutput.mock.calls[0]
    expect(firstCall[1]).toMatch(/^outputs\/user-123\/job-cloud\//)
  })
})
