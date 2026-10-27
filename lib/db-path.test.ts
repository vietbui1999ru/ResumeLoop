import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// getDb() caches its connection on the real Node `global` object (survives
// Next.js dev hot-reload) — must be cleared alongside resetModules() or every
// test after the first reuses the first test's DB_PATH decision.
function resetDbSingleton() {
  vi.resetModules()
  delete (global as unknown as { _db?: unknown })._db
}

describe('getDb DB_PATH safety check', () => {
  let tmpProjectDir: string
  let tmpHomeDir: string
  let originalCwd: () => string

  beforeEach(() => {
    resetDbSingleton()
    tmpProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-path-project-'))
    tmpHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-path-home-'))
    originalCwd = process.cwd
    vi.spyOn(process, 'cwd').mockReturnValue(tmpProjectDir)
  })

  afterEach(() => {
    delete process.env.DB_PATH
    delete process.env.RESUMELOOP_HOME
    vi.spyOn(process, 'cwd').mockImplementation(originalCwd)
    fs.rmSync(tmpProjectDir, { recursive: true, force: true })
    fs.rmSync(tmpHomeDir, { recursive: true, force: true })
  })

  it('accepts a DB_PATH under process.cwd() (existing behavior)', async () => {
    process.env.DB_PATH = path.join(tmpProjectDir, 'resume.db')
    const { getDb } = await import('./db')
    expect(() => getDb().close()).not.toThrow()
  })

  it('accepts a DB_PATH under RESUMELOOP_HOME even when outside cwd', async () => {
    process.env.RESUMELOOP_HOME = tmpHomeDir
    process.env.DB_PATH = path.join(tmpHomeDir, '.cache', 'resume.db')
    fs.mkdirSync(path.join(tmpHomeDir, '.cache'), { recursive: true })
    const { getDb } = await import('./db')
    expect(() => getDb().close()).not.toThrow()
  })

  it('rejects a DB_PATH outside both cwd and RESUMELOOP_HOME', async () => {
    process.env.RESUMELOOP_HOME = tmpHomeDir
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-path-outside-'))
    try {
      process.env.DB_PATH = path.join(outsideDir, 'resume.db')
      const { getDb } = await import('./db')
      expect(() => getDb()).toThrow(/must be within the project directory or RESUMELOOP_HOME/)
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true })
    }
  })
})
