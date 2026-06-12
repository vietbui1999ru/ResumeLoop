import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { initWorkspace } from './init'
import { readJobs, readProfile } from './read'
import { reindex, listJobs } from './index-db'
import { profilePath, jobsDir, indexPath } from './paths'

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-ws-')) })
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

function writeJob(name: string, company: string, title: string) {
  fs.writeFileSync(
    path.join(jobsDir(root), name),
    `---\ncompany: ${company}\ntitle: ${title}\nsource: https://x.example/1\n---\nWe are hiring an engineer.\n`,
  )
}

describe('initWorkspace', () => {
  it('scaffolds data dirs + profile.json + .gitignore', () => {
    initWorkspace(root)
    expect(fs.existsSync(profilePath(root))).toBe(true)
    expect(fs.existsSync(jobsDir(root))).toBe(true)
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toContain('.cache/')
    expect(readProfile(root)).toMatchObject({ experience: [], projects: [] })
  })

  it('is idempotent — never overwrites an edited profile', () => {
    initWorkspace(root)
    fs.writeFileSync(profilePath(root), JSON.stringify({ contact: { name: 'Edited' } }))
    initWorkspace(root)
    expect(readProfile(root)).toMatchObject({ contact: { name: 'Edited' } })
  })
})

describe('readJobs', () => {
  it('parses every job markdown file and skips README', () => {
    initWorkspace(root)
    writeJob('acme.md', 'Acme', 'Software Engineer')
    writeJob('globex.md', 'Globex', 'Backend Engineer')
    const jobs = readJobs(root)
    expect(jobs.map(j => j.company).sort()).toEqual(['Acme', 'Globex'])
  })

  it('returns [] when the workspace has no jobs dir', () => {
    expect(readJobs(root)).toEqual([])
  })
})

describe('reindex + listJobs', () => {
  it('indexes job files and serves them from the index', () => {
    initWorkspace(root)
    writeJob('acme.md', 'Acme', 'Software Engineer')
    expect(reindex(root).jobs).toBe(1)
    const list = listJobs(root)
    expect(list).toHaveLength(1)
    expect(list[0].company).toBe('Acme')
    expect(list[0].role_title).toBe('Software Engineer')
  })

  it('listJobs is empty before any reindex', () => {
    initWorkspace(root)
    expect(listJobs(root)).toEqual([])
  })

  it('deleting the index and reindexing reproduces identical state', () => {
    initWorkspace(root)
    writeJob('a.md', 'Acme', 'SWE')
    writeJob('b.md', 'Globex', 'SRE')
    reindex(root)
    const before = listJobs(root)
    expect(before).toHaveLength(2)

    for (const ext of ['', '-wal', '-shm']) fs.rmSync(indexPath(root) + ext, { force: true })
    expect(fs.existsSync(indexPath(root))).toBe(false)

    reindex(root)
    expect(listJobs(root)).toEqual(before)
  })
})
