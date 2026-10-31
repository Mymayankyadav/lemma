import {defineConfig} from '@playwright/test'
import browser from './playwright.config'

// AUDIT #540: the eight 4x CPU jobs run every cold route exactly once.
// The four normal Playwright shards retain the entire tests/e2e suite without
// grep exclusions; this separate testDir makes the 144-case CPU suite explicit.
// Strict cold CPU evidence must be the FIRST attempt. The ordinary CI suite
// retries flaky browser tests twice, but inheriting that here can mask a
// 1,500ms first-render violation and run an extreme 18-route matrix three times
// (up to the 45-minute job timeout). Keep all 144 routes and budgets unchanged.
export default defineConfig({...browser,testDir: './tests/cpu',retries: 0})
