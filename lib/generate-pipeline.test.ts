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

// Mock createRequire so buildDocxInProcess doesn't hit the real filesystem
vi.mock('node:module', () => {
  const mockRequireFn = vi.fn().mockImplementation((mod: string) => {
    if (mod === './buildv2.js') {
      return { makeDoc: vi.fn().mockReturnValue({}), TL: (s: string) => s, T: (s: string) => s }
    }
    if (mod === 'docx') {
      return { Packer: { toBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-docx')) } }
    }
    throw new Error(`Unexpected require in test: ${mod}`)
  })
  return { createRequire: vi.fn().mockReturnValue(mockRequireFn) }
})

import { getAdapter } from './db-adapter'
import { getSession, ensureDefaultSession } from './sessions'
import { saveOutput } from './storage'
import { isCloud } from './app-mode'
import { reasonForJob } from './ai-reason'
import { spawn } from 'child_process'
import * as fs from 'fs'

function makeSpawnMock(opts: { code: number; stdout?: string; stderr?: string }) {
  return {
    stdout: { on: vi.fn((event: string, cb: (chunk: string) => void) => { if (event === 'data' && opts.stdout) cb(opts.stdout) }) },
    stderr: { on: vi.fn((event: string, cb: (chunk: string) => void) => { if (event === 'data' && opts.stderr) cb(opts.stderr) }) },
    on: vi.fn((event: string, cb: (code: number) => void) => { if (event === 'close') cb(opts.code) }),
    kill: vi.fn(),
  } as any
}

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

  it('falls back to disk master data when no active profile or session data exists', async () => {
    const fakeJob = {
      id: 'job-stale', company: 'Acme', role_title: 'Engineer',
      file_path: '/jobs/acme.md', raw_content: 'JD content',
    }

    mockedSpawn.mockReturnValue(makeSpawnMock({ code: 0 }))

    mockedExistsSync.mockReturnValue(true)
    mockedIsCloud.mockReturnValue(false)  // disk fallback only active in local mode

    // Disk file is the only source of data (no active profile, no session data)
    const diskMaster = JSON.stringify({
      experience: [
        { id: 'startup',    bullets: { genai: ['Built A', 'Built B', 'Built C', 'Built D', 'Built E'] } },
        { id: 'university', bullets: { genai: ['Built A', 'Built B', 'Built C', 'Built D', 'Built E'] } },
        { id: 'internship', bullets: { genai: ['Built A', 'Built B', 'Built C', 'Built D', 'Built E'] } },
      ],
      projects: [
        { id: 'CalAI',         bullets: ['Built X', 'Built Y', 'Built Z'] },
        { id: 'MRR Dashboard', bullets: ['Built X', 'Built Y', 'Built Z'] },
        { id: 'HomeBoard',     bullets: ['Built X', 'Built Y', 'Built Z'] },
      ],
      skills: ['TypeScript · React'],
    })

    const mockedReadFileSync = fs.readFileSync as unknown as ReturnType<typeof vi.fn>
    mockedReadFileSync.mockImplementation((p: string) => {
      if (String(p).endsWith('master.json')) return diskMaster
      return ''
    })

    mockedGetAdapter.mockResolvedValue({
      queryOne: vi.fn()
        .mockResolvedValueOnce(fakeJob)  // job lookup
        .mockResolvedValueOnce(null),    // no active profile in DB
      run: vi.fn(),
      query: vi.fn(),
    } as any)
    mockedEnsureDefaultSession.mockResolvedValue(undefined)
    mockedGetSession.mockResolvedValue({ id: 'sess-1', data: '' } as any)  // empty session → disk fallback
    mockedReasonForJob.mockResolvedValue({
      track: 'genai', workVariant: 'genai',
      workIds: ['startup', 'university', 'internship'],
      projects: ['CalAI', 'MRR Dashboard', 'HomeBoard'],
      personaTitle: 'Software Engineer',
      tagline: 'Software Engineer building AI tools',
      skillsRows: ['TypeScript · React', 'Go · Python', 'Docker · k8s', 'PostgreSQL', 'Prometheus'],
      reasoning: 'good fit',
    } as any)

    const events = await collect(runPipeline('job-stale', 'sess-1', 'user-123'))
    const scriptError = events.find(e => e.stage === 'write-script' && e.status === 'fail')
    expect(scriptError).toBeUndefined() // disk master loaded successfully — no write-script fail
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
    mockedSpawn.mockReturnValue(makeSpawnMock({ code: 0, stdout: '✓ VALID' }))

    mockedExistsSync.mockReturnValue(true)
    mockedIsCloud.mockReturnValue(true)
    mockedSaveOutput.mockResolvedValue('s3:outputs/user-123/job-cloud/acme_engineer_Resume.docx')

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
        { id: 'startup',      bullets: { genai: ['Built A', 'Built B', 'Built C', 'Built D', 'Built E'] } },
        { id: 'university',   bullets: { genai: ['Built A', 'Built B', 'Built C', 'Built D', 'Built E'] } },
        { id: 'internship',   bullets: { genai: ['Built A', 'Built B', 'Built C', 'Built D', 'Built E'] } },
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
      workIds: ['startup', 'university', 'internship'],
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

  // ── New regression tests ──────────────────────────────────────────────────

  it('preflight fails when masterDataJson is empty', async () => {
    const fakeJob = { id: 'j1', company: 'Acme', role_title: 'Eng', file_path: '/jobs/j.md', raw_content: 'JD' }
    mockedGetAdapter.mockResolvedValue({
      queryOne: vi.fn()
        .mockResolvedValueOnce(fakeJob)
        .mockResolvedValueOnce(null),  // no active profile
      run: vi.fn(), query: vi.fn(),
    } as any)
    mockedEnsureDefaultSession.mockResolvedValue(undefined)
    mockedGetSession.mockResolvedValue({ id: 's', data: '' } as any)  // empty session
    mockedIsCloud.mockReturnValue(true)  // no disk fallback in cloud

    const events = await collect(runPipeline('j1', 's', 'u'))
    const fail = events.find(e => e.stage === 'preflight' && e.status === 'fail')
    expect(fail).toBeDefined()
    expect(String(fail!.data.message)).toMatch(/No active resume profile/)
  })

  it('preflight fails when experience array is empty', async () => {
    const fakeJob = { id: 'j1', company: 'Acme', role_title: 'Eng', file_path: '/jobs/j.md', raw_content: 'JD' }
    const badProfile = JSON.stringify({ experience: [], projects: [{ id: 'p1', bullets: ['B'] }] })
    mockedGetAdapter.mockResolvedValue({
      queryOne: vi.fn()
        .mockResolvedValueOnce(fakeJob)
        .mockResolvedValueOnce({ data: badProfile }),
      run: vi.fn(), query: vi.fn(),
    } as any)
    mockedEnsureDefaultSession.mockResolvedValue(undefined)
    mockedGetSession.mockResolvedValue({ id: 's', data: '' } as any)

    const events = await collect(runPipeline('j1', 's', 'u'))
    const fail = events.find(e => e.stage === 'preflight' && e.status === 'fail')
    expect(fail).toBeDefined()
    expect(String(fail!.data.message)).toMatch(/at least 1 work entry/)
  })

  it('preflight emits warn status when profile has only 1 work entry', async () => {
    const fakeJob = { id: 'j1', company: 'Acme', role_title: 'Eng', file_path: '/jobs/j.md', raw_content: 'JD' }
    const thinProfile = JSON.stringify({
      contact: { name: 'Test User' },
      experience: [{ id: 'only', bullets: { genai: ['B1', 'B2', 'B3', 'B4', 'B5'] } }],
      projects: [
        { id: 'p1', bullets: ['P1', 'P2', 'P3'] },
        { id: 'p2', bullets: ['P1', 'P2', 'P3'] },
      ],
    })
    mockedGetAdapter.mockResolvedValue({
      queryOne: vi.fn()
        .mockResolvedValueOnce(fakeJob)
        .mockResolvedValueOnce({ data: thinProfile }),
      run: vi.fn(), query: vi.fn(),
    } as any)
    mockedEnsureDefaultSession.mockResolvedValue(undefined)
    mockedGetSession.mockResolvedValue({ id: 's', data: '' } as any)
    mockedSpawn.mockReturnValue({
      stdout: { on: vi.fn() }, stderr: { on: vi.fn() },
      on: vi.fn().mockImplementation((ev: string, cb: (c: number) => void) => { if (ev === 'close') cb(0) }),
      kill: vi.fn(),
    } as any)
    mockedExistsSync.mockReturnValue(true)
    mockedReasonForJob.mockResolvedValue({
      track: 'genai', workVariant: 'genai',
      workIds: ['only'], projects: ['p1', 'p2'],
      personaTitle: 'Engineer', tagline: 'Engineer building tools',
      skillsRows: ['Python · Go'], reasoning: 'ok',
    } as any)

    const events = await collect(runPipeline('j1', 's', 'u'))
    const preflight = events.filter(e => e.stage === 'preflight').at(-1)  // final preflight, not 'running'
    expect(preflight?.status).toBe('warn')
    expect((preflight?.data.warnings as string[]).some(w => w.includes('only 1 work entry'))).toBe(true)
  })

  it('write-script fails with actionable message when AI returns unknown work ID', async () => {
    const fakeJob = { id: 'j1', company: 'Acme', role_title: 'Eng', file_path: '/jobs/j.md', raw_content: 'JD' }
    const profile = JSON.stringify({
      contact: { name: 'Test' },
      experience: [{ id: 'valid_job', bullets: { genai: ['B1', 'B2', 'B3', 'B4', 'B5'] } }],
      projects:   [{ id: 'valid_proj', bullets: ['P1', 'P2', 'P3'] }],
    })
    mockedGetAdapter.mockResolvedValue({
      queryOne: vi.fn()
        .mockResolvedValueOnce(fakeJob)
        .mockResolvedValueOnce({ data: profile }),
      run: vi.fn(), query: vi.fn(),
    } as any)
    mockedEnsureDefaultSession.mockResolvedValue(undefined)
    mockedGetSession.mockResolvedValue({ id: 's', data: '' } as any)
    mockedSpawn.mockReturnValue(makeSpawnMock({ code: 0 }))
    mockedExistsSync.mockReturnValue(true)
    mockedReasonForJob.mockResolvedValue({
      track: 'genai', workVariant: 'genai',
      workIds: ['ghost_id'],  // doesn't exist in profile
      projects: ['valid_proj'],
      personaTitle: 'Engineer', tagline: 'Engineer',
      skillsRows: ['Python'], reasoning: 'ok',
    } as any)

    const events = await collect(runPipeline('j1', 's', 'u'))
    const fail = events.find(e => e.stage === 'write-script' && e.status === 'fail')
    expect(fail).toBeDefined()
    expect(String(fail!.data.message)).toMatch(/Unknown work id.*ghost_id/)
    expect(String(fail!.data.message)).toMatch(/valid_job/)
  })

  it('write-script fails when work entry has no bullets for variant or genai fallback', async () => {
    const fakeJob = { id: 'j1', company: 'Acme', role_title: 'Eng', file_path: '/jobs/j.md', raw_content: 'JD' }
    const profile = JSON.stringify({
      contact: { name: 'Test' },
      experience: [
        { id: 'j1', bullets: { systems: ['B1', 'B2'] } },  // no genai bullets
        { id: 'j2', bullets: { genai: ['B1', 'B2', 'B3', 'B4', 'B5'] } },
      ],
      projects: [{ id: 'p1', bullets: ['P1', 'P2', 'P3'] }],
    })
    mockedGetAdapter.mockResolvedValue({
      queryOne: vi.fn()
        .mockResolvedValueOnce(fakeJob)
        .mockResolvedValueOnce({ data: profile }),
      run: vi.fn(), query: vi.fn(),
    } as any)
    mockedEnsureDefaultSession.mockResolvedValue(undefined)
    mockedGetSession.mockResolvedValue({ id: 's', data: '' } as any)
    mockedSpawn.mockReturnValue(makeSpawnMock({ code: 0 }))
    mockedExistsSync.mockReturnValue(true)
    mockedReasonForJob.mockResolvedValue({
      track: 'genai', workVariant: 'genai',  // requests genai, j1 has no genai
      workIds: ['j1', 'j2'], projects: ['p1'],
      personaTitle: 'Engineer', tagline: 'Engineer',
      skillsRows: ['Python'], reasoning: 'ok',
    } as any)

    const events = await collect(runPipeline('j1', 's', 'u'))
    const fail = events.find(e => e.stage === 'write-script' && e.status === 'fail')
    expect(fail).toBeDefined()
    expect(String(fail!.data.message)).toMatch(/no bullets for variant/)
  })
})
