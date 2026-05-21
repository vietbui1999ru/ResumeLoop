import { test, expect } from '@playwright/test'

// Cycle that starts at a guaranteed change from the seeded default (0-Saved)
const ACTION_CYCLE = [
  '1-Applied',
  '2-Phone Screen',
  '3-Interview',
  '4-Offer',
  '5-Rejected',
  '6-Ghosted',
  '0-Saved',
] as const

const TOUR_IDS = [
  'jobs-paste', 'jobs-scan', 'jobs-filter', 'jobs-table',
  'jobs-generate', 'jobs-action', 'action-cell',
]

test.describe('Jobs — action stage transitions', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((ids: string[]) => {
      for (const id of ids) localStorage.setItem(`tour2_seen_${id}`, '1')
    }, TOUR_IDS)
  })

  test('cycles through all action stages and each PATCH returns 200', async ({ page }) => {
    await page.goto('/jobs')

    const jobsTable = page.locator('[data-tour="jobs-table"]')
    await expect(jobsTable).toBeVisible()

    const jobRow = jobsTable.locator('tr').filter({ hasText: 'Backend Engineer' })
    await expect(jobRow).toBeVisible()

    const actionSelect = jobRow.locator('select')
    await expect(actionSelect).toBeVisible()

    for (const action of ACTION_CYCLE) {
      const [response] = await Promise.all([
        page.waitForResponse(
          r => r.url().includes('/api/jobs/') && r.url().includes('/action') && r.request().method() === 'PATCH'
        ),
        actionSelect.selectOption(action),
      ])

      expect(response.status(), `PATCH to ${action} returned non-200`).toBe(200)
      await expect(actionSelect).toHaveValue(action)
      await expect(jobRow.locator('.text-red-400')).not.toBeVisible()
    }
  })

  test('shows inline error when API returns 404', async ({ page }) => {
    await page.route('**/api/jobs/*/action', route =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not found' }),
      })
    )

    await page.goto('/jobs')

    const jobRow = page.locator('[data-tour="jobs-table"] tr').filter({ hasText: 'Backend Engineer' })
    const actionSelect = jobRow.locator('select')
    await expect(actionSelect).toBeVisible()

    await actionSelect.selectOption('1-Applied')

    await expect(jobRow.locator('.text-red-400')).toBeVisible({ timeout: 6_000 })
  })

  test('smoke — action dropdown present on jobs page', async ({ page }) => {
    await page.goto('/jobs')
    await expect(page.locator('[data-tour="action-cell"]')).toBeVisible()
    await expect(page.locator('[data-tour="action-cell"]').locator('option')).toHaveCount(7)
  })
})
