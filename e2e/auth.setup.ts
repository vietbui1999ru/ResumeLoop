import { test as setup, expect } from '@playwright/test'
import path from 'path'

const authFile = path.join(__dirname, '.auth/user.json')

setup('authenticate', async ({ page }) => {
  await page.goto('/auth/signin')

  // Fill email and password
  await page.getByLabel('Email').fill('test@e2e.local')
  await page.getByLabel('Password').fill('TestPass123!')

  // Sign in
  await page.getByRole('button', { name: /sign in/i }).click()

  // Wait for redirect to home page
  await page.waitForURL('/')
  await expect(page).toHaveURL('/')

  // Save authentication state (cookies + localStorage)
  await page.context().storageState({ path: authFile })
  console.log(`✓ Authentication state saved to ${authFile}`)
})
