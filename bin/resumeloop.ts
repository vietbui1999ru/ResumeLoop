#!/usr/bin/env -S npx tsx
/**
 * resumeloop CLI (ADR 0001 §11). Run via tsx today; wired as a global `bin`
 * when the tool is packaged for npm (#11).
 *
 *   resumeloop init [dir]     scaffold a files-canonical workspace (default: cwd)
 *   resumeloop reindex [dir]  rebuild .cache/index.db from the job files
 */
import { initWorkspace } from '../lib/workspace/init'
import { reindex } from '../lib/workspace/index-db'
import { workspaceRoot } from '../lib/workspace/paths'

function main(argv: string[]): number {
  const [cmd, dir] = argv
  switch (cmd) {
    case 'init': {
      const root = dir ? require('node:path').resolve(dir) : process.cwd()
      const { created } = initWorkspace(root)
      console.log(`✓ workspace ready at ${root} (${created.length} path(s) created)`)
      console.log('  next: add jobs to data/jobs/*.md, then `resumeloop reindex`')
      return 0
    }
    case 'reindex': {
      const root = dir ? require('node:path').resolve(dir) : workspaceRoot()
      const { jobs } = reindex(root)
      console.log(`✓ reindexed ${jobs} job(s) → ${root}/.cache/index.db`)
      return 0
    }
    default:
      console.error('usage: resumeloop <init|reindex> [dir]')
      return 1
  }
}

process.exit(main(process.argv.slice(2)))
