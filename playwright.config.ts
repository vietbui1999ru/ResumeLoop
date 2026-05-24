import path from 'path'
import { defineConfig, devices } from '@playwright/test'

// When DOCKER_E2E=true, the `app` container is already running — skip webServer.
// Set BASE_URL=http://app:3000 in the claude container's environment.
const isDockerE2E = !!process.env.DOCKER_E2E

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: process.env.CI ? 2 : 4,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3001',
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    // webkit excluded from CI: Linux WebKit requires system graphics deps not
    // present in containers and flakes on auth redirects. Test Safari locally.
  ],

  globalSetup: require.resolve('./e2e/global-setup'),

  ...(!isDockerE2E && {
    webServer: {
      command: 'npm run dev -- -p 3001',
      url: 'http://localhost:3001',
      reuseExistingServer: false,
      env: {
        DB_PATH: path.resolve('./test.db'),
        NEXTAUTH_SECRET: 'test-secret-for-e2e-only',
        NEXTAUTH_URL: 'http://localhost:3001',
        DISABLE_RATE_LIMIT: 'true',
      },
    },
  }),
})
