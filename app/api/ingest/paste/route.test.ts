import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth',                 () => ({ auth: vi.fn() }))
vi.mock('@/lib/ingest/db',            () => ({
  createIngestionSource: vi.fn(),
  updateIngestionSource: vi.fn(),
}))
vi.mock('@/lib/ingest/extract-paste', () => ({ extractFromPaste: vi.fn() }))

import { auth }                       from '@/lib/auth'
import { createIngestionSource, updateIngestionSource } from '@/lib/ingest/db'
import { extractFromPaste }           from '@/lib/ingest/extract-paste'
import { POST }                       from './route'

beforeEach(() => vi.clearAllMocks())

it('returns 401 when not authenticated', async () => {
  vi.mocked(auth).mockResolvedValueOnce(null as never)
  const res = await POST(new Request('http://localhost', {
    method: 'POST', body: JSON.stringify({ text: 'hello' }),
  }))
  expect(res.status).toBe(401)
})

it('returns source with done status on success', async () => {
  vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1' } } as never)
  vi.mocked(createIngestionSource).mockResolvedValueOnce({ id: 's1', status: 'pending' } as never)
  vi.mocked(extractFromPaste).mockResolvedValueOnce({ contact: { name: 'Jane' } } as never)
  vi.mocked(updateIngestionSource).mockResolvedValue(undefined)

  const res = await POST(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ text: 'Jane Doe, Engineer at Acme Corp. Built many production systems.' }),
  }))
  const json = await res.json() as { source: { status: string } }
  expect(res.status).toBe(200)
  expect(json.source.status).toBe('done')
})

it('returns 422 and failed status when extraction throws', async () => {
  vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1' } } as never)
  vi.mocked(createIngestionSource).mockResolvedValueOnce({ id: 's1' } as never)
  vi.mocked(extractFromPaste).mockRejectedValueOnce(new Error('AI failed'))
  vi.mocked(updateIngestionSource).mockResolvedValue(undefined)

  const res = await POST(new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({ text: 'some text that is long enough to pass the minimum check' }),
  }))
  expect(res.status).toBe(422)
})
