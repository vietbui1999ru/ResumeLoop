import { test, expect } from '@playwright/test'

test.describe('Feedback page', () => {
  test('loads and shows page header', async ({ page }) => {
    await page.goto('/feedback')
    await expect(page).toHaveURL('/feedback')
    await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible()
    await expect(page.locator('[data-testid="feedback-page"]')).toBeVisible()
  })

  test('renders giscus widget container', async ({ page }) => {
    await page.goto('/feedback')
    await expect(page.locator('[data-testid="giscus-widget"]')).toBeVisible()
  })

  test('shows giscus iframe or fallback link within timeout', async ({ page }) => {
    await page.goto('/feedback')
    // Either the iframe loads successfully, or the error fallback link appears
    await expect(
      page.locator('[data-testid="giscus-widget"] iframe, [data-testid="giscus-widget"] a[href*="github.com"]')
    ).toBeVisible({ timeout: 15_000 })
  })

  test('shows github discussions fallback when giscus is blocked', async ({ page }) => {
    // Simulate network failure for giscus.app
    await page.route('https://giscus.app/**', route => route.abort())
    await page.goto('/feedback')
    const fallbackLink = page.locator(
      '[data-testid="giscus-widget"] a[href="https://github.com/vietbui1999ru/ResumeLoop/discussions"]'
    )
    await expect(fallbackLink).toBeVisible({ timeout: 15_000 })
    await expect(fallbackLink).toHaveText('Open GitHub Discussions →')
  })
})
