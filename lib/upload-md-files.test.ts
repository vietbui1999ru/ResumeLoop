import { describe, it, expect } from 'vitest'
import { readUploadedMdFiles } from './upload-md-files'

function toFileList(files: File[]): FileList {
  return Object.assign(files, {
    item(index: number) {
      return files[index] ?? null
    },
  }) as unknown as FileList
}

describe('readUploadedMdFiles', () => {
  it('returns empty when no files are selected', async () => {
    await expect(readUploadedMdFiles(null)).resolves.toEqual({ files: [], skipped: 0 })
  })

  it('reads markdown files and skips non-markdown files', async () => {
    const files = toFileList([
      new File(['# role'], 'stripe.md', { type: 'text/markdown' }),
      new File(['ignore'], 'notes.txt', { type: 'text/plain' }),
      new File(['## jd'], 'META.MD', { type: 'text/markdown' }),
    ])

    const result = await readUploadedMdFiles(files)
    expect(result.skipped).toBe(1)
    expect(result.files).toEqual([
      { name: 'stripe.md', content: '# role' },
      { name: 'META.MD', content: '## jd' },
    ])
  })

  it('uses webkitRelativePath when available', async () => {
    const file = new File(['body'], 'fallback.md', { type: 'text/markdown' })
    Object.defineProperty(file, 'webkitRelativePath', { value: 'jobs/fallback.md' })

    const result = await readUploadedMdFiles(toFileList([file]))
    expect(result.files[0]?.name).toBe('jobs/fallback.md')
  })

  it('falls back to file.name when webkitRelativePath is blank', async () => {
    const file = new File(['body'], 'fallback.md', { type: 'text/markdown' })
    Object.defineProperty(file, 'webkitRelativePath', { value: '   ' })

    const result = await readUploadedMdFiles(toFileList([file]))
    expect(result.files[0]?.name).toBe('fallback.md')
  })
})
