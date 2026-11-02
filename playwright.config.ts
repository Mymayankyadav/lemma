import { defineConfig } from '@playwright/test'
export default defineConfig({
 testDir: './tests/e2e', fullyParallel: true, forbidOnly: !!process.env.CI,
 retries: process.env.CI ? 2 : 0, workers: process.env.CI ? 1 : undefined,
 reporter: [['list'], ['html', {open: 'never'}]],
 use: {
  baseURL: 'http://localhost:4173/lemma/?demo=1#/',
  viewport: {width: 390, height: 844}, deviceScaleFactor: 2,
  colorScheme: 'dark', reducedMotion: 'reduce', trace: 'retain-on-failure', screenshot: 'only-on-failure',
 },
 projects: [{name: 'chromium', use: {browserName: 'chromium'}}],
 webServer: {
  command: 'npm run build && npm run preview -- --port 4173',
  url: 'http://localhost:4173/lemma/', reuseExistingServer: !process.env.CI, timeout: 120_000,
 },
})
