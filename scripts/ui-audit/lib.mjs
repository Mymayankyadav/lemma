// Shared helpers for the UI audit capture: browser context, empty-state seeding, the scene `p` helper,
// scroll frames and the contact-sheet composer. No dependencies beyond @playwright/test (already in devDependencies).
import {chromium} from '@playwright/test'
import {mkdir, writeFile, readFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

/** Same frozen clock as the v7 audit seed (tests/e2e/v7-scenes.ts): Mon 9 Nov 2026, 13:43 IST. */
export const NOW = new Date('2026-11-09T13:43:00+05:30')
export const DATE = '2026-11-09'
export const VIEW = {width: 390, height: 844}

/** Profiles. `full` is the normal demo (a realistic, moderately full account); `empty` is a brand new account;
 * `heavy` is the stress profile (very large lists) and is opt-in. */
export const PROFILES = {
  full: {prefix: 'F', demo: '1', empty: false, label: 'Populated (typical amount of data)'},
  empty: {prefix: 'E', demo: 'first-use', empty: true, label: 'Empty (brand-new account)'},
  heavy: {prefix: 'H', demo: 'stress', empty: false, label: 'Heavy (stress data, very long lists)'},
}

/** sessionStorage seeds that make every tab-scoped demo store start empty (the first-use profile only empties paths,
 * cards, sessions and the Atlas; tasks, blocks, goals and so on are still seeded). Each shape is the store's own snapshot. */
const EMPTY_STORES = {
  'lemma.v6.demo.tasks.v1': {schema: 1, tasks: []},
  'lemma.v6.demo.study.v1': {schema: 1, entries: [], blocks: []},
  'lemma.v6.demo.parked-thoughts.v1': {schema: 1, thoughts: []},
  'lemma.v6.demo.day-plans.v1': {schema: 1, plans: [], items: []},
  'lemma.v6.demo.study-goals.v1': {schema: 1, goals: []},
  'lemma.v6.demo.deadlines.v1': {schema: 1, rows: []},
  'lemma.v6.demo.study-events.v1': {schema: 1, events: []},
  'lemma.v6.demo.practice-topics.v1': {schema: 1, topics: [], events: [], history: []},
  'lemma.v6.demo.review-runs.v1': {schema: 1, runs: [], items: []},
  'lemma.v6.demo.overlap-acknowledgements.v1': {schema: 1, rows: []},
}

export async function launch() {
  return chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {})
}

/** One fresh context per scene so no scene sees another's writes. */
export async function newScene(browser, {base, profile, scale}) {
  const context = await browser.newContext({
    viewport: VIEW, screen: VIEW, deviceScaleFactor: scale, isMobile: true, hasTouch: true,
    colorScheme: 'dark', reducedMotion: 'reduce', locale: 'en-IN', timezoneId: 'Asia/Kolkata',
  })
  if (PROFILES[profile].empty) {
    await context.addInitScript((stores) => {
      try {
        if (sessionStorage.getItem('lemma.audit.seeded')) return
        for (const [key, value] of Object.entries(stores)) sessionStorage.setItem(key, JSON.stringify(value))
        sessionStorage.setItem('lemma.audit.seeded', '1')
      } catch { /* storage blocked: the app falls back to its own seed */ }
    }, EMPTY_STORES)
  }
  const page = await context.newPage()
  page.setDefaultTimeout(6000)
  await page.clock.setFixedTime(NOW)
  const diag = {console: [], pageErrors: [], failedRequests: []}
  page.on('console', (m) => { if (m.type() === 'error') diag.console.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => diag.pageErrors.push(String(e.message).slice(0, 300)))
  return {context, page, diag}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Locate something the way a person would describe it: by role+name, falling back to visible text. */
function finder(page) {
  const roles = ['button', 'link', 'tab', 'checkbox', 'switch', 'radio', 'menuitem', 'option']
  return async function find(name, {role, nth = 0, timeout = 4000} = {}) {
    const pattern = typeof name === 'string' ? name : name
    const exact = typeof name === 'string'
    const tries = role ? [role] : roles
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      for (const r of tries) {
        const loc = page.getByRole(r, {name: pattern, exact}).filter({visible: true})
        if (await loc.count()) return loc.nth(nth)
      }
      const text = page.getByText(pattern, {exact}).filter({visible: true})
      if (await text.count()) return text.nth(nth)
      await sleep(150)
    }
    throw new Error('Could not find "' + name + '"' + (role ? ' (' + role + ')' : ''))
  }
}

/** The scroll target for scroll frames: the open sheet/dialog body if it scrolls, else the page. */
async function scrollInfo(page) {
  return page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role=dialog],.v7-sheet,.v7-sheet-body')]
    for (const d of dialogs.reverse()) {
      const body = d.matches('.v7-sheet-body') ? d : d.querySelector('.v7-sheet-body') || d
      if (body.scrollHeight > body.clientHeight + 8 && getComputedStyle(body).overflowY !== 'visible' && body.getBoundingClientRect().height > 0)
        return {kind: 'sheet', total: body.scrollHeight, view: body.clientHeight}
    }
    const el = document.scrollingElement || document.documentElement
    return {kind: 'page', total: el.scrollHeight, view: window.innerHeight}
  })
}
async function scrollTo(page, kind, y) {
  await page.evaluate(([k, top]) => {
    if (k === 'sheet') {
      const dialogs = [...document.querySelectorAll('[role=dialog],.v7-sheet,.v7-sheet-body')]
      for (const d of dialogs.reverse()) {
        const body = d.matches('.v7-sheet-body') ? d : d.querySelector('.v7-sheet-body') || d
        if (body.scrollHeight > body.clientHeight + 8 && body.getBoundingClientRect().height > 0) { body.scrollTop = top; return }
      }
    } else (document.scrollingElement || document.documentElement).scrollTo(0, top)
  }, [kind, y])
  await sleep(250)
}

