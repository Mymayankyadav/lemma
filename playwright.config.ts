import { defineConfig } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

// CI switches only (no assertion or threshold is changed here):
//  - LEMMA_PERF=off  skips the timing-based specs listed in ci/perf-checks.json (they run in perf-report)
//  - CI_JUNIT_DIR    also writes a JUnit report for failure signatures (file: e2e-<CI_JUNIT_NAME|e2e>.xml)
//  - the web server builds with VITE_ALLOW_FLAG_OVERRIDES=1 so tests can use ?flags=a,b (never set in production builds)
//  - the web server also builds with VITE_FLAGS=-v6Shell,-v7Shell, so the legacy specs keep exercising the flag-off screens after
//    N102 turns v6Shell on by default; the v6 specs opt in with ?flags=v6Shell (the URL wins over the build-time env)
const perf: string[] = process.env.LEMMA_PERF === 'off'
  ? (JSON.parse(readFileSync('ci/perf-checks.json', 'utf8')).e2e as {path: string}[]).map((e) => '**/' + basename(e.path))
  : []
const junit = process.env.CI_JUNIT_DIR
export default defineConfig({
 testDir: './tests/e2e', fullyParallel: true, forbidOnly: !!process.env.CI,
 testIgnore: perf,
 retries: process.env.CI ? 2 : 0, workers: process.env.CI ? 1 : undefined,
 reporter: [['list'], ['html', {open: 'never'}], ...(junit ? [['junit', {outputFile: `${junit}/e2e-${process.env.CI_JUNIT_NAME ?? 'e2e'}.xml`}] as ['junit', {outputFile: string}]] : [])],
 use: {
  baseURL: 'http://localhost:4173/lemma/?demo=1#/',
  viewport: {width: 390, height: 844}, deviceScaleFactor: 2,
  colorScheme: 'dark', reducedMotion: 'reduce', trace: 'retain-on-failure', screenshot: 'only-on-failure',
 },
 projects: [{name: 'chromium', use: {browserName: 'chromium'}}],
 webServer: {
  command: 'VITE_ALLOW_FLAG_OVERRIDES=1 VITE_FLAGS=-v6Shell,-v7Shell npm run build && npm run preview -- --port 4173',
  url: 'http://localhost:4173/lemma/', reuseExistingServer: !process.env.CI, timeout: 120_000,
 },
})
