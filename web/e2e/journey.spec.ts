import { expect, test, type Page } from '@playwright/test'

const MAILPIT = 'http://localhost:8025/api/v1'

async function latestCode(page: Page, email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await page.request.get(`${MAILPIT}/search?query=to:${encodeURIComponent(email)}`)
    const msgs = (await res.json()).messages ?? []
    if (msgs.length) {
      const body = await (await page.request.get(`${MAILPIT}/message/${msgs[0].ID}`)).json()
      return /\b(\d{6})\b/.exec(body.Text)![1]
    }
    await page.waitForTimeout(250)
  }
  throw new Error('no OTP mail')
}

async function addAndRate(page: Page, q: string, tier: string) {
  const input = page.locator('.qa-hero input')
  await input.fill(q)
  await expect(page.locator('.qa-hero .qa-row').first()).toBeVisible()
  await input.press('Enter')
  // Adding never pops the panel open; the toast offers it.
  await page.locator('.toast').getByRole('button', { name: 'Rate it' }).click()
  const panel = page.getByRole('dialog')
  await expect(panel.getByText(/How was/)).toBeVisible()
  await panel.getByRole('button', { name: tier }).click()
  // Answer any placement duels by preferring the new title (left side).
  for (let i = 0; i < 8; i++) {
    if (await panel.getByText(/is on your chart/).isVisible()) break
    const duel = panel.locator('.duel-side').first()
    if (await duel.isVisible()) await duel.click()
    await page.waitForTimeout(300)
  }
  await expect(panel.getByText(/is on your chart/)).toBeVisible()
  await panel.getByRole('button', { name: 'Done' }).click()
  await expect(panel).toBeHidden()
}

test('sign up, add, rate, get recommendations, share a public profile', async ({ page, browser }, info) => {
  const tag = `${info.project.name}${Date.now().toString(36)}`
  const email = `e2e-${tag}@example.com`
  const username = `e2e_${tag}`.slice(0, 20)

  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel(/^Username/).fill(username)
  await page.getByLabel(/^Password/).fill('correct-horse-42')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  const code = await latestCode(page, email)
  await page.getByLabel('Digit 1').fill(code)
  await page.getByRole('button', { name: 'Verify email' }).click()
  await expect(page.locator('.qa-hero input')).toBeVisible()

  await addAndRate(page, 'frieren', 'One of my favourites')
  await addAndRate(page, 'steins gate', 'Loved it')
  await addAndRate(page, 'one piece', 'Loved it')

  await page.goto('/chart')
  await expect(page.getByRole('heading', { name: 'Your chart' })).toBeVisible()
  await expect(page.locator('.obi-num').first()).toBeVisible()

  await page.goto('/taste')
  await expect(page.getByRole('heading', { name: 'You’ll probably love' })).toBeVisible()
  await expect(page.locator('.recs .rec').first()).toBeVisible()
  await expect(page.locator('.rec-why').first()).toContainText('because you liked')

  await page.goto('/settings')
  await page.getByText('Private', { exact: true }).click()
  await expect(page.getByText('Public', { exact: true })).toBeVisible()

  const anon = await browser.newContext()
  const anonPage = await anon.newPage()
  await anonPage.goto(`/u/${username}`)
  await expect(anonPage.getByRole('heading', { name: username })).toBeVisible()
  await expect(anonPage.getByRole('heading', { name: 'All-time favourites' })).toBeVisible()

  await page.getByText('Public', { exact: true }).click()
  await expect(page.getByText('Private', { exact: true })).toBeVisible()
  await anonPage.reload()
  await expect(anonPage.getByRole('heading', { name: 'This chart is private' })).toBeVisible()
  await anon.close()
})
