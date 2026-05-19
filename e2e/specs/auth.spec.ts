import { test, expect } from '@playwright/test'

test.describe('Sign in', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('loads sign in page', async ({ page }) => {
    await page.goto('/auth/signin')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('signs in with valid credentials', async ({ page }) => {
    await page.goto('/auth/signin')
    await page.getByLabel('Email').fill('test@e2e.local')
    await page.getByLabel('Password').fill('TestPass123!')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL('http://localhost:3000/')
  })

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/auth/signin')
    await page.getByLabel('Email').fill('test@e2e.local')
    await page.getByLabel('Password').fill('WrongPass99!')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByText('Invalid email or password')).toBeVisible()
  })
})

test.describe('Sign up', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('loads sign up page', async ({ page }) => {
    await page.goto('/auth/signup')
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible()
  })

  test('creates account and redirects', async ({ page }) => {
    const uniqueEmail = `signup-${Date.now()}@e2e.local`
    await page.goto('/auth/signup')
    await page.getByLabel('Email').fill(uniqueEmail)
    await page.getByLabel(/Password/).fill('NewPass123!')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL('http://localhost:3000/account')
  })

  test('shows error for duplicate email', async ({ page }) => {
    await page.goto('/auth/signup')
    await page.getByLabel('Email').fill('test@e2e.local')
    await page.getByLabel(/Password/).fill('TestPass123!')
    const submitButton = page.getByRole('button', { name: 'Create account' })
    await submitButton.click()

    await expect(page.getByText('Email already registered')).toBeVisible()
  })
})

test.describe('Forgot password', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('loads forgot password page', async ({ page }) => {
    await page.goto('/auth/forgot-password')
    await expect(page.getByRole('heading', { name: 'Reset password' })).toBeVisible()
  })

  test('shows confirmation after submit', async ({ page }) => {
    await page.goto('/auth/forgot-password')
    await page.getByLabel('Email').fill('test@e2e.local')
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByText(/If that email is registered/)).toBeVisible()
  })
})
