import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from './db'
import { computeMetrics } from './get-metrics'
import { SqliteAdapter } from './db-adapter'

function makeTestDb() {
  const db = new Database(':memory:')
  initSchema(db)
  return db
}

function adapter(db: ReturnType<typeof makeTestDb>) {
  return new SqliteAdapter(db)
}

function insertJob(db: ReturnType<typeof makeTestDb>, action: string | null, userId = 'default') {
  const id = Math.random().toString(36).slice(2)
  db.prepare(`
    INSERT INTO jd_jobs (id, file_path, visa_status, action, user_id)
    VALUES (?, ?, 'proceed', ?, ?)
  `).run(id, `/fake/${id}.md`, action, userId)
}

describe('computeMetrics user isolation', () => {
  it('returns zero totals when userId does not match stored rows', async () => {
    const db = makeTestDb()
    insertJob(db, '1-Applied', 'demo-user')
    insertJob(db, '3-Interview', 'demo-user')
    // Querying with wrong userId — this was the production dashboard bug
    const { total, pipeline } = await computeMetrics(adapter(db), 'wrong-user')
    expect(total).toBe(0)
    expect(pipeline.pending).toBe(0)
    expect(pipeline.applied).toBe(0)
  })

  it('returns correct data when userId matches', async () => {
    const db = makeTestDb()
    insertJob(db, '1-Applied', 'demo-user')
    insertJob(db, '0-Saved', 'demo-user')
    const { total, pipeline } = await computeMetrics(adapter(db), 'demo-user')
    expect(total).toBe(2)
    expect(pipeline.applied).toBe(1)
    expect(pipeline.pending).toBe(1)
  })

  it('does not leak rows across users', async () => {
    const db = makeTestDb()
    insertJob(db, '1-Applied', 'user-a')
    insertJob(db, '4-Offer', 'user-b')
    const a = await computeMetrics(adapter(db), 'user-a')
    const b = await computeMetrics(adapter(db), 'user-b')
    expect(a.total).toBe(1)
    expect(b.total).toBe(1)
    expect(a.pipeline.offer).toBe(0)
    expect(b.pipeline.offer).toBe(1)
  })
})

describe('computeMetrics pipeline counts', () => {
  it('handles malformed data without crashing', async () => {
    const db = makeTestDb()
    insertJob(db, null)
    insertJob(db, null)
    await expect(computeMetrics(adapter(db))).resolves.not.toThrow()
  })

  it('computeMetrics_ActionSaved_CountsAsPending', async () => {
    const db = makeTestDb()
    insertJob(db, '0-Saved')
    insertJob(db, null)
    const { pipeline } = await computeMetrics(adapter(db))
    expect(pipeline.pending).toBe(2)
    expect(pipeline.applied).toBe(0)
    expect(pipeline.resume_built).toBe(0)
  })

  it('computeMetrics_ActionApplied_CountsAsResumeBuiltAndApplied', async () => {
    const db = makeTestDb()
    insertJob(db, '1-Applied')
    const { pipeline } = await computeMetrics(adapter(db))
    expect(pipeline.resume_built).toBe(1)
    expect(pipeline.applied).toBe(1)
    expect(pipeline.pending).toBe(0)
  })

  it('computeMetrics_ActionPhoneScreen_CountsAsInterviewed', async () => {
    const db = makeTestDb()
    insertJob(db, '2-Phone Screen')
    const { pipeline } = await computeMetrics(adapter(db))
    expect(pipeline.interviewed).toBe(1)
  })

  it('computeMetrics_ActionOffer_CountsInOfferAndInterviewed', async () => {
    const db = makeTestDb()
    insertJob(db, '4-Offer')
    const { pipeline } = await computeMetrics(adapter(db))
    expect(pipeline.offer).toBe(1)
    expect(pipeline.interviewed).toBe(1)
  })

  it('computeMetrics_ActionGhosted_CountsAsAppliedNotInterviewed', async () => {
    const db = makeTestDb()
    insertJob(db, '6-Ghosted')
    const { pipeline } = await computeMetrics(adapter(db))
    expect(pipeline.applied).toBe(1)
    expect(pipeline.interviewed).toBe(0)
  })
})
