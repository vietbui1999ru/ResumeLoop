import path from 'path'
import fs from 'fs'
import { getDb, initSchema } from '../lib/db'
import { OLLAMA_DEFAULT_BASE_URL } from '../lib/config'

export default async function globalSetup() {
  process.env.DB_PATH = path.resolve('./test.db')

  // Clean up old test DB if it exists
  if (fs.existsSync(process.env.DB_PATH)) {
    fs.unlinkSync(process.env.DB_PATH)
  }

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

  // Seed ollama AI provider so generate button is enabled in returning-user tests.
  // Ollama requires no real API key — encrypted_key is intentionally empty.
  db.prepare(
    `INSERT INTO user_settings (user_id, provider, encrypted_key, model, base_url)
     VALUES (?, ?, ?, ?, ?)`
  ).run('test-user-id', 'ollama', '', 'gemma4:e2b', OLLAMA_DEFAULT_BASE_URL)

  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)`
  ).run('active_ai_provider:test-user-id', 'ollama')

  // Seed an active resume profile so the bullets editor Save button is enabled.
  // Without a profile, activeProfileId stays undefined and Save stays disabled.
  db.prepare(
    `INSERT INTO resume_profiles (id, user_id, name, data, is_active, created_at)
     VALUES (?, ?, ?, ?, 1, datetime('now'))`
  ).run(
    'test-profile-id',
    'test-user-id',
    'Test Profile',
    JSON.stringify({ experience: [], projects: [] }),
  )

  console.log('✓ Test database seeded with test user, returning-user job, AI provider, and resume profile')

  // Warm up the dev server by pre-fetching all routes used in tests.
  // Next.js dev mode compiles routes on first access — doing it here prevents
  // cold-start timeouts (especially on WebKit) when all tests run in parallel.
  const baseURL = 'http://localhost:3001'
  const warmupRoutes = [
    '/auth/signin', '/auth/signup', '/auth/forgot-password',
    '/', '/jobs', '/settings', '/account', '/chat', '/config',
  ]
  await Promise.allSettled(warmupRoutes.map(route =>
    fetch(`${baseURL}${route}`).catch(() => {})
  ))
  console.log('✓ Dev server routes warmed up')
}
