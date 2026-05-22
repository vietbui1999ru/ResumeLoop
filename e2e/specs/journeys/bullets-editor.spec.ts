import { test, expect } from '@playwright/test'

const TOUR_IDS = ['chat-intro', 'chat-github-import']

test.describe('Bullets editor — chat page', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((ids: string[]) => {
      for (const id of ids) localStorage.setItem(`tour2_seen_${id}`, '1')
    }, TOUR_IDS)
    await page.goto('/chat')
  })

  // ── Tab navigation ─────────────────────────────────────────────────

  test('bullets panel shows three tabs: Rendered, Markdown, JSON', async ({ page }) => {
    await expect(page.getByTestId('tab-rendered')).toBeVisible()
    await expect(page.getByTestId('tab-markdown')).toBeVisible()
    await expect(page.getByTestId('tab-json')).toBeVisible()
  })

  test('Rendered tab is active by default', async ({ page }) => {
    const renderedTab = page.getByTestId('tab-rendered')
    await expect(renderedTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('tab-markdown')).toHaveAttribute('aria-selected', 'false')
    await expect(page.getByTestId('tab-json')).toHaveAttribute('aria-selected', 'false')
  })

  test('Markdown tab shows bullet lines and has no input/textarea elements', async ({ page }) => {
    await page.getByTestId('tab-markdown').click()
    await expect(page.getByTestId('tab-markdown')).toHaveAttribute('aria-selected', 'true')

    const content = page.getByTestId('markdown-content')
    await expect(content).toBeVisible()

    // No interactive inputs in the markdown view
    await expect(content.locator('input')).toHaveCount(0)
    await expect(content.locator('textarea')).toHaveCount(0)
  })

  test('JSON tab shows textarea with JSON content and a Save button', async ({ page }) => {
    await page.getByTestId('tab-json').click()

    const textarea = page.getByTestId('json-textarea')
    await expect(textarea).toBeVisible()

    // Content should be parseable JSON (profile loaded from API)
    const content = await textarea.inputValue()
    expect(() => JSON.parse(content)).not.toThrow()

    await expect(page.getByTestId('save-button')).toBeVisible()
  })

  test('unsaved JSON draft is preserved when switching tabs and back', async ({ page }) => {
    await page.getByTestId('tab-json').click()

    const textarea = page.getByTestId('json-textarea')
    const original = await textarea.inputValue()

    // Make a whitespace-only edit so JSON stays valid
    await textarea.fill(original + '   ')

    // Switch to markdown then back
    await page.getByTestId('tab-markdown').click()
    await page.getByTestId('tab-json').click()

    const preserved = await page.getByTestId('json-textarea').inputValue()
    expect(preserved).toBe(original + '   ')
  })

  // ── Save flow — client validation ──────────────────────────────────

  test('invalid JSON in textarea blocks Save and shows inline error', async ({ page }) => {
    let patchFired = false
    await page.route('**/api/profiles/**', route => {
      if (route.request().method() === 'PATCH') patchFired = true
      return route.continue()
    })

    await page.getByTestId('tab-json').click()
    await page.getByTestId('json-textarea').fill('{ bad json <<<')
    await page.getByTestId('save-button').click()

    await expect(page.getByTestId('client-error')).toBeVisible()
    await expect(page.getByTestId('client-error')).toContainText(/invalid json/i)
    expect(patchFired).toBe(false)
  })

  test('bullet over 116 chars blocks Save and shows char-limit error', async ({ page }) => {
    let patchFired = false
    await page.route('**/api/profiles/**', route => {
      if (route.request().method() === 'PATCH') patchFired = true
      return route.continue()
    })

    await page.getByTestId('tab-json').click()
    const longBullet = 'A'.repeat(117)
    const badJson = JSON.stringify({
      experience: [{ id: 'test', bullets: { v: [longBullet] } }],
      projects: [],
    })
    await page.getByTestId('json-textarea').fill(badJson)
    await page.getByTestId('save-button').click()

    await expect(page.getByTestId('client-error')).toBeVisible()
    await expect(page.getByTestId('client-error')).toContainText('117')
    expect(patchFired).toBe(false)
  })

  // ── Save flow — success ────────────────────────────────────────────

  test('valid save shows green flash and Save button text changes', async ({ page }) => {
    await page.getByTestId('tab-json').click()

    const textarea = page.getByTestId('json-textarea')
    const original = await textarea.inputValue()

    // Re-save the same valid content (no-op data change, still a valid PATCH)
    await textarea.fill(original)
    await page.getByTestId('save-button').click()

    const saveBtn = page.getByTestId('save-button')
    await expect(saveBtn).toContainText('Saved', { timeout: 5000 })
  })

  test('Save button is disabled while request is in-flight', async ({ page }) => {
    // Intercept and delay the PATCH response
    await page.route('**/api/profiles/**', async route => {
      if (route.request().method() === 'PATCH') {
        await new Promise(r => setTimeout(r, 800))
        await route.continue()
      } else {
        await route.continue()
      }
    })

    await page.getByTestId('tab-json').click()
    const textarea = page.getByTestId('json-textarea')
    const original = await textarea.inputValue()
    await textarea.fill(original)

    const saveBtn = page.getByTestId('save-button')
    await saveBtn.click()

    // Button should be disabled while the delayed request is in-flight
    await expect(saveBtn).toBeDisabled()
  })

  // ── Save flow — server error ───────────────────────────────────────

  test('simulated server error shows red error message without crashing', async ({ page }) => {
    await page.route('**/api/profiles/**', async route => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Service unavailable' }),
        })
      } else {
        await route.continue()
      }
    })

    await page.getByTestId('tab-json').click()
    const textarea = page.getByTestId('json-textarea')
    const original = await textarea.inputValue()
    await textarea.fill(original)

    await page.getByTestId('save-button').click()

    await expect(page.getByTestId('server-error')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('server-error')).toContainText(/unavailable/i)

    // Button should be re-enabled after failure
    await expect(page.getByTestId('save-button')).not.toBeDisabled()
  })
})
