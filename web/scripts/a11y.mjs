// Automated accessibility check (axe-core) on the main pages. Usage: node scripts/a11y.mjs
import AxeBuilder from '@axe-core/playwright'
import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const login = await browser.newContext()
await login.request.post('http://localhost:5173/api/auth/login', { data: { email: 'demo@example.com', password: 'konomi-demo-2026' } })
const storageState = await login.storageState()
await login.close()
const runs = [
  ...['/', '/chart', '/sweep', '/rate', '/taste', '/settings', '/u/demo', '/anime/30325'].map((p) => ({ p, auth: true })),
  ...['/', '/login', '/signup'].map((p) => ({ p, auth: false })),
]
const seen = new Map()
for (const { p, auth } of runs) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(auth ? { storageState } : {}) })
  const page = await ctx.newPage()
  await page.goto('http://localhost:5173' + p, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze()
  for (const v of res.violations) {
    const key = v.id
    if (!seen.has(key)) seen.set(key, { impact: v.impact, help: v.help, pages: new Set(), sample: v.nodes[0]?.target.join(' ') })
    seen.get(key).pages.add((auth ? '' : 'anon:') + p)
  }
  await ctx.close()
}
await browser.close()
for (const [id, v] of seen) console.log(`${v.impact} ${id}: ${v.help} — ${[...v.pages].join(', ')} — e.g. ${v.sample}`)
console.log(seen.size ? `${seen.size} rule(s) violated` : 'no axe violations')
