# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journey.spec.ts >> sign up, add, rate, get recommendations, share a public profile
- Location: e2e\journey.spec.ts:38:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Check your email' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('heading', { name: 'Check your email' }) with timeout 5000ms
  - waiting for getByRole('heading', { name: 'Check your email' })

```

```yaml
- banner:
  - link "Konomi home":
    - /url: /
    - text: 好み Konomi
  - navigation "Main":
    - link "Log in":
      - /url: /login
    - link "Start your chart":
      - /url: /signup
- main:
  - heading "Start your chart" [level=1]
  - paragraph: One list for every anime you’ve watched. Scored by comparison, never by a slider.
  - text: Email
  - textbox "Email": e2e-phonemvximpur@example.com
  - text: Username
  - emphasis: "(your link: /u/e2e_phonemvximpur)"
  - 'textbox "Username (your link: /u/e2e_phonemvximpur)"': e2e_phonemvximpur
  - text: Password
  - emphasis: (8+ characters)
  - textbox "Password (8+ characters)": correct-horse-42
  - alert: We couldn’t send the email just now. Try again in a minute.
  - button "Create account"
  - paragraph:
    - text: Already have one?
    - link "Log in":
      - /url: /login
- status
```

# Test source

```ts
  1  | import { expect, test, type Page } from '@playwright/test'
  2  | 
  3  | const MAILPIT = 'http://localhost:8025/api/v1'
  4  | 
  5  | async function latestCode(page: Page, email: string): Promise<string> {
  6  |   for (let i = 0; i < 20; i++) {
  7  |     const res = await page.request.get(`${MAILPIT}/search?query=to:${encodeURIComponent(email)}`)
  8  |     const msgs = (await res.json()).messages ?? []
  9  |     if (msgs.length) {
  10 |       const body = await (await page.request.get(`${MAILPIT}/message/${msgs[0].ID}`)).json()
  11 |       return /\b(\d{6})\b/.exec(body.Text)![1]
  12 |     }
  13 |     await page.waitForTimeout(250)
  14 |   }
  15 |   throw new Error('no OTP mail')
  16 | }
  17 | 
  18 | async function addAndRate(page: Page, q: string, tier: string) {
  19 |   const input = page.locator('.qa-hero input')
  20 |   await input.fill(q)
  21 |   await expect(page.locator('.qa-hero .qa-row').first()).toBeVisible()
  22 |   await input.press('Enter')
  23 |   const panel = page.getByRole('dialog')
  24 |   await expect(panel.getByText(/How was/)).toBeVisible()
  25 |   await panel.getByRole('button', { name: tier }).click()
  26 |   // Answer any placement duels by preferring the new title (left side).
  27 |   for (let i = 0; i < 8; i++) {
  28 |     if (await panel.getByText(/is on your chart/).isVisible()) break
  29 |     const duel = panel.locator('.duel-side').first()
  30 |     if (await duel.isVisible()) await duel.click()
  31 |     await page.waitForTimeout(300)
  32 |   }
  33 |   await expect(panel.getByText(/is on your chart/)).toBeVisible()
  34 |   await panel.getByRole('button', { name: 'Done' }).click()
  35 |   await expect(panel).toBeHidden()
  36 | }
  37 | 
  38 | test('sign up, add, rate, get recommendations, share a public profile', async ({ page, browser }, info) => {
  39 |   const tag = `${info.project.name}${Date.now().toString(36)}`
  40 |   const email = `e2e-${tag}@example.com`
  41 |   const username = `e2e_${tag}`.slice(0, 20)
  42 | 
  43 |   await page.goto('/signup')
  44 |   await page.getByLabel('Email').fill(email)
  45 |   await page.getByLabel(/^Username/).fill(username)
  46 |   await page.getByLabel(/^Password/).fill('correct-horse-42')
  47 |   await page.getByRole('button', { name: 'Create account' }).click()
> 48 |   await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
     |                                                                         ^ Error: expect(locator).toBeVisible() failed
  49 |   const code = await latestCode(page, email)
  50 |   await page.getByLabel('Digit 1').fill(code)
  51 |   await page.getByRole('button', { name: 'Verify email' }).click()
  52 |   await expect(page.locator('.qa-hero input')).toBeVisible()
  53 | 
  54 |   await addAndRate(page, 'frieren', 'One of my favourites')
  55 |   await addAndRate(page, 'steins gate', 'Loved it')
  56 |   await addAndRate(page, 'one piece', 'Loved it')
  57 | 
  58 |   await page.goto('/chart')
  59 |   await expect(page.getByRole('heading', { name: 'Your chart' })).toBeVisible()
  60 |   await expect(page.locator('.obi-num').first()).toBeVisible()
  61 | 
  62 |   await page.goto('/taste')
  63 |   await expect(page.getByRole('heading', { name: 'You’ll probably love' })).toBeVisible()
  64 |   await expect(page.locator('.recs .rec').first()).toBeVisible()
  65 |   await expect(page.locator('.rec-why').first()).toContainText('because you liked')
  66 | 
  67 |   await page.goto('/settings')
  68 |   await page.getByText('Private', { exact: true }).click()
  69 |   await expect(page.getByText('Public', { exact: true })).toBeVisible()
  70 | 
  71 |   const anon = await browser.newContext()
  72 |   const anonPage = await anon.newPage()
  73 |   await anonPage.goto(`/u/${username}`)
  74 |   await expect(anonPage.getByRole('heading', { name: username })).toBeVisible()
  75 |   await expect(anonPage.getByRole('heading', { name: 'All-time favourites' })).toBeVisible()
  76 | 
  77 |   await page.getByText('Public', { exact: true }).click()
  78 |   await expect(page.getByText('Private', { exact: true })).toBeVisible()
  79 |   await anonPage.reload()
  80 |   await expect(anonPage.getByRole('heading', { name: 'This chart is private' })).toBeVisible()
  81 |   await anon.close()
  82 | })
  83 | 
```