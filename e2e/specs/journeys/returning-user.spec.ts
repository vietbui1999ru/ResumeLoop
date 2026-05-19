import { test, expect } from '@playwright/test'
import { mockStream } from '../../fixtures/sse-mock'

test.describe('Returning user journey', () => {
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
    const checkbox = jobRow.locator('input[type="checkbox"]')
    await checkbox.click()

    // Assert generate button is visible
    const generateBtn = page.locator('[data-tour="generate-btn"]')
    await expect(generateBtn).toBeVisible()

    // Set up stream response wait before clicking
    const streamResponse = page.waitForResponse('**/api/generate/**/stream')

    // Mock the SSE stream
    await mockStream(page)

    // Click generate button
    await generateBtn.click()

    // Await stream response
    await streamResponse

    // Assert generation panel appears
    const generationPanel = page.locator('[data-tour="generation-panel"]')
    await expect(generationPanel).toBeVisible()
  })

  test('filters jobs by company name', async ({ page }) => {
    // Navigate to jobs page
    await page.goto('/jobs')

    // Assert filters bar is visible
    const filtersBar = page.locator('[data-tour="filters-bar"]')
    await expect(filtersBar).toBeVisible()

    // Find filter input and type 'Backend'
    const filterInput = filtersBar.locator('input[type="text"]')
    await filterInput.fill('Backend')

    // Assert the Backend Engineer row remains visible after filter
    const jobsTable = page.locator('[data-tour="jobs-table"]')
    await expect(jobsTable.getByText('Backend Engineer')).toBeVisible()

    // Clear the filter input
    await filterInput.fill('')

    // Assert row still visible after clearing filter
    await expect(jobsTable.getByText('Backend Engineer')).toBeVisible()
  })
})
