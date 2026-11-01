// State checks across views: changes show up everywhere without a reload. Usage: node scripts/sync-check.mjs
// Uses the local demo account and a title that is not on its chart (it is removed again at the end).
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:5173'
const ID = Number(process.argv[2] ?? 1)
const browser = await chromium.launch()
const login = await browser.newContext()
await login.request.post(BASE + '/api/auth/login', { data: { email: 'demo@example.com', password: 'konomi-demo-2026' } })
const ctx = await browser.newContext({ storageState: await login.storageState(), viewport: { width: 1440, height: 900 } })
await ctx.request.delete(`${BASE}/api/list/${ID}`)
const fails = []
const check = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) fails.push(what) }
const until = async (fn, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)) } return false }

const title = await ctx.newPage()
const profile = await ctx.newPage()
await profile.goto(BASE + '/u/demo', { waitUntil: 'domcontentloaded' })
await profile.waitForSelector('.prof-name')
const onProfile = () => profile.locator(`.prof a[href="/anime/${ID}"]`).count().then((n) => n > 0)

// 1. Mark it watched on its title page: the rating panel opens, the other tab's profile shows it.
await title.goto(`${BASE}/anime/${ID}`, { waitUntil: 'domcontentloaded' })
await title.waitForSelector('.anime-actions .seg')
await title.locator('.anime-actions .seg button', { hasText: 'Watched' }).click()
check(await until(() => title.locator('.rp').count().then((n) => n > 0)), 'rating panel opens after marking watched')
check(await until(onProfile), 'other tab: profile shows the new title without reload')

// 2. Remove it: the panel closes at once and the other tab's profile drops it.
await title.locator('.anime-actions button', { hasText: 'Remove' }).click()
check(await until(() => title.locator('.rp').count().then((n) => n === 0), 1000), 'rating panel closes when the title is removed')
check(await until(async () => !(await onProfile())), 'other tab: profile drops the removed title without reload')

// 3. The Customise preview follows changes made in the main window, and its links open in the main window.
await title.locator('.anime-actions .seg button', { hasText: 'Watching' }).click()
const settings = await ctx.newPage()
await settings.goto(BASE + '/settings', { waitUntil: 'domcontentloaded' })
const frame = settings.frameLocator('.set-preview-frame iframe')
check(await until(() => frame.locator(`a[href="/anime/${ID}"]`).count().then((n) => n > 0), 6000), 'preview shows a title added in another tab')
await title.locator('.anime-actions button', { hasText: 'Remove' }).click()
check(await until(() => frame.locator(`a[href="/anime/${ID}"]`).count().then((n) => n === 0), 4000), 'preview drops a title removed in another tab')
await frame.locator('.prof a[href^="/anime/"]').first().click()
check(await until(() => settings.url().includes('/anime/')), 'a link clicked in the preview opens in the main window')

await ctx.request.delete(`${BASE}/api/list/${ID}`)
await browser.close()
console.log(fails.length ? `\n${fails.length} failed` : '\nAll state checks passed')
process.exitCode = fails.length ? 1 : 0
