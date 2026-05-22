import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/ingest/db', () => ({
  createIngestionSource: vi.fn(),
  updateIngestionSource: vi.fn(),
}))
vi.mock('@/lib/ingest/extract-url', () => ({ extractFromUrl: vi.fn() }))
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))

import { auth } from '@/lib/auth'
import { createIngestionSource, updateIngestionSource } from '@/lib/ingest/db'
import { extractFromUrl } from '@/lib/ingest/extract-url'
import { lookup } from 'node:dns/promises'
import { POST } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })))
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

it('blocks hostnames that resolve to mixed public/private IPs', async () => {
  vi.mocked(lookup).mockResolvedValueOnce([
    { address: '93.184.216.34', family: 4 },
    { address: '192.168.1.10', family: 4 },
  ] as never)

  const res = await POST(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://example.com' }),
  }))

  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'URL points to a disallowed host' })
})

it('blocks redirects to private/metadata endpoints', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response('', {
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data' },
    }))
  )

  const res = await POST(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://example.com' }),
  }))

  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'URL points to a disallowed host' })
})

it('blocks IPv4-mapped IPv6 loopback addresses', async () => {
  const res = await POST(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ url: 'http://[::ffff:127.0.0.1]/' }),
  }))

  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'URL points to a disallowed host' })
})

it('allows public URL and continues ingestion flow', async () => {
  const res = await POST(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://example.com/jobs/123' }),
  }))

  expect(res.status).toBe(200)
  expect(createIngestionSource).toHaveBeenCalledWith('u1', 'url', 'https://example.com/jobs/123')
  expect(extractFromUrl).toHaveBeenCalledWith('https://example.com/jobs/123', 'u1')
})
