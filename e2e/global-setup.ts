import path from 'path'
import fs from 'fs'

export default async function globalSetup() {
  process.env.DB_PATH = path.resolve('./test.db')

  // Clean up old test DB if it exists
  if (fs.existsSync(process.env.DB_PATH)) {
    fs.unlinkSync(process.env.DB_PATH)
  }

  const { getDb, initSchema } = await import('../lib/db')
  const db = getDb()
  initSchema(db)

  // Seed test user
  const bcrypt = await import('bcryptjs')
  const hash = await bcrypt.hash('TestPass123!', 10)

  db.prepare(
    `INSERT INTO users (id, email, password, is_demo, email_verified, created_at)
     VALUES (?, ?, ?, 0, 1, datetime('now'))`
  ).run('test-user-id', 'test@e2e.local', hash)

  // Seed a pre-existing job for returning-user journey tests
  db.prepare(
    `INSERT INTO jd_jobs (id, file_path, company, role_title, raw_content, user_id, scanned_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    'seed-job-id',
    'JobData/Jobs/seed-returning-user.md',
    'Seed Corp',
    'Backend Engineer',
    '---\ntitle: Backend Engineer\ncompany: Seed Corp\n---\n\nBuild APIs.',
    'test-user-id',
  )

  console.log('✓ Test database seeded with test user and returning-user job')
}