/** Facts read from the DOM next to each frame (the reviewer sees pictures; these catch what pictures hide). */
async function pageFacts(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const text = (document.body.innerText || '')
    const overflowX = document.documentElement.scrollWidth > vw + 1
    const small = [...document.querySelectorAll('button,a[href],input,[role=tab],[role=switch],[role=checkbox]')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0 && (r.width < 40 || r.height < 40) && getComputedStyle(e).visibility !== 'hidden' })
      .length
    const clipped = [...document.querySelectorAll('h1,h2,h3,button,a,p,li,span')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1) && r.top < window.innerHeight }).length
    const vh = window.innerHeight
    const visible = (e) => { if (!e || !e.getClientRects().length) return false; const s = getComputedStyle(e); return s.visibility !== 'hidden' && Number(s.opacity) > 0.05 }
    const pinned = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return e } return null }
    const dialog = [...document.querySelectorAll('[role=dialog]')].some(visible)

    // Chrome: rows from the top and from the bottom where a fixed or sticky element is hit (headers, hub tabs, filters, tab bar).
    const xs = [24, 110, 195, 280, 366]
    const chromeRow = (y) => xs.some((x) => { const el = document.elementFromPoint(x, y); return el && pinned(el) && !pinned(el).matches('[role=dialog],[role=dialog] *') })
    // Pinned bars float with gaps (the tab bar sits above a margin), so take the outermost pinned row within each half.
    let top = 0; for (let y = 2; y < vh * 0.55; y += 4) if (chromeRow(y)) top = y + 2
    let bottom = 0; for (let y = vh - 2; y > vh * 0.55; y -= 4) if (chromeRow(y)) bottom = vh - y + 2
    const overlay = top >= vh * 0.5 && bottom >= vh * 0.4 // a full-screen sheet or page overlay, not chrome

    // Visible words in the viewport (outside the bottom navigation), and on the whole page or open sheet.
    const nav = document.querySelector('nav[aria-label="Primary"], .v7-tabbar, nav.v7-nav') // the tab bar, whichever selector this build uses
    const walker = document.createTreeWalker(dialog ? [...document.querySelectorAll('[role=dialog]')].filter(visible).at(-1) : document.body, NodeFilter.SHOW_TEXT)
    let wordsView = 0, wordsAll = 0
    const offFont = new Map(), offSize = new Map(), sizes = new Map()
    const SCALE = new Set([12, 14, 16, 17, 19, 20, 26, 28, 32, 44, 64])
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim(); if (!t) continue
      const el = n.parentElement; if (!el || el.closest('script,style,svg,.katex-mathml,[aria-hidden=true]') || (nav && nav.contains(el)) || !visible(el)) continue
      const words = (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) || []).length
      wordsAll += words
      const range = document.createRange(); range.selectNodeContents(n); const r = range.getBoundingClientRect()
      if (r.bottom <= 0 || r.top >= vh || r.width === 0) continue
      wordsView += words
      if (el.closest('.katex')) continue
      const cs = getComputedStyle(el)
      const family = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()
      if (!/^Lemma v7|^KaTeX/.test(family)) { const k = family; offFont.set(k, [...(offFont.get(k) || []), t.slice(0, 40)].slice(0, 4)) }
      const px = Math.round(parseFloat(cs.fontSize) * 2) / 2
      sizes.set(px, (sizes.get(px) || 0) + words)
      if (!SCALE.has(px)) offSize.set(px, [...(offSize.get(px) || []), t.slice(0, 30)].slice(0, 3))
    }

    // Native controls the design system replaces (and that look unstyled on a phone).
    const native = [...document.querySelectorAll('details>summary, select, input[type=date], input[type=time], input[type=datetime-local], input[type=range]')]
      .filter((e) => visible(e) && e.getBoundingClientRect().top < vh && e.getBoundingClientRect().bottom > 0)
      .map((e) => (e.tagName === 'INPUT' ? 'input[' + e.type + ']' : e.tagName.toLowerCase()) + ': ' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30))

    // Text that overlaps other text in normal flow (not content scrolling under a pinned header, which is expected).
    const leaves = [...document.querySelectorAll('h1,h2,h3,h4,p,li,a,button,label,span,small,strong,em,dt,dd,figcaption,td,th')]
      .filter((e) => { if (!visible(e) || !e.textContent.trim() || [...e.children].some((c) => c.textContent.trim())) return false; const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < vh })
      .slice(0, 400)
    const overlaps = []
    for (let i = 0; i < leaves.length && overlaps.length < 6; i++) for (let j = i + 1; j < leaves.length && overlaps.length < 6; j++) {
      const a = leaves[i], b = leaves[j]
      if (a.contains(b) || b.contains(a) || (!!pinned(a)) !== (!!pinned(b))) continue
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
      if (w > 4 && h > 4 && w * h > 0.25 * Math.min(ra.width * ra.height, rb.width * rb.height)) overlaps.push(a.textContent.trim().slice(0, 30) + ' ⟂ ' + b.textContent.trim().slice(0, 30))
    }

    // The main picture (a canvas or large SVG such as the Atlas map): how much of it is actually visible, not covered by panels.
    const pics = [...document.querySelectorAll('canvas, svg')].filter((e) => { const r = e.getBoundingClientRect(); return visible(e) && r.width >= 200 && r.height >= 200 && r.top < vh - 100 && r.bottom > 100 })
    let picture = null
    if (pics.length) {
      const pic = pics.sort((a, b) => b.getBoundingClientRect().height * b.getBoundingClientRect().width - a.getBoundingClientRect().height * a.getBoundingClientRect().width)[0]
      const r = pic.getBoundingClientRect(); let seen = 0, total = 0
      for (let y = Math.max(0, r.top) + 4; y < Math.min(vh, r.bottom); y += 12) for (let x = Math.max(0, r.left) + 4; x < Math.min(window.innerWidth, r.right); x += 12) {
        total++; const hit = document.elementFromPoint(x, y)
        if (hit && (hit === pic || pic.contains(hit) || (hit.contains(pic) && getComputedStyle(hit).pointerEvents !== 'none'))) seen++
      }
      picture = {tag: pic.tagName.toLowerCase(), box: [Math.round(r.top), Math.round(r.height)], unobstructed: total ? Math.round((seen / total) * 100) : 0}
    }
    return {
      hash: location.hash,
      heading: (document.querySelector('h1')?.textContent || '').trim().slice(0, 80),
      errorScreen: /something went wrong|unexpected error|route error/i.test(text.slice(0, 600)),
      overflowX, clippedOffscreen: clipped, targetsUnder40px: small, dialog,
      chrome: dialog || overlay ? null : {top, bottom, content: vh - top - bottom},
      words: {view: wordsView, all: wordsAll},
      offFonts: Object.fromEntries(offFont), offSizes: Object.fromEntries(offSize), sizes: Object.fromEntries(sizes),
      native, overlaps, picture,
    }
  })
}

/** The helper handed to each scene's `run(p)`. */
export function sceneHelper({page, diag, base, profile, outDir, sceneId, frames, scale}) {
  const find = finder(page)
  const demo = PROFILES[profile].demo
  const p = {
    page, profile, isEmpty: PROFILES[profile].empty, warnings: [],
    /** Navigate to an in-app route, e.g. p.go('/tasks'). */
    async go(route, {settle = 900} = {}) {
      await page.goto(base + '?demo=' + demo + '#' + route)
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.evaluate(() => document.fonts.ready).catch(() => {})
      await sleep(settle)
    },
    /** Same as go but changes only the hash without reloading (in-app navigation). */
    async nav(route) { await page.evaluate((r) => { location.hash = r }, route); await sleep(900) },
    find,
    async tap(name, opts) { const el = await find(name, opts); await el.scrollIntoViewIfNeeded().catch(() => {}); await el.click({timeout: 4000}); await sleep(opts?.settle ?? 450) },
    async fill(label, text) {
      const el = page.getByLabel(label, {exact: typeof label === 'string'}).filter({visible: true}).first()
      await el.fill(text, {timeout: 4000}); await sleep(250)
    },
    async fillPlaceholder(text, value) { await page.getByPlaceholder(text).filter({visible: true}).first().fill(value, {timeout: 4000}); await sleep(250) },
    async type(text) { await page.keyboard.type(text, {delay: 15}); await sleep(250) },
    /** Close the open sheet the way a person would (its Close button), else Escape. */
    async close() {
      const btn = page.getByRole('button', {name: /^(Close|Cancel|Dismiss)$/}).filter({visible: true}).first()
      if (await btn.count()) await btn.click({timeout: 2500}).catch(() => page.keyboard.press('Escape'))
      else await page.keyboard.press('Escape')
      await sleep(500)
    },
    async press(key) { await page.keyboard.press(key); await sleep(350) },
    async wait(ms) { await sleep(ms) },
    /** The nth text field of the open sheet or page (the app's inputs carry no accessible label). */
    field(n = 0) { return page.locator('.v7-field').filter({visible: true}).nth(n) },
    /** Freeze the app clock at another moment (before p.go to load at that time, or after to move time forward). */
    async setClock(date) { await page.clock.setFixedTime(date); await sleep(1200) },
    /** Move the frozen clock forward by minutes since NOW (for running timers: the clock is frozen, so time only moves when told). */
    async advance(minutes) { await page.clock.setFixedTime(new Date(NOW.getTime() + minutes * 60_000)); await sleep(1500) },
    /** Tap at page coordinates (canvas screens such as the Atlas map). */
    async tapAt(x, y) { await page.touchscreen.tap(x, y); await sleep(600) },
    /** Open each row matching `selector` in turn (settings rows, list rows), take a frame, and return. */
    async drill(selector, {max = 8, label = 'row', maxFrames = 2, skip = []} = {}) {
      const total = Math.min(max, await page.locator(selector).filter({visible: true}).count())
      for (let i = 0; i < total; i++) {
        const row = page.locator(selector).filter({visible: true}).nth(i)
        const name = ((await row.innerText().catch(() => '')) || '').split('\n')[0].trim().slice(0, 40) || label + ' ' + (i + 1)
        if (skip.some((x) => name.includes(x))) continue
        const before = page.url()
        try {
          await row.scrollIntoViewIfNeeded(); await row.click({timeout: 3000}); await sleep(600)
          await p.shot(label + ': ' + name, {maxFrames})
        } catch (e) { p.warnings.push('drill ' + name + ': ' + String(e.message).split('\n')[0].slice(0, 100)) }
        if (page.url() !== before) await page.goBack().catch(() => {})
        else await page.keyboard.press('Escape').catch(() => {})
        await sleep(450)
      }
    },
    async has(name, opts) { try { await find(name, {...opts, timeout: opts?.timeout ?? 800}); return true } catch { return false } },
    /** Run a step but never fail the scene: the failure becomes a warning printed on the frame caption and in the report. */
    async try(label, fn) { try { await fn(); return true } catch (e) { p.warnings.push(label + ': ' + String(e.message).split('\n')[0].slice(0, 160)); return false } },
    /** Scroll helper for scenes that need a specific position. */
    async scrollTo(y) { await scrollTo(page, 'page', y) },
    /** Take the frame(s) for the current state. */
    async shot(label, {scroll = true, maxFrames = 4, note = ''} = {}) {
      await page.evaluate(() => document.fonts.ready).catch(() => {})
      await sleep(350)
      const facts = await pageFacts(page)
      const info = scroll ? await scrollInfo(page) : {kind: 'page', total: VIEW.height, view: VIEW.height}
      const step = Math.round(info.view * 0.82)
      const count = info.total > info.view * 1.12 ? Math.min(maxFrames, Math.ceil((info.total - info.view) / step) + 1) : 1
      for (let i = 0; i < count; i++) {
        const y = i === count - 1 && count > 1 ? Math.max(0, info.total - info.view) : i * step
        if (count > 1) await scrollTo(page, info.kind, y)
        const n = frames.length + 1 // local index; capture.mjs renumbers across scenes in walkthrough order
        const file = `${profile}-${sceneId}-${String(n).padStart(2, '0')}.png`
        await page.screenshot({path: join(outDir, 'frames', file), animations: 'disabled', caret: 'hide'})
        frames.push({
          n, file: 'frames/' + file, scene: sceneId, label, note, part: count > 1 ? (i + 1) + '/' + count : '',
          scroll: count > 1 ? {kind: info.kind, y, total: info.total, view: info.view} : null,
          warnings: i === 0 ? [...p.warnings] : [], facts,
        })
      }
      if (count > 1) await scrollTo(page, info.kind, 0)
      p.warnings.length = 0
    },
  }
  return p
}

