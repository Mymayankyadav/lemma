#!/usr/bin/env node
/**
 * AND-4: fail-closed Play listing, privacy and genuine 3x DPR screenshot checks.
 *
 * Run against the built preview:
 *   npm run build && npm run preview -- --port 4173
 *   node scripts/play-shots.mjs --capture
 *   node scripts/play-shots.mjs --verify
 *
 * Capture uses real Chromium rendering. No generated/synthetic screenshots.
 */
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const shotsDir = resolve(root, 'docs/android/shots')
const screens = [
  ['today', '#/'],
  ['project', '#/p/real-analysis'],
  ['review', '#/review'],
  ['atlas', '#/atlas'],
]
const worlds = [
  ['day', 'graph', 'light'],
  ['night', 'graph-night', 'dark'],
]
const pngMagic = '89504e470d0a1a0a'

function assert(condition, message) {
  if (!condition) throw new Error('AND-4: ' + message)
}
function screenshotPath(screen, world) {
  return resolve(shotsDir, screen + '-' + world + '-1080x1920.png')
}
async function checkPng(path) {
  const bytes = await readFile(path)
  assert(bytes.length > 24, path + ' is empty')
  assert(bytes.subarray(0, 8).toString('hex') === pngMagic, path + ' is not PNG')
  assert(bytes.readUInt32BE(16) === 1080 && bytes.readUInt32BE(20) === 1920,
    path + ' must be 1080x1920, got ' + bytes.readUInt32BE(16) + 'x' + bytes.readUInt32BE(20))
}
async function verify() {
  const listing = await readFile(resolve(root, 'docs/android/listing.md'), 'utf8')
  const title = listing.match(/^Title:\s*(.+)$/m)?.[1]?.trim()
  const short = listing.match(/^Short description:\s*(.+)$/m)?.[1]?.trim()
  assert(title && [...title].length <= 30, 'Play title must be 1–30 characters')
  assert(short && [...short].length <= 80, 'Play short description must be 1–80 characters')
  assert(listing.includes('| Email |') && listing.includes('| App activity |') &&
    listing.includes('| Files |'), 'data safety table must cover email, app activity and files')
  assert(!/\b(guaranteed results|AI will teach|improve your grades)\b/i.test(listing),
    'listing must not promise AI outcomes')

  const privacy = await readFile(resolve(root, 'public/privacy.html'), 'utf8')
  assert(/<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1"/.test(privacy),
    'privacy page must be mobile responsive')
  assert(/prefers-color-scheme:\s*dark/.test(privacy), 'privacy page must support dark mode')
  assert(/Supabase/i.test(privacy) && /ap-south-1/i.test(privacy),
    'privacy page must identify data storage and region')
  assert(/delet/i.test(privacy) && /export/i.test(privacy), 'privacy page must describe export/deletion')
  assert(!/<script\b/i.test(privacy), 'static privacy page must not execute scripts')
  const external = [...privacy.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map(m => m[1])
  assert(external.every(url => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)),
    'privacy page must not request third-party resources beyond optional Google Fonts')

  for (const [screen] of screens) for (const [world] of worlds) {
    await checkPng(screenshotPath(screen, world))
  }
  console.log('AND-4 verified: Play text limits, privacy contract, eight real-size PNGs')
}
async function capture() {
  const { chromium } = await import('@playwright/test')
  const base = process.env.LEMMA_SCREENSHOT_BASE_URL || 'http://localhost:4173/lemma/'
  const baseUrl = new URL(base)
  assert(baseUrl.pathname.endsWith('/lemma/'), 'preview base must end in /lemma/')
  const browser = await chromium.launch({ headless: true })
  await mkdir(shotsDir, { recursive: true })
  try {
    for (const [world, theme, colorScheme] of worlds) {
      const context = await browser.newContext({
        viewport: { width: 360, height: 640 },
        deviceScaleFactor: 3,
        colorScheme,
        reducedMotion: 'reduce',
      })
      const page = await context.newPage()
      try {
        // Privacy must work at the same 360px phone width in both worlds,
        // without any third-party requests other than optional Google Fonts.
        const externalRequests = []
        page.on('request', request => {
          const url = new URL(request.url())
          if (url.origin !== baseUrl.origin &&
              !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(request.url())) {
            externalRequests.push(request.url())
          }
        })
        const privacyUrl = new URL('privacy.html', baseUrl)
        await page.goto(privacyUrl.href, { waitUntil: 'domcontentloaded' })
        await page.getByRole('heading', { name: 'Privacy, in plain language.' }).waitFor()
        const privacyMetrics = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - innerWidth,
          scheme: getComputedStyle(document.documentElement).colorScheme,
        }))
        assert(privacyMetrics.overflow <= 1,
          'privacy/' + world + ' overflows 360px by ' + privacyMetrics.overflow)
        assert(privacyMetrics.scheme.includes(colorScheme),
          'privacy/' + world + ' does not use the expected colour scheme')
        assert(externalRequests.length === 0,
          'privacy/' + world + ' requested unexpected origins: ' + externalRequests.join(', '))
        page.removeAllListeners('request')
        for (const [screen, route] of screens) {
          const url = new URL(baseUrl)
          url.search = '?demo=1&theme=' + theme
          url.hash = screen === 'review' ? '#/review' : route
          await page.goto(url.href, { waitUntil: 'domcontentloaded' })
          if (screen === 'today') {
            await page.getByRole('article', { name: /Goal progress for/ }).first().waitFor()
          } else if (screen === 'project') {
            await page.getByRole('region', { name: 'Project timeline' }).waitFor()
            await page.locator('[data-route-mode="project"]').waitFor()
          } else if (screen === 'review') {
            await page.getByRole('button', { name: 'Start review' }).click()
            await page.getByRole('heading', { name: 'Card review', level: 1 }).waitFor()
            // The heading also exists on the loading skeleton and empty queue.
            // Play screenshots must show an actual review card, never a spinner
            // or a misleading "Nothing due" screen.
            await page.getByRole('progressbar', { name: 'Review progress' }).waitFor()
            const card = page.locator('[data-review-card-scroll]')
            await card.waitFor({ state: 'visible' })
            assert((await card.innerText()).trim().length > 0,
              'review/' + world + ' has no rendered card content')
            assert(new URL(page.url()).hash.startsWith('#/review/run'),
              'review/' + world + ' did not navigate to the review-run route')
            console.log('READY: review/' + world + ' real card')
          } else {
            await page.getByRole('tree', { name: 'Ideas and their links' }).waitFor()
            await page.getByRole('treeitem').first().waitFor()
          }
          await page.evaluate(() => document.fonts.ready)
          const actualTheme = await page.evaluate(() => document.documentElement.dataset.theme)
          assert(actualTheme === theme,
            screen + '/' + world + ' rendered theme ' + actualTheme + ' instead of ' + theme)
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
          assert(overflow <= 1, screen + '/' + world + ' has horizontal overflow: ' + overflow)
          const path = screenshotPath(screen, world)
          await page.screenshot({ path, scale: 'device', fullPage: false, animations: 'disabled' })
          await checkPng(path)
          console.log('Captured ' + screen + '/' + world + ' (1080x1920)')
        }
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
}
const action = process.argv[2] || '--verify'
if (action === '--capture') {
  await capture()
  await verify()
} else if (action === '--verify') {
  await verify()
} else {
  throw new Error('Usage: node scripts/play-shots.mjs [--capture|--verify]')
}
