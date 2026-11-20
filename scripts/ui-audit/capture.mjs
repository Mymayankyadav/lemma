#!/usr/bin/env node
// UI audit capture: drives the built Lemma app through every screen and flow on a phone, in the night theme, with
// (a) an empty brand-new account and (b) a typical amount of data, and writes
//   <out>/frames/*.png   one 390x844 frame per state (scroll positions of long screens are separate frames)
//   <out>/sheets/*.png   contact sheets: several frames side by side, captioned F001... (what a reviewer reads first)
//   <out>/manifest.json  every frame with scene, label, warnings and DOM facts
//   <out>/INDEX.md       the reading order, per-sheet frame lists and what to check
// Usage: node scripts/ui-audit/capture.mjs [--profiles full,empty] [--only tasks,calendar] [--out artifacts/ui-audit]
//        [--base http://localhost:4173/lemma/] [--per-sheet 4] [--sheet-width 1568] [--scale 2] [--workers 4]
//        [--no-build] [--list]
import {mkdir, rm, rename, writeFile, copyFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {spawn, execFileSync} from 'node:child_process'
import {resolve} from 'node:path'
import {launch, newScene, sceneHelper, composeSheets, PROFILES, VIEW} from './lib.mjs'
import {scenes, GROUPS, HEAVY} from './scenes.mjs'
import {renderIndex} from './index-md.mjs'

const args = process.argv.slice(2)
const opt = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback }
const flag = (name) => args.includes('--' + name)
const base = opt('base', 'http://localhost:4173/lemma/')
const out = resolve(opt('out', 'artifacts/ui-audit'))
const profiles = opt('profiles', 'full,empty').split(',').filter((p) => PROFILES[p])
const only = opt('only', '').split(',').filter(Boolean)
const perSheet = Number(opt('per-sheet', 4)), sheetWidth = Number(opt('sheet-width', 1568))
const scale = Number(opt('scale', 2)), workers = Number(opt('workers', 4))

const selected = scenes.filter((s) => !only.length || only.some((o) => s.id.includes(o) || s.group.includes(o)))
if (flag('list')) {
  for (const s of selected) console.log(`${s.id.padEnd(28)} ${s.group.padEnd(12)} ${(s.profiles ?? ['full', 'empty']).join(',')}  ${s.title}`)
  process.exit(0)
}

async function reachable(url) { try { return (await fetch(url)).ok } catch { return false } }
let server = null
async function ensureServer() {
  if (await reachable(base)) return
  const port = new URL(base).port || '4173'
  if (!flag('no-build') && !existsSync('dist/index.html')) {
    console.log('Building the app (flag overrides on, needed for the empty first-use profile)...')
    execFileSync('npx', ['vite', 'build'], {stdio: 'inherit', env: {...process.env, VITE_ALLOW_FLAG_OVERRIDES: '1'}})
  }
  console.log('Starting vite preview on port ' + port)
  server = spawn('npx', ['vite', 'preview', '--port', port, '--strictPort'], {stdio: 'ignore'})
  for (let i = 0; i < 60 && !(await reachable(base)); i++) await new Promise((r) => setTimeout(r, 500))
  if (!(await reachable(base))) throw new Error('The preview server did not start at ' + base)
}

async function runScene(browser, profile, scene) {
  const frames = []
  const {context, page, diag} = await newScene(browser, {base, profile, scale})
  const p = sceneHelper({page, diag, base, profile, outDir: out, sceneId: scene.id, frames, scale})
  let error = null
  try { await scene.run(p) } catch (e) {
    error = String(e.message).split('\n')[0]
    // Always leave evidence: the state the scene failed in.
    p.warnings.push('SCENE FAILED: ' + error.slice(0, 140))
    await p.shot('failed here', {scroll: false}).catch(() => {})
  }
  await context.close()
  for (const f of frames) { f.group = scene.group; f.groupTitle = scene.title; f.diag = f === frames.at(-1) ? diag : undefined }
  return {scene, profile, frames, error, diag}
}

async function pool(items, size, fn) {
  const results = new Array(items.length); let next = 0
  await Promise.all(Array.from({length: Math.min(size, items.length)}, async () => {
    for (;;) { const i = next++; if (i >= items.length) return; results[i] = await fn(items[i], i) }
  }))
  return results
}

async function main() {
  await ensureServer()
  await rm(out, {recursive: true, force: true})
  await mkdir(out + '/frames', {recursive: true}); await mkdir(out + '/sheets', {recursive: true})
  const browser = await launch()
  const manifest = {sheetWidth, generated: 'Mon 9 Nov 2026, 13:43 IST', viewport: VIEW, scale, theme: 'night (graph-night)', commit: gitHead(), profiles: {}, sheets: []}
  try {
    for (const profile of profiles) {
      const jobs = selected.filter((s) => profile === 'heavy' ? HEAVY.has(s.id) : (s.profiles ?? ['full', 'empty']).includes(profile))
      console.log(`[${profile}] ${jobs.length} scenes`)
      const results = await pool(jobs, workers, async (scene) => {
        const r = await runScene(browser, profile, scene)
        console.log(`  ${r.error ? '✗' : '✓'} ${scene.id} (${r.frames.length} frames)${r.error ? ' — ' + r.error : ''}`)
        return r
      })
      // Number frames in walkthrough order and give them their final names.
      const ordered = []
      let n = 0
      for (const r of results) for (const f of r.frames) {
        n++
        const final = `${PROFILES[profile].prefix}${String(n).padStart(3, '0')}-${profile}-${r.scene.id}.png`
        await rename(resolve(out, f.file), resolve(out, 'frames', final))
        ordered.push({...f, n, file: 'frames/' + final})
      }
      const sheets = await composeSheets(browser, {outDir: out, profile, frames: ordered, perSheet, sheetWidth, title: 'Lemma UI audit'})
      manifest.profiles[profile] = {
        label: PROFILES[profile].label, frames: ordered,
        scenes: results.map((r) => ({id: r.scene.id, group: r.scene.group, title: r.scene.title, check: r.scene.check ?? '', frames: r.frames.length, error: r.error, consoleErrors: r.diag.console.length + r.diag.pageErrors.length, console: [...r.diag.console, ...r.diag.pageErrors].slice(0, 5)})),
      }
      manifest.sheets.push(...sheets)
    }
  } finally { await browser.close(); server?.kill() }
  await copyFile(new URL('./REVIEW_BRIEF.md', import.meta.url), out + '/REVIEW_BRIEF.md')
  await writeFile(out + '/manifest.json', JSON.stringify(manifest, null, 1))
  await writeFile(out + '/INDEX.md', renderIndex(manifest, {GROUPS, perSheet}))
  const total = Object.values(manifest.profiles).reduce((a, p) => a + p.frames.length, 0)
  console.log(`\nDone: ${total} frames, ${manifest.sheets.length} sheets → ${out}\nStart with ${out}/INDEX.md`)
}
function gitHead() { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {encoding: 'utf8'}).trim() } catch { return 'unknown' } }
main().catch((e) => { console.error(e); server?.kill(); process.exit(1) })
