import { defineConfig } from '@playwright/test'

// Needs the API (:8000), web dev server (:5173) and docker compose (Postgres + Mailpit) running.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  workers: 1,
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1920, height: 1080 } } },
  ],
})
