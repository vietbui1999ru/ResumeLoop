import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from './db'
import { computeMetrics } from './get-metrics'

function makeTestDb() {
  const db = new Database(':memory:')
  initSchema(db)
  return db
}

function insertJob(db: ReturnType<typeof makeTestDb>, action: string | null) {
  const id = Math.random().toString(36).slice(2)
  db.prepare(`
    INSERT INTO jd_jobs (id, file_path, visa_status, action)
    VALUES (?, ?, 'proceed', ?)
  `).run(id, `/fake/${id}.md`, action)
}

describe('computeMetrics pipeline counts', () => {
  it('handles malformed data without crashing', () => {
    const db = makeTestDb()
    insertJob(db, null)
    insertJob(db, null)
    expect(() => computeMetrics(db)).not.toThrow()
  })

  it('computeMetrics_ActionSaved_CountsAsPending', () => {
    const db = makeTestDb()
    insertJob(db, '0-Saved')
    insertJob(db, null)
    const { pipeline } = computeMetrics(db)
    expect(pipeline.pending).toBe(2)
    expect(pipeline.applied).toBe(0)
    expect(pipeline.resume_built).toBe(0)
  })

  it('computeMetrics_ActionApplied_CountsAsResumeBuiltAndApplied', () => {
    const db = makeTestDb()
    insertJob(db, '1-Applied')
    const { pipeline } = computeMetrics(db)
    expect(pipeline.resume_built).toBe(1)
    expect(pipeline.applied).toBe(1)
    expect(pipeline.pending).toBe(0)
  })

  it('computeMetrics_ActionPhoneScreen_CountsAsInterviewed', () => {
    const db = makeTestDb()
    insertJob(db, '2-Phone Screen')
    const { pipeline } = computeMetrics(db)
    expect(pipeline.interviewed).toBe(1)
  })

  it('computeMetrics_ActionOffer_CountsInOfferAndInterviewed', () => {
    const db = makeTestDb()
    insertJob(db, '4-Offer')
    const { pipeline } = computeMetrics(db)
    expect(pipeline.offer).toBe(1)
    expect(pipeline.interviewed).toBe(1)
  })

  it('computeMetrics_ActionGhosted_CountsAsAppliedNotInterviewed', () => {
    const db = makeTestDb()
    insertJob(db, '6-Ghosted')
    const { pipeline } = computeMetrics(db)
    expect(pipeline.applied).toBe(1)
    expect(pipeline.interviewed).toBe(0)
  })
})
