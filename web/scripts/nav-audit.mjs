// Every page at every target screen: a visible way home, no sideways scroll, and Back lands where you came from.
// Usage: node scripts/nav-audit.mjs   (needs the dev servers and the seeded demo user)
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:5173'
const SCREENS = [
  ['phone S', 360, 740], ['phone', 390, 844], ['phone L', 430, 932], ['13" laptop', 1280, 800], ['14" laptop', 1440, 900],
  ['15.6" laptop', 1536, 864], ['16" laptop', 1728, 1117], ['24" monitor', 1920, 1080], ['27" monitor', 2560, 1440],
]
const PRIVATE = ['/', '/chart', '/sweep', '/rate', '/taste', '/settings', '/u/demo', '/anime/30325', '/nowhere']
const PUBLIC = ['/', '/login', '/signup', '/reset', '/verify?email=a%40b.dev', '/u/demo', '/anime/30325']

const browser = await chromium.launch()
const login = await browser.newContext()
const r = await login.request.post(BASE + '/api/auth/login', { data: { email: 'demo@example.com', password: 'konomi-demo-2026' } })
if (!r.ok()) throw new Error('login failed ' + r.status())
const storageState = await login.storageState()
await login.close()

const problems = []
const note = (s) => { problems.push(s); console.log('✗ ' + s) }

async function check(page, label, path) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  const res = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth, vh = window.innerHeight
    const seen = (el) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && b.top < vh && b.bottom > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
    const home = [...document.querySelectorAll('a[href="/"]')].some(seen)
    const nav = [...document.querySelectorAll('.bottombar a, .topnav a')].filter(seen).length
    return { home, nav, scroll: document.documentElement.scrollWidth > vw + 1, url: location.pathname }
  })
  if (!res.home && res.nav === 0) note(`${label} ${path}: no visible way home or nav`)
  if (res.scroll) note(`${label} ${path}: scrolls sideways`)
  return res
}

async function backFlows(page, label) {
  // Chart → title → Back returns to the chart, at the same scroll position.
  await page.goto(BASE + '/chart', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.mouse.wheel(0, 700)
  await page.waitForTimeout(400)
  // Click a tile already on screen, so the click itself doesn't scroll.
  const y = await page.evaluate(() => {
    const el = [...document.querySelectorAll('main a[href^="/anime/"]')].find((a) => { const b = a.getBoundingClientRect(); return b.top > 80 && b.bottom < innerHeight - 90 })
    el?.click()
    return scrollY
  })
  await page.waitForURL(/\/anime\//)
  await page.waitForTimeout(500)
  if (await page.evaluate(() => scrollY) > 10) note(`${label} chart→title: title page did not open at the top`)
  await page.goBack()
  await page.waitForURL(/\/chart$/)
  await page.waitForTimeout(700)
  const y2 = await page.evaluate(() => scrollY)
  if (Math.abs(y2 - y) > 120) note(`${label} chart→title→back: scroll ${y} became ${y2}`)

  // Title → related title → Back returns to the first title.
  await page.goto(BASE + '/anime/30325', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const rel = page.locator('main a[href^="/anime/"]:visible').first()
  if (await rel.count()) {
    await rel.click()
    await page.waitForTimeout(800)
    await page.goBack()
    await page.waitForTimeout(600)
    if (!page.url().endsWith('/anime/30325')) note(`${label} title→related→back: landed on ${page.url()}`)
  }

  // Customise → View profile → Back returns to Customise.
  await page.goto(BASE + '/settings', { waitUntil: 'domcontentloaded' })
  await page.locator('main a[href="/u/demo"]').first().click()
  await page.waitForURL(/\/u\/demo/)
  await page.goBack()
  await page.waitForTimeout(500)
  if (!page.url().endsWith('/settings')) note(`${label} settings→profile→back: landed on ${page.url()}`)

  // A title opened directly (shared link) still offers a way back into the app.
  await page.goto(BASE + '/anime/30325', { waitUntil: 'domcontentloaded' })
  const back = page.locator('.back-btn:visible')
  if (await back.count()) {
    await back.click()
    await page.waitForTimeout(600)
    if (new URL(page.url()).pathname.startsWith('/anime/')) note(`${label} direct title → back button stayed on ${page.url()}`)
  }
}

for (const [label, w, h] of SCREENS) {
  for (const anon of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, storageState: anon ? undefined : storageState })
    const page = await ctx.newPage()
    for (const p of anon ? PUBLIC : PRIVATE) await check(page, `${label}${anon ? ' (signed out)' : ''}`, p)
    if (!anon) await backFlows(page, label)
    await ctx.close()
  }
  console.log(`✓ ${label} ${w}×${h} done`)
}
await browser.close()
console.log(problems.length ? `\n${problems.length} problems` : '\nAll clear')
process.exitCode = problems.length ? 1 : 0
