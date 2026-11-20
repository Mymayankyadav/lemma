// Renders the concept mockups to PNG with the real v7 tokens and fonts.
// Usage (repo root, after a build): node docs/ui-plan/2026-11-20/mockups/render.mjs [outDir]
// It copies this folder and src/ui/v7/tokens.css into dist/mockups/, serves dist with `vite preview`, and screenshots
// every *.html at 390x844 (pages marked class="phone tall" are captured full height) at 2x.
import {chromium} from '@playwright/test'
import {cpSync, mkdirSync, readdirSync, readFileSync} from 'node:fs'
import {spawn} from 'node:child_process'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(process.argv[2] ?? join(here, 'png'))
const base = 'http://localhost:4173/lemma/mockups/'
mkdirSync(out, {recursive: true})
cpSync(here, 'dist/mockups', {recursive: true, filter: (p) => !p.endsWith('.png')})
cpSync('src/ui/v7/tokens.css', 'dist/mockups/tokens.css')

const up = async () => { try { return (await fetch(base + 'mock.css')).ok } catch { return false } }
let server = null
if (!(await up())) {
  server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {stdio: 'ignore'})
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
}
const browser = await chromium.launch()
try {
  for (const file of readdirSync(here).filter((f) => f.endsWith('.html')).sort()) {
    const page = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, colorScheme: 'dark'})
    await page.goto(base + file)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
    const tall = readFileSync(join(here, file), 'utf8').includes('phone tall')
    await page.screenshot({path: join(out, file.replace('.html', '.png')), fullPage: tall})
    await page.close()
    console.log('rendered', file)
  }
} finally { await browser.close(); server?.kill() }
