// One click on the galaxy opens one title, and Back returns to the galaxy. Usage: node scripts/galaxy-click-check.mjs
import { chromium } from '@playwright/test'
const B = 'http://localhost:5173'
const b = await chromium.launch(); const l = await b.newContext()
await l.request.post(B + '/api/auth/login', { data: { email: 'demo@example.com', password: 'konomi-demo-2026' } })
const ctx = await b.newContext({ storageState: await l.storageState(), viewport: { width: 1440, height: 900 } }); const pg = await ctx.newPage()
await pg.addInitScript(() => { window.__pushes = []; const p = history.pushState.bind(history); history.pushState = (s, t, u) => { window.__pushes.push(String(u)); return p(s, t, u) } })
const results = []
for (const [x, y] of [[860, 520], [760, 560], [900, 420], [700, 480]]) {
  await pg.goto(B + '/taste', { waitUntil: 'domcontentloaded' }); await pg.waitForSelector('.g-canvas canvas'); await pg.waitForTimeout(3800)
  await pg.evaluate(() => { window.__pushes = [] })
  await pg.mouse.click(x, y); await pg.waitForTimeout(800)
  const pushes = await pg.evaluate(() => window.__pushes)
  let backTo = null
  if (pushes.length) { await pg.goBack(); await pg.waitForTimeout(800); backTo = new URL(pg.url()).pathname }
  results.push({ at: [x, y], pagesOpened: pushes.length, backTo })
}
console.log(results); await b.close()
