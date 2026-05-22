import { test, expect } from '@playwright/test'
import { mockStream } from '../../fixtures/sse-mock'

const TOUR_IDS = [
  'account-profile', 'settings-ai', 'settings-folder', 'settings-clipper-guide',
  'jobs-paste', 'jobs-scan', 'jobs-filter', 'jobs-table', 'jobs-generate', 'jobs-action',
  'dash-role-chart', 'dash-outputs', 'chat-intro', 'chat-github-import', 'config-intro',
]

test.describe('New user journey', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('new user signs up and submits first job', { timeout: 60000 }, async ({ page }) => {
    await page.addInitScript((ids: string[]) => {
      for (const id of ids) localStorage.setItem(`tour2_seen_${id}`, '1')
    }, TOUR_IDS)
    // Step 1: Navigate to signup
    await page.goto('/auth/signup')

    // Step 2: Fill email
    const uniqueEmail = `signup-journey-${Date.now()}@e2e.local`
    await page.getByLabel('Email').fill(uniqueEmail)

    // Step 3: Fill password
    await page.getByLabel(/Password/).fill('NewPass123!')

    // Step 4: Click create account
    await page.getByRole('button', { name: 'Create account' }).click()

    // Step 5: Wait for redirect to account page
    await page.waitForURL(/\/account$/)

    // Step 6: Assert account personal info section is visible
    await expect(page.locator('[data-tour="account-personal-info"]')).toBeVisible()

    // Step 7: Navigate to settings
    await page.goto('/settings')

    // Step 8: Assert AI settings section is visible
    await expect(page.locator('[data-tour="ai-settings"]')).toBeVisible()

    // Step 9: Mock AI provider check so generate button is enabled for new user
    await page.route('**/api/settings/ai', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ active_provider: 'ollama', providers: [], default_models: {}, configs: [] }),
        })
      } else {
        await route.continue()
      }
    })

    // Step 10: Navigate to jobs
    await page.goto('/jobs')

    // Step 11: Assert jobs table is visible
    await expect(page.locator('[data-tour="jobs-table"]')).toBeVisible()

    // Step 11: Click paste job button
    await page.locator('[data-tour="paste-jd-btn"]').click()

    // Step 12: Wait for modal to appear
    await expect(page.locator('[aria-label="Paste job posting"]')).toBeVisible()

    // Step 13: Fill the textarea with job posting markdown
    // Unique company per test run prevents INSERT OR IGNORE conflict across parallel browsers
    // (parseJd derives job ID from company+role slug, so same content = same ID = silent no-op)
    const uniqueCompany = `E2E Corp ${Date.now()}`
    const jobPosting = `---
title: Software Engineer
company: ${uniqueCompany}
location: Remote
---

## About the Role
Build scalable systems using Python and Go. Experience with distributed systems required.

## Requirements
- 2+ years backend experience
- Python or Go proficiency
- REST API design`

    await page.locator('[aria-label="Paste job posting"] textarea').fill(jobPosting)

    // Step 14: Click add job button — wait for POST then reload GET before asserting
    const addJobResponse = page.waitForResponse(r =>
      r.url().includes('/api/jobs') && r.request().method() === 'POST'
    )
    const reloadResponse = page.waitForResponse(r =>
      r.url().includes('/api/jobs') && r.request().method() === 'GET'
    )
    await page.getByRole('button', { name: 'Add job' }).click()
    await addJobResponse
    await reloadResponse

    // Step 15: Wait for modal to close
    await expect(page.locator('[aria-label="Paste job posting"]')).toBeHidden()

    // Step 16: Wait for new job row to appear in table
    await expect(
      page.locator('[data-tour="jobs-table"]').getByText('Software Engineer')
    ).toBeVisible({ timeout: 15000 })

    // Step 17: Select the job by clicking checkbox
    await page
      .locator('[data-tour="jobs-table"] tr')
      .filter({ hasText: 'Software Engineer' })
      .getByRole('checkbox')
      .click()

    // Step 18: Mock the stream and generate POST
    await page.route('**/api/generate', async (route) => {
      if (route.request().method() === 'POST') {
        const body = await route.request().postDataJSON() as { jobIds: string[] }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, validated: body.jobIds }),
        })
      } else {
        await route.continue()
      }
    })
    await mockStream(page)

    // Step 19: Click generate button and assert panel (waitForResponse doesn't fire for mocked SSE/EventSource)
    await page.locator('[data-tour="generate-btn"]').click()

    // Step 20: Assert generation panel is visible
    await expect(page.locator('[data-tour="generation-panel"]')).toBeVisible({ timeout: 15000 })
  })
})
