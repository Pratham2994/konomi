// Screenshot pages at the six target widths. Usage: node scripts/shots.mjs /chart /sweep  [--widths 390,1440]
// Logs in as the seeded demo user first. Output: ../.impeccable/review/<page>-<width>.png
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', '..', '.impeccable', 'review')
mkdirSync(out, { recursive: true })

const args = process.argv.slice(2)
const wi = args.indexOf('--widths')
const widths = wi >= 0 ? args[wi + 1].split(',').map(Number) : [390, 1280, 1536, 1920, 2560]
const anon = args.includes('--anon')
const full = args.includes('--full')
const pages = args.filter((a, i) => a.startsWith('/') && i !== wi + 1)
const HEIGHT = { 360: 760, 390: 844, 430: 932, 1280: 800, 1366: 768, 1440: 900, 1536: 864, 1920: 1080, 2560: 1440 }

const browser = await chromium.launch()
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: HEIGHT[w] ?? 900 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  if (!anon) {
    await page.goto('http://localhost:5173/login')
    const r = await page.request.post('http://localhost:5173/api/auth/login', {
      data: { email: 'demo@example.com', password: 'konomi-demo-2026' },
    })
    if (!r.ok()) throw new Error('login failed ' + r.status())
  }
  for (const p of pages) {
    await page.goto('http://localhost:5173' + p, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    if (full) await page.addStyleTag({ content: '.bottombar{display:none!important}.topbar,.mobile-add{position:static!important}' })
    const name = (p.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home') + `-${w}.png`
    const docH = await page.evaluate(() => document.documentElement.scrollHeight)
    await page.screenshot({ path: join(out, name), fullPage: full, clip: full ? { x: 0, y: 0, width: w, height: docH } : undefined })
    console.log(name)
  }
  await ctx.close()
}
await browser.close()
