// Capture the quick-add dropdown and the rating panel at phone and desktop widths.
import { chromium } from '@playwright/test'
const out = '../.impeccable/review/'
const browser = await chromium.launch()
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  const page = await ctx.newPage()
  await page.goto('http://localhost:5173/login')
  await page.request.post('http://localhost:5173/api/auth/login', { data: { email: 'demo@example.com', password: 'konomi-demo-2026' } })
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.locator('.qa-hero input').fill('vinland')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${out}flow-search-${w}.png` })
  await page.locator('.qa-hero input').press('Enter')
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${out}flow-rate-${w}.png` })
  await page.getByRole('dialog').getByRole('button', { name: 'Loved it' }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${out}flow-duel-${w}.png` })
  await ctx.close()
}
await browser.close()
