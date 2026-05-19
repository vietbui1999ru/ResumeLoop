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

  console.log('✓ Test database seeded with test user')
}
