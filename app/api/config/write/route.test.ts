import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/paths', () => ({
  PATHS: {
    pipeline: { masterData: '/fake/master_resume_data.json' },
    docs: {
      atsSystem: '/fake/ats-optimized-resume-system.md',
      atsGuidelines: '/fake/ats-optimization-guidelines.md',
      claudeFull: '/fake/CLAUDE-full.md',
      spec: '/fake/spec-job-match-resume-generator.md',
    },
  },
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    copyFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    default: {
      ...(actual as typeof import('fs')),
      existsSync: vi.fn().mockReturnValue(false),
      copyFileSync: vi.fn(),
      writeFileSync: vi.fn(),
    },
  }
})

vi.mock('@/lib/run-script', () => ({
  checkNodeSyntax: vi.fn().mockResolvedValue({ code: 0, stderr: '' }),
}))

import { auth } from '@/lib/auth'

const authedSession = { user: { id: 'user-1' } }

function makeReq(body: unknown) {
  return new Request('http://localhost/api/config/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.mocked(auth).mockResolvedValue(authedSession as never)
})

describe('POST /api/config/write', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const res = await POST(makeReq({ file: 'master_resume_data.json', content: '{}' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for unknown file name', async () => {
    const res = await POST(makeReq({ file: 'buildv2.js', content: 'const x = 1' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/Unknown file/)
  })

  it('returns 400 when content exceeds 5 MB', async () => {
    const big = 'x'.repeat(5 * 1024 * 1024 + 1)
    const res = await POST(makeReq({ file: 'master_resume_data.json', content: big }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/too large/)
  })

  it('returns 400 when JSON file has invalid JSON content', async () => {
    const res = await POST(makeReq({ file: 'master_resume_data.json', content: '{bad json' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/Invalid JSON/)
  })

  it('returns 200 when valid JSON file submitted', async () => {
    const res = await POST(makeReq({ file: 'master_resume_data.json', content: '{"ok":true}' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
  })

  it('returns 400 when content is not a string', async () => {
    const res = await POST(makeReq({ file: 'master_resume_data.json', content: 123 }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/too large|Content/)
  })
})
