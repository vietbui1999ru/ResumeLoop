import { beforeEach, expect, it, vi } from 'vitest'
import type { IncomingMessage } from 'node:http'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/ingest/db', () => ({
  createIngestionSource: vi.fn(),
  updateIngestionSource: vi.fn(),
}))
vi.mock('@/lib/ingest/extract-url', () => ({ extractFromUrl: vi.fn() }))
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))
vi.mock('node:https', () => ({ request: vi.fn() }))
vi.mock('node:http',  () => ({ request: vi.fn() }))

import { auth } from '@/lib/auth'
import { createIngestionSource, updateIngestionSource } from '@/lib/ingest/db'
import { extractFromUrl } from '@/lib/ingest/extract-url'
import { lookup } from 'node:dns/promises'
import * as https from 'node:https'
import { POST } from './route'

function mockHttpsRequest(statusCode: number, location?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(https.request as any).mockImplementationOnce((_opts: unknown, cb?: (res: IncomingMessage) => void) => {
    const res = { statusCode, headers: { location }, resume: vi.fn() } as unknown as IncomingMessage
    cb?.(res)
    return { on: vi.fn(), end: vi.fn() }
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
  vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never)
  vi.mocked(createIngestionSource).mockResolvedValue({ id: 's1', status: 'pending' } as never)
  vi.mocked(updateIngestionSource).mockResolvedValue(undefined)
  vi.mocked(extractFromUrl).mockResolvedValue({ contact: { name: 'Jane' } } as never)
})

it('blocks hostnames that resolve to private IPs', async () => {
  vi.mocked(lookup).mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }] as never)

  const res = await POST(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://example.com' }),
  }))

  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'URL points to a disallowed host' })
})

it('blocks redirects to private/metadata endpoints', async () => {
  // First hop resolves OK; pinnedHead returns 302 to a private IP target
  mockHttpsRequest(302, 'http://169.254.169.254/latest/meta-data')
  // second host (169.254.169.254) is a direct IP — isDisallowedHost blocks it before DNS

  const res = await POST(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://example.com' }),
  }))

  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'URL points to a disallowed host' })
})

it('allows public URL and continues ingestion flow', async () => {
  mockHttpsRequest(200)
  const res = await POST(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://example.com/jobs/123' }),
  }))

  expect(res.status).toBe(200)
  expect(createIngestionSource).toHaveBeenCalledWith('u1', 'url', 'https://example.com/jobs/123')
  expect(extractFromUrl).toHaveBeenCalledWith('https://example.com/jobs/123', 'u1')
})
