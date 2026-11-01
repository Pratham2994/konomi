# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: more.spec.ts >> season walk marks, status changes, favourites, password reset
- Location: e2e\more.spec.ts:30:1

# Error details

```
Error: no mail
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - banner [ref=e4]:
      - link "Konomi home" [ref=e5] [cursor=pointer]:
        - /url: /
        - generic [ref=e6]: 好み
        - generic [ref=e7]: Konomi
      - navigation "Main" [ref=e8]:
        - link "Log in" [ref=e9] [cursor=pointer]:
          - /url: /login
        - link "Start your chart" [ref=e10] [cursor=pointer]:
          - /url: /signup
    - main [ref=e11]:
      - generic [ref=e13]:
        - heading "Start your chart" [level=1] [ref=e14]
        - paragraph [ref=e15]: One list for every anime you’ve watched. Scored by comparison, never by a slider.
        - generic [ref=e16]:
          - generic [ref=e17]: Email
          - textbox "Email" [ref=e18]: more-pmvximuqh@example.com
        - generic [ref=e19]:
          - generic [ref=e20]:
            - text: Username
            - emphasis [ref=e21]: "(your link: /u/m_pmvximuqh)"
          - 'textbox "Username (your link: /u/m_pmvximuqh)" [ref=e22]': m_pmvximuqh
        - generic [ref=e23]:
          - generic [ref=e24]:
            - text: Password
            - emphasis [ref=e25]: (8+ characters)
          - textbox "Password (8+ characters)" [ref=e26]: first-pass-11
        - alert [ref=e27]: We couldn’t send the email just now. Try again in a minute.
        - button "Create account" [ref=e28] [cursor=pointer]
        - paragraph [ref=e29]:
          - text: Already have one?
          - link "Log in" [ref=e30] [cursor=pointer]:
            - /url: /login
  - status
```

# Test source

```ts
  1  | import { expect, test, type Page } from '@playwright/test'
  2  | 
  3  | const MAILPIT = 'http://localhost:8025/api/v1'
  4  | 
  5  | async function code(page: Page, email: string, nth = 0): Promise<string> {
  6  |   for (let i = 0; i < 20; i++) {
  7  |     const msgs = (await (await page.request.get(`${MAILPIT}/search?query=to:${encodeURIComponent(email)}`)).json()).messages ?? []
  8  |     if (msgs.length > nth) {
  9  |       const body = await (await page.request.get(`${MAILPIT}/message/${msgs[0].ID}`)).json()
  10 |       return /\b(\d{6})\b/.exec(body.Text)![1]
  11 |     }
  12 |     await page.waitForTimeout(250)
  13 |   }
> 14 |   throw new Error('no mail')
     |         ^ Error: no mail
  15 | }
  16 | 
  17 | async function signUp(page: Page, tag: string) {
  18 |   const email = `more-${tag}@example.com`
  19 |   await page.goto('/signup')
  20 |   await page.getByLabel('Email').fill(email)
  21 |   await page.getByLabel(/^Username/).fill(`m_${tag}`.slice(0, 20))
  22 |   await page.getByLabel(/^Password/).fill('first-pass-11')
  23 |   await page.getByRole('button', { name: 'Create account' }).click()
  24 |   await page.getByLabel('Digit 1').fill(await code(page, email))
  25 |   await page.getByRole('button', { name: 'Verify email' }).click()
  26 |   await expect(page.locator('.qa-hero input')).toBeVisible()
  27 |   return email
  28 | }
  29 | 
  30 | test('season walk marks, status changes, favourites, password reset', async ({ page, browser }, info) => {
  31 |   const tag = `${info.project.name.slice(0, 1)}${Date.now().toString(36)}`
  32 |   const email = await signUp(page, tag)
  33 | 
  34 |   // Season walk: tap marks watched, "Dropped" marks dropped.
  35 |   await page.goto('/sweep?year=2019&season=SPRING')
  36 |   const tiles = page.locator('.sw')
  37 |   await expect(tiles.first()).toBeVisible()
  38 |   await tiles.nth(0).locator('.sw-main').click()
  39 |   await tiles.nth(1).locator('.sw-main').click()
  40 |   await tiles.nth(2).getByRole('button', { name: 'Dropped' }).click()
  41 |   await expect(tiles.nth(0)).toHaveClass(/is-marked/)
  42 |   await expect(page.getByText(/2 of \d+ watched/)).toBeVisible()
  43 | 
  44 |   // Chart shows them; the dropped filter shows exactly one.
  45 |   await page.goto('/chart')
  46 |   await page.getByRole('tab', { name: /^Dropped/ }).click()
  47 |   await expect(page.locator('.tile')).toHaveCount(1)
  48 | 
  49 |   // Title page: change a watched title to dropped.
  50 |   await page.getByRole('tab', { name: /^Watched/ }).click()
  51 |   await page.locator('.tile').first().click()
  52 |   await expect(page).toHaveURL(/\/anime\//)
  53 |   await page.getByRole('button', { name: 'Dropped', exact: true }).click()
  54 |   await expect(page.getByRole('button', { name: 'Dropped', exact: true })).toHaveAttribute('aria-pressed', 'true')
  55 | 
  56 |   // Favourites: pick one in Customise; it shows on the profile.
  57 |   await page.goto('/settings')
  58 |   await page.getByRole('button', { name: /Pick favourites/ }).click()
  59 |   await page.locator('.set-pick').first().click()
  60 |   await page.getByRole('button', { name: 'Done' }).click()
  61 |   await expect(page.getByText(/1\/10/)).toBeVisible()
  62 | 
  63 |   // Password reset via email code, then log in with the new password.
  64 |   const fresh = await browser.newContext()
  65 |   const p2 = await fresh.newPage()
  66 |   await p2.goto('/reset')
  67 |   await p2.getByLabel('Email').fill(email)
  68 |   await p2.getByRole('button', { name: 'Send code' }).click()
  69 |   await p2.getByLabel('Digit 1').fill(await code(p2, email, 1))
  70 |   await p2.getByLabel('New password').fill('second-pass-22')
  71 |   await p2.getByRole('button', { name: 'Set new password' }).click()
  72 |   await expect(p2.locator('.qa-hero input')).toBeVisible()
  73 |   const r = await p2.request.post('/api/auth/login', { data: { email, password: 'first-pass-11' } })
  74 |   expect(r.status()).toBe(401)
  75 |   await fresh.close()
  76 | })
  77 | 
```