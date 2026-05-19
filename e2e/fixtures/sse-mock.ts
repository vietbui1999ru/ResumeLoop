import { Page } from '@playwright/test'

export async function mockStream(page: Page): Promise<void> {
  const events = [
    { stage: 'visa_check', status: 'ok' },
    { stage: 'role_map', status: 'ok' },
    { stage: 'bullet_select', status: 'ok' },
    { stage: 'build_docx', status: 'ok' },
    { stage: 'done', status: 'ok' },
  ]

  const sseBody = events
    .map((event) => `data: ${JSON.stringify(event)}`)
    .join('\n\n')
    .concat('\n\n')

  await page.route(/\/api\/generate\/.*\/stream/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseBody,
    })
  })
}
