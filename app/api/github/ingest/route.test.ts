import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { auth } from '@/lib/auth'
import { parseGithubUrl, summarizeRepo } from '@/lib/github-ingest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/github-ingest', () => ({
  parseGithubUrl: vi.fn(),
  summarizeRepo: vi.fn(),
}))

const mockedAuth = vi.mocked(auth)
const mockedParseGithubUrl = vi.mocked(parseGithubUrl)
const mockedSummarizeRepo = vi.mocked(summarizeRepo)

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/github/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/github/ingest', () => {
  it('returns 401 when unauthenticated and does not call parseGithubUrl', async () => {
    mockedAuth.mockResolvedValue(null as any)

    const res = await POST(makeRequest({ url: 'https://github.com/owner/repo' }))

    expect(res.status).toBe(401)
    expect(mockedParseGithubUrl).not.toHaveBeenCalled()
  })

  it('returns 400 when url field is missing from body', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any)

    const res = await POST(makeRequest({}))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/url required/i)
  })

  it('returns 400 when url exceeds 300 characters', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any)
    const longUrl = 'https://github.com/' + 'a'.repeat(290)

    const res = await POST(makeRequest({ url: longUrl }))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/too long/i)
  })

  it('returns 400 when parseGithubUrl returns null', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockedParseGithubUrl.mockReturnValue(null)

    const res = await POST(makeRequest({ url: 'https://not-github.com/owner/repo' }))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid github url/i)
  })

  it('returns 200 with repo data on success', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockedParseGithubUrl.mockReturnValue({ owner: 'octocat', repo: 'hello-world' })
    const fakeEntry = { id: 'repo-1', summary: 'A test repo' }
    mockedSummarizeRepo.mockResolvedValue(fakeEntry as any)

    const res = await POST(makeRequest({ url: 'https://github.com/octocat/hello-world' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(fakeEntry)
  })

  it('returns 404 when summarizeRepo throws a 404 error', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockedParseGithubUrl.mockReturnValue({ owner: 'octocat', repo: 'private-repo' })
    mockedSummarizeRepo.mockRejectedValue(new Error('GitHub API returned 404'))

    const res = await POST(makeRequest({ url: 'https://github.com/octocat/private-repo' }))

    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toMatch(/not found/i)
  })
})
