import {defineConfig} from '@playwright/test'
import browser from './playwright.config'

// AUDIT #540: the eight 4x CPU jobs run every cold route exactly once.
// The four normal Playwright shards retain the entire tests/e2e suite without
// grep exclusions; this separate testDir makes the 144-case CPU suite explicit.
export default defineConfig({...browser,testDir: './tests/cpu'})
