import { test, expect } from '@playwright/test'
import { mockStream } from '../../fixtures/sse-mock'

const TOUR_IDS = [
  'account-profile', 'settings-ai', 'settings-folder', 'settings-clipper-guide',
  'jobs-paste', 'jobs-scan', 'jobs-filter', 'jobs-table', 'jobs-generate', 'jobs-action',
  'dash-role-chart', 'dash-outputs', 'chat-intro', 'chat-github-import', 'config-intro',
]

test.describe('Returning user journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((ids: string[]) => {
      for (const id of ids) localStorage.setItem(`tour2_seen_${id}`, '1')
    }, TOUR_IDS)
  })

  test('selects a job and generates a resume', async ({ page }) => {
    // Navigate to jobs page
    await page.goto('/jobs')

    // Assert jobs table is visible
    const jobsTable = page.locator('[data-tour="jobs-table"]')
    await expect(jobsTable).toBeVisible()

    // Assert seeded job is visible in the table
    await expect(jobsTable.getByText('Backend Engineer')).toBeVisible()

    // Select the job via checkbox
    const jobRow = page
      .locator('[data-tour="jobs-table"] tr')
      .filter({ hasText: 'Backend Engineer' })
    const checkbox = jobRow.getByRole('checkbox')
    await checkbox.click()

    // Assert generate button is visible
    const generateBtn = page.locator('[data-tour="generate-btn"]')
    await expect(generateBtn).toBeVisible()

    // Register route mocks before setting up response listener
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

    // Click generate button
    await generateBtn.click()

    // Assert generation panel appears (waitForResponse doesn't fire for mocked SSE/EventSource)
    const generationPanel = page.locator('[data-tour="generation-panel"]')
    await expect(generationPanel).toBeVisible({ timeout: 15000 })
  })

})
