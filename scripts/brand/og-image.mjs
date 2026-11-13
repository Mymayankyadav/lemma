#!/usr/bin/env node
/**
 * N131 · A5′ the site's share preview: draws public/og-image.png (1200 × 630) with the app's own share-page module
 * (src/ui/v7/shareImage.ts), so the preview a link shows is the same notebook page the app shares.
 *
 * Run against a preview build:
 *   VITE_ALLOW_FLAG_OVERRIDES=1 VITE_FLAGS=-v6Shell,-v7Shell npx vite build && npx vite preview --port 4173
 *   node scripts/brand/og-image.mjs
 * Real Chromium rendering in the app's own fonts; nothing is drawn by hand.
 */
import {chromium} from 'playwright'
import {readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

const root = process.cwd()
const BASE = process.env.LEMMA_BASE ?? 'http://localhost:4173/lemma/'
const module = readdirSync(join(root, 'dist', 'assets')).find(name => /^shareImage-.*\.js$/.test(name))
if (!module) throw new Error('Build first: dist/assets/shareImage-*.js is missing')

const browser = await chromium.launch()
const page = await browser.newPage({colorScheme: 'light', acceptDownloads: true})
await page.goto(BASE + '?demo=1&mode=day#/')
await page.waitForLoadState('networkidle')
// The app's own share action draws the card and, where the browser cannot share files, saves it: catch that file.
const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(async path => {
  const {shareCard} = await import(path)
  await shareCard({kind: 'brand'})
}, new URL(BASE).pathname + 'assets/' + module)])
writeFileSync(join(root, 'public', 'og-image.png'), readFileSync(await download.path()))
console.log('wrote public/og-image.png')
await browser.close()
