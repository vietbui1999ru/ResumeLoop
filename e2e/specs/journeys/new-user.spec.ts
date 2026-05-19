import { test, expect } from '@playwright/test'
import { mockStream } from '../../fixtures/sse-mock'

test.describe('New user journey', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('new user signs up and submits first job', async ({ page }) => {
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
    await expect(page).toHaveURL('http://localhost:3000/account')

    // Step 6: Assert account personal info section is visible
    await expect(page.locator('[data-tour="account-personal-info"]')).toBeVisible()

    // Step 7: Navigate to settings
    await page.goto('/settings')

    // Step 8: Assert AI settings section is visible
    await expect(page.locator('[data-tour="ai-settings"]')).toBeVisible()

    // Step 9: Navigate to jobs
    await page.goto('/jobs')

    // Step 10: Assert jobs table is visible
    await expect(page.locator('[data-tour="jobs-table"]')).toBeVisible()

    // Step 11: Click paste job button
    await page.locator('[data-tour="paste-jd-btn"]').click()

    // Step 12: Wait for modal to appear
    await expect(page.locator('[aria-label="Paste job posting"]')).toBeVisible()

    // Step 13: Fill the textarea with job posting markdown
    const jobPosting = `---
title: Software Engineer
company: Acme Corp
location: Remote
---

## About the Role
Build scalable systems using Python and Go. Experience with distributed systems required.

## Requirements
- 2+ years backend experience
- Python or Go proficiency
- REST API design`

    await page.locator('[aria-label="Paste job posting"] textarea').fill(jobPosting)

    // Step 14: Click add job button
    await page.getByRole('button', { name: 'Add job' }).click()

    // Step 15: Wait for modal to close
    await expect(page.locator('[aria-label="Paste job posting"]')).toBeHidden()

    // Step 16: Wait for new job row to appear in table
    await expect(
      page.locator('[data-tour="jobs-table"]').getByText('Software Engineer')
    ).toBeVisible()

    // Step 17: Select the job by clicking checkbox
    await page
      .locator('[data-tour="jobs-table"] tr')
      .filter({ hasText: 'Software Engineer' })
      .locator('input[type="checkbox"]')
      .click()

    // Step 18: Mock the stream
    await mockStream(page)

    // Step 19: Click generate button
    await page.locator('[data-tour="generate-btn"]').click()

    // Step 20: Assert generation panel is visible
    await expect(page.locator('[data-tour="generation-panel"]')).toBeVisible()
  })
})