// ---------------------------------------------------------------- contact sheets
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]))

/** Pack frames (already in walkthrough order) into sheets of `perSheet` phone frames in one row. A new scene group
 * starts a new sheet when that leaves the previous one at least half full, so a sheet is mostly one topic. */
export function packSheets(frames, perSheet) {
  const sheets = []
  let cur = null
  for (const f of frames) {
    const breakGroup = cur && cur.group !== f.group && cur.frames.length >= Math.ceil(perSheet / 2)
    if (!cur || cur.frames.length >= perSheet || breakGroup) { cur = {group: f.group, frames: []}; sheets.push(cur) }
    cur.frames.push(f)
  }
  return sheets
}

export async function composeSheets(browser, {outDir, profile, frames, perSheet, sheetWidth, title}) {
  const sheets = packSheets(frames, perSheet)
  const gutter = 12, pad = 12
  const frameW = Math.floor((sheetWidth - pad * 2 - gutter * (perSheet - 1)) / perSheet)
  const frameH = Math.round(frameW * (VIEW.height / VIEW.width))
  const ctx = await browser.newContext({viewport: {width: sheetWidth, height: 800}, deviceScaleFactor: 1})
  const page = await ctx.newPage()
  const out = []
  let i = 0
  for (const sheet of sheets) {
    i++
    const name = `${profile}-sheet-${String(i).padStart(2, '0')}`
    const first = sheet.frames[0].n, last = sheet.frames.at(-1).n
    const cells = sheet.frames.map((f) => {
      const w = f.warnings?.length ? `<div class="w">⚠ ${esc(f.warnings.join(' · '))}</div>` : ''
      const flags = [f.facts?.errorScreen ? 'ERROR SCREEN' : '', f.facts?.overflowX ? 'H-SCROLL' : ''].filter(Boolean).join(' · ')
      return `<figure style="width:${frameW}px"><figcaption><b>${PROFILES[profile].prefix}${String(f.n).padStart(3, '0')}</b> ${esc(f.groupTitle)}<br><span>${esc(f.label)}${f.part ? ' · ' + esc(f.part) : ''}</span>${flags ? `<br><em>${esc(flags)}</em>` : ''}</figcaption>
       <img src="${pathToFileURL(resolve(outDir, f.file)).href}" style="width:${frameW}px;height:${frameH}px">${w}</figure>`
    }).join('')
    const html = `<!doctype html><meta charset=utf-8><style>
      body{margin:0;background:#05070f;color:#d6dcf0;font:12px/1.35 -apple-system,Segoe UI,Roboto,sans-serif}
      header{padding:8px ${pad}px 4px;display:flex;justify-content:space-between;font-size:13px}
      header b{color:#fff} .row{display:flex;gap:${gutter}px;padding:4px ${pad}px 10px;align-items:flex-start}
      figure{margin:0} figcaption{height:42px;overflow:hidden;font-size:11.5px;color:#aeb7d6}
      figcaption b{color:#fff;font-size:12.5px} figcaption span{color:#8ea0ff} figcaption em{color:#ff8d8d;font-style:normal;font-weight:700}
      img{display:block;border-radius:10px;outline:1px solid #26304f;object-fit:cover;object-position:top}
      .w{color:#ffb86b;font-size:10.5px;margin-top:3px;max-height:44px;overflow:hidden}</style>
      <header><span><b>${esc(title)}</b> · ${esc(PROFILES[profile].label)} · ${esc(sheet.frames[0].groupTitle)}</span><span>sheet ${i}/${sheets.length} · frames ${PROFILES[profile].prefix}${String(first).padStart(3, '0')}–${PROFILES[profile].prefix}${String(last).padStart(3, '0')} · phone 390×844, night theme</span></header>
      <div class="row">${cells}</div>`
    const htmlFile = resolve(outDir, 'sheets', name + '.html')
    await writeFile(htmlFile, html)
    await page.goto(pathToFileURL(htmlFile).href)
    await page.evaluate(() => Promise.all([...document.images].map((im) => im.decode().catch(() => {}))))
    await page.screenshot({path: resolve(outDir, 'sheets', name + '.png'), fullPage: true})
    out.push({sheet: name + '.png', profile, group: sheet.group, frames: sheet.frames.map((f) => f.n)})
  }
  await ctx.close()
  return out
}
