import { expect, test, type Page } from '@playwright/test'

const MAILPIT = 'http://localhost:8025/api/v1'

async function code(page: Page, email: string, nth = 0): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const msgs = (await (await page.request.get(`${MAILPIT}/search?query=to:${encodeURIComponent(email)}`)).json()).messages ?? []
    if (msgs.length > nth) {
      const body = await (await page.request.get(`${MAILPIT}/message/${msgs[0].ID}`)).json()
      return /\b(\d{6})\b/.exec(body.Text)![1]
    }
    await page.waitForTimeout(250)
  }
  throw new Error('no mail')
}

async function signUp(page: Page, tag: string) {
  const email = `more-${tag}@example.com`
  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel(/^Username/).fill(`m_${tag}`.slice(0, 20))
  await page.getByLabel(/^Password/).fill('first-pass-11')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByLabel('Digit 1').fill(await code(page, email))
  await page.getByRole('button', { name: 'Verify email' }).click()
  await expect(page.locator('.qa-hero input')).toBeVisible()
  return email
}

test('season walk marks, status changes, favourites, password reset', async ({ page, browser }, info) => {
  const tag = `${info.project.name.slice(0, 1)}${Date.now().toString(36)}`
  const email = await signUp(page, tag)

  // Season walk: tap marks watched, "Dropped" marks dropped.
  await page.goto('/sweep?year=2019&season=SPRING')
  const tiles = page.locator('.sw')
  await expect(tiles.first()).toBeVisible()
  await tiles.nth(0).locator('.sw-main').click()
  await tiles.nth(1).locator('.sw-main').click()
  await tiles.nth(2).getByRole('button', { name: 'Dropped' }).click()
  await expect(tiles.nth(0)).toHaveClass(/is-marked/)
  await expect(page.getByText(/2 of \d+ watched/)).toBeVisible()

  // Chart shows them; the dropped filter shows exactly one.
  await page.goto('/chart')
  await page.getByRole('tab', { name: /^Dropped/ }).click()
  await expect(page.locator('.tile')).toHaveCount(1)

  // Title page: change a watched title to dropped.
  await page.getByRole('tab', { name: /^Watched/ }).click()
  await page.locator('.tile').first().click()
  await expect(page).toHaveURL(/\/anime\//)
  await page.getByRole('button', { name: 'Dropped', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Dropped', exact: true })).toHaveAttribute('aria-pressed', 'true')

  // Favourites: pick one in Customise; it shows on the profile.
  await page.goto('/settings')
  await page.getByRole('button', { name: /Pick favourites/ }).click()
  await page.locator('.set-pick').first().click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText(/1\/10/)).toBeVisible()

  // Password reset via email code, then log in with the new password.
  const fresh = await browser.newContext()
  const p2 = await fresh.newPage()
  await p2.goto('/reset')
  await p2.getByLabel('Email').fill(email)
  await p2.getByRole('button', { name: 'Send code' }).click()
  await p2.getByLabel('Digit 1').fill(await code(p2, email, 1))
  await p2.getByLabel('New password').fill('second-pass-22')
  await p2.getByRole('button', { name: 'Set new password' }).click()
  await expect(p2.locator('.qa-hero input')).toBeVisible()
  const r = await p2.request.post('/api/auth/login', { data: { email, password: 'first-pass-11' } })
  expect(r.status()).toBe(401)
  await fresh.close()
})
