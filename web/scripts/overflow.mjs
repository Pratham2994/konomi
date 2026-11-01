// Report pages that scroll sideways (or have elements poking past the viewport) at each target width.
import { chromium } from '@playwright/test'

const pages = ['/', '/chart', '/sweep', '/rate', '/taste', '/settings', '/u/demo', '/anime/30325']
const widths = [360, 390, 430, 1280, 1366, 1536, 1920, 2560]
const browser = await chromium.launch()
let bad = 0
const login = await browser.newContext()
await login.request.post('http://localhost:5173/api/auth/login', { data: { email: 'demo@example.com', password: 'konomi-demo-2026' } })
const storageState = await login.storageState()
await login.close()
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, storageState })
  const page = await ctx.newPage()
  for (const p of pages) {
    await page.goto('http://localhost:5173' + p, { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const over = [...document.querySelectorAll('body *')]
        .filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.right > vw + 1 && getComputedStyle(el).position !== 'fixed' })
        .filter((el) => !el.closest('.g-stage, .qa-pop, .prof-fan, .l-wall, .mark, .prof-banner, .seg'))
        .slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} → ${Math.round(el.getBoundingClientRect().right)}`)
      return { scroll: document.documentElement.scrollWidth > vw, over }
    })
    if (r.scroll || r.over.length) { bad++; console.log(`${w} ${p}: scroll=${r.scroll} ${r.over.join(' | ')}`) }
  }
  await ctx.close()
}
await browser.close()
console.log(bad ? `${bad} problems` : 'no overflow')
