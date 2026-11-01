// Fast tapping on the Season walk: a mark, once shown, must never blink off while saves are in flight.
// Usage: node scripts/tap-check.mjs [year] [season] [--slow]   (local demo account; the taps are undone at the end)
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:5173'
const [year = '2014', season = 'SPRING'] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const browser = await chromium.launch()
const login = await browser.newContext()
await login.request.post(BASE + '/api/auth/login', { data: { email: 'demo@example.com', password: 'konomi-demo-2026' } })
const ctx = await browser.newContext({ storageState: await login.storageState(), viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
// --slow: every server call takes 200 to 800 ms, like a phone on the real network.
if (process.argv.includes('--slow')) await page.route('**/api/**', async (r) => { await new Promise((ok) => setTimeout(ok, 200 + Math.random() * 600)); await r.continue() })
await page.goto(`${BASE}/sweep?year=${year}&season=${season}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.sw')

// Only tap covers that are not marked yet, so the test can undo exactly what it did.
const idx = await page.locator('.sw').evaluateAll((xs) => xs.map((x, i) => (x.classList.contains('is-marked') ? -1 : i)).filter((i) => i >= 0).slice(0, 8))
await page.evaluate(() => {
  window.__blinks = 0
  const seen = new Set()
  setInterval(() => {
    document.querySelectorAll('.sw').forEach((el, i) => {
      if (el.classList.contains('is-marked')) seen.add(i)
      else if (seen.has(i)) { window.__blinks++; seen.delete(i) }
    })
  }, 16)
})
for (const i of idx) await page.locator('.sw').nth(i).locator('.sw-main').click()
await page.waitForTimeout(8000)
const blinks = await page.evaluate(() => window.__blinks)
const marked = await page.locator('.sw').evaluateAll((xs, ids) => ids.filter((i) => xs[i].classList.contains('is-marked')).length, idx)
console.log({ tapped: idx.length, stillMarked: marked, blinks })
// Undo.
for (const i of idx) await page.locator('.sw').nth(i).locator('.sw-main').click()
await page.waitForTimeout(8000)

// Mark then unmark at once, with the first save slow and the second fast: it must end unmarked, also on the server.
await page.unroute('**/api/**')
let n = 0
await page.route('**/api/list/**', async (r) => { await new Promise((ok) => setTimeout(ok, n++ % 2 === 0 ? 900 : 50)); await r.continue() })
const j = await page.locator('.sw').evaluateAll((xs) => xs.findIndex((x) => !x.classList.contains('is-marked')))
await page.locator('.sw').nth(j).locator('.sw-main').click()
await page.locator('.sw').nth(j).locator('.sw-main').click()
await page.waitForTimeout(4000)
await page.unroute('**/api/list/**')
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.sw')
const stuck = await page.locator('.sw').nth(j).evaluate((x) => x.classList.contains('is-marked'))
console.log({ markThenUnmarkStuck: stuck })
if (stuck) { await page.locator('.sw').nth(j).locator('.sw-main').click(); await page.waitForTimeout(1500) }
await browser.close()
process.exitCode = blinks || marked !== idx.length || stuck ? 1 : 0
