import { test, expect } from '@playwright/test'

test.describe('Smoke — all routes', () => {
  // NO test.use storageState override — reuse global auth

  test('dashboard loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/')
    await expect(page.locator('[data-tour="dashboard-role-chart"]')).toBeVisible()
    await expect(page.locator('[data-tour="dashboard-outputs"]')).toBeVisible()
  })

  test('jobs loads', async ({ page }) => {
    await page.goto('/jobs')
    await expect(page).toHaveURL('/jobs')
    await expect(page.locator('[data-tour="jobs-table"]')).toBeVisible()
    await expect(page.locator('[data-tour="filters-bar"]')).toBeVisible()
  })

  test('settings loads', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL('/settings')
    await expect(page.locator('[data-tour="ai-settings"]')).toBeVisible()
  })

  test('account loads', async ({ page }) => {
    await page.goto('/account')
    await expect(page).toHaveURL('/account')
    await expect(page.locator('[data-tour="account-personal-info"]')).toBeVisible()
  })

  test('chat loads', async ({ page }) => {
    await page.goto('/chat')
    await expect(page).toHaveURL('/chat')
    await expect(page.locator('[data-tour="chat-github-import"]')).toBeVisible()
  })

  test('config loads', async ({ page }) => {
    await page.goto('/config')
    await expect(page).toHaveURL('/config')
    await expect(page.getByRole('heading', { name: 'Config' })).toBeVisible()
  })
})
