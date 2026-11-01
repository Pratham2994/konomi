// Chart select mode: move several titles and undo; remove several rated titles and undo (feelings and scores return).
// Usage: node scripts/bulk-check.mjs   (local demo account; everything is put back at the end)
import { chromium } from '@playwright/test'

const B = 'http://localhost:5173'
const b = await chromium.launch()
const l = await b.newContext()
await l.request.post(B + '/api/auth/login', { data: { email: 'demo@example.com', password: 'konomi-demo-2026' } })
const fails = []
const check = (ok, what) => { console.log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) fails.push(what) }

for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await b.newContext({ storageState: await l.storageState(), viewport: { width: w, height: h } })
  const pg = await ctx.newPage()
  const list = async () => new Map((await (await ctx.request.get(B + '/api/list')).json()).entries.map((e) => [e.anime_id, e]))
  const before = await list()
  await pg.goto(B + '/chart', { waitUntil: 'domcontentloaded' })
  await pg.waitForSelector('.chart-tools')
  await pg.getByRole('button', { name: 'Select', exact: true }).click()
  const tiles = pg.locator('.tile-pick')
  for (const i of [0, 1, 2]) await tiles.nth(i).click()
  check((await pg.locator('.pick-count').innerText()).startsWith('3'), `${w}: three selected`)
  await pg.screenshot({ path: `../.impeccable/review/chart-select-${w}.png` })

  // Move to Watching, then Undo.
  await pg.locator('.pick-bar').getByRole('button', { name: 'Watching', exact: true }).click()
  await pg.waitForTimeout(1500)
  let now = await list()
  check([...now.values()].filter((e) => e.status === 'watching').length - [...before.values()].filter((e) => e.status === 'watching').length === 3, `${w}: three moved to Watching`)
  await pg.locator('.toast').getByRole('button', { name: 'Undo' }).last().click()
  await pg.waitForTimeout(1500)
  now = await list()
  check([...before.keys()].every((id) => now.get(id)?.status === before.get(id).status), `${w}: Undo put every status back`)

  // Remove two rated titles, then Undo: feelings and scores come back.
  await pg.getByRole('button', { name: 'Select', exact: true }).click()
  for (const i of [0, 1]) { await tiles.nth(i).click() }
  await pg.locator('.pick-bar').getByRole('button', { name: /Remove/ }).click()
  await pg.waitForTimeout(1500)
  now = await list()
  check(now.size === before.size - 2, `${w}: two removed`)
  await pg.locator('.toast').getByRole('button', { name: 'Undo' }).last().click()
  await pg.waitForTimeout(2500)
  now = await list()
  check(now.size === before.size, `${w}: Undo brought them back`)
  check([...before.values()].every((e) => now.get(e.anime_id)?.tier === e.tier && now.get(e.anime_id)?.score === e.score), `${w}: same feelings and scores`)
  await ctx.close()
}
await b.close()
console.log(fails.length ? `\n${fails.length} failed` : '\nAll bulk checks passed')
process.exitCode = fails.length ? 1 : 0
