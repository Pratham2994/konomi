// Does every page fit the screen? Real phone emulation (touch, phone browser, device pixel ratio) and common
// laptop sizes, signed in with a full chart and with a brand-new empty one.
// A phone browser widens and zooms out the whole page when something is too wide, so a plain "is there a
// scrollbar" check misses it: this compares every element against the device's real width.
// Usage: node scripts/fit-audit.mjs [--phones]   (dev servers + seeded demo user + Mailpit for the fresh account)
import { chromium, devices } from '@playwright/test'

const B = 'http://localhost:5173'
const MAIL = 'http://localhost:8025/api/v1'
const PHONES = ['iPhone SE', 'iPhone 12', 'iPhone 14 Pro Max', 'Pixel 7', 'Galaxy S8', 'Galaxy S9+']
const SMALLEST = { name: '320 px phone', viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const LAPTOPS = [[1280, 720], [1280, 800], [1366, 768], [1440, 900], [1512, 982], [1536, 864], [1600, 900], [1728, 1117], [1920, 1080], [2560, 1440]]
const PAGES = ['/', '/chart', '/sweep', '/sweep?view=season&year=2019&season=SPRING', '/rate', '/taste', '/settings', '/u/demo', '/anime/30325']
const FRESH_PAGES = ['/', '/chart', '/rate', '/taste', '/settings']

const browser = await chromium.launch()

async function signIn() {
  const c = await browser.newContext()
  await c.request.post(B + '/api/auth/login', { data: { email: 'demo@example.com', password: 'konomi-demo-2026' } })
  const s = await c.storageState(); await c.close(); return s
}
async function freshAccount() {
  const c = await browser.newContext()
  const tag = Date.now().toString(36), email = `fit-${tag}@example.com`, password = 'fit-audit-pass-1'
  await c.request.post(B + '/api/auth/signup', { data: { email, username: `fit${tag}`.slice(0, 20), password } })
  let code
  for (let i = 0; i < 40 && !code; i++) {
    const list = await (await c.request.get(`${MAIL}/search?query=to:${email}`)).json()
    if (list.messages?.length) code = /\b(\d{6})\b/.exec((await (await c.request.get(`${MAIL}/message/${list.messages[0].ID}`)).json()).Text)[1]
    else await new Promise((r) => setTimeout(r, 250))
  }
  await c.request.post(B + '/api/auth/verify', { data: { email, code, password } })
  const s = await c.storageState(); await c.close(); return s
}

const problems = []
async function audit(label, opts, state, pages) {
  const ctx = await browser.newContext({ ...opts, storageState: state })
  const page = await ctx.newPage()
  const W = opts.viewport.width
  for (const p of pages) {
    await page.goto(B + p, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    for (let y = 0; y < 5000; y += 600) { await page.mouse.wheel(0, 600); await page.waitForTimeout(80) }
    await page.waitForTimeout(500)
    const r = await page.evaluate((W) => {
      // Elements inside a container that scrolls or clips sideways are fine as long as the container fits.
      const clipped = (el) => {
        for (let a = el.parentElement; a; a = a.parentElement) {
          const o = getComputedStyle(a).overflowX
          const r = a.getBoundingClientRect()
          // Full-width page wrappers clip everything, so they prove nothing: only a real scroller or card counts.
          if (r.width >= W - 2) continue
          if ((o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') && r.right <= W + 1 && r.left >= -1) return true
        }
        return false
      }
      const bad = [...document.querySelectorAll('body *')].filter((el) => {
        const b = el.getBoundingClientRect(), s = getComputedStyle(el)
        if (b.width === 0 || s.position === 'fixed' || s.visibility === 'hidden') return false
        return (b.right > W + 1 || b.left < -1) && !clipped(el)
      })
      // Report the outermost offenders only.
      const top = bad.filter((el) => !bad.some((o) => o !== el && o.contains(el)))
      return {
        pageWidth: document.documentElement.scrollWidth, layoutWidth: window.innerWidth,
        offenders: top.slice(0, 5).map((el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} (${Math.round(el.getBoundingClientRect().left)}→${Math.round(el.getBoundingClientRect().right)})`),
      }
    }, W)
    if (r.pageWidth > W + 1 || r.layoutWidth > W + 1 || r.offenders.length) {
      const line = `${label} ${p}: page ${r.pageWidth}px on a ${W}px screen | ${r.offenders.join(' ; ')}`
      problems.push(line); console.log('✗ ' + line)
    }
  }
  await ctx.close()
}

const demo = await signIn()
const fresh = await freshAccount()
for (const d of PHONES) {
  const { defaultBrowserType, ...opts } = devices[d]
  await audit(d, opts, demo, PAGES)
  await audit(d + ' (new account)', opts, fresh, FRESH_PAGES)
}
await audit(SMALLEST.name, SMALLEST, demo, PAGES)
await audit(SMALLEST.name + ' (new account)', SMALLEST, fresh, FRESH_PAGES)
if (!process.argv.includes('--phones')) for (const [w, h] of LAPTOPS) await audit(`${w}×${h}`, { viewport: { width: w, height: h } }, demo, PAGES)
await audit('signed out phone', { ...devices['iPhone 12'], defaultBrowserType: undefined }, undefined, ['/', '/login', '/signup'])
await browser.close()
console.log(problems.length ? `\n${problems.length} pages overflow` : '\nEverything fits')
process.exitCode = problems.length ? 1 : 0
