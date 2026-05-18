import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/settings', () => ({
  getAllSettings: vi.fn(),
  setSetting: vi.fn(),
}))
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    default: {
      ...(actual as typeof import('fs')),
      existsSync: vi.fn().mockReturnValue(true),
    },
  }
})

import { auth } from '@/lib/auth'
import { getAllSettings, setSetting } from '@/lib/settings'
import { GET, POST } from './route'

const mockAuth = vi.mocked(auth)
const mockGetAll = vi.mocked(getAllSettings)
const mockSetSetting = vi.mocked(setSetting)

const authedSession = { user: { id: 'user-1' } }
const fakeSettings = {
  jobs_path:     '/data/jobs',
  output_path:   '/data/output',
  outreach_path: '/data/outreach',
}

function makePostReq(body: unknown) {
  return new Request('http://localhost/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue(authedSession as never)
  mockGetAll.mockResolvedValue(fakeSettings as never)
  mockSetSetting.mockResolvedValue(undefined)
})

describe('GET /api/settings', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValueOnce(null as never)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns settings with path_exists flags', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.jobs_path).toBe('/data/jobs')
    expect(body.output_path).toBe('/data/output')
    expect(typeof body.jobs_path_exists).toBe('boolean')
    expect(typeof body.output_path_exists).toBe('boolean')
    expect(typeof body.outreach_path_exists).toBe('boolean')
  })

  // Regression: previously isCloud() returned 403 in cloud mode, blocking all users
  it('succeeds regardless of isCloud() — no 403 guard', async () => {
    // If the old guard were present, this would return 403.
    // Now it must return 200 for any authenticated user.
    const res = await GET()
    expect(res.status).not.toBe(403)
    expect(res.status).toBe(200)
  })
})

describe('POST /api/settings', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValueOnce(null as never)
    const res = await POST(makePostReq({ jobs_path: '/new/path' }))
    expect(res.status).toBe(401)
  })

  it('calls setSetting for provided paths and returns ok', async () => {
    const res = await POST(makePostReq({ jobs_path: '/new/jobs', output_path: '/new/out' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(mockSetSetting).toHaveBeenCalledWith('jobs_path', '/new/jobs')
    expect(mockSetSetting).toHaveBeenCalledWith('output_path', '/new/out')
    expect(mockSetSetting).not.toHaveBeenCalledWith('outreach_path', expect.anything())
  })

  it('trims whitespace from path values', async () => {
    await POST(makePostReq({ jobs_path: '  /trimmed  ' }))
    expect(mockSetSetting).toHaveBeenCalledWith('jobs_path', '/trimmed')
  })

  it('returns 400 when setSetting throws', async () => {
    mockSetSetting.mockRejectedValueOnce(new Error('invalid path'))
    const res = await POST(makePostReq({ jobs_path: '/bad' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid path')
  })

  // Regression: previously isCloud() returned 403 in cloud mode, blocking all users
  it('succeeds regardless of isCloud() — no 403 guard', async () => {
    const res = await POST(makePostReq({ jobs_path: '/efs/jobs' }))
    expect(res.status).not.toBe(403)
    expect(res.status).toBe(200)
  })
})
