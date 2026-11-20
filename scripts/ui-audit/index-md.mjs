// Renders INDEX.md: the file a reviewer reads first (sheet order, frame list, scene map, capture warnings).
import {PROFILES} from './lib.mjs'

const id = (profile, n) => PROFILES[profile].prefix + String(n).padStart(3, '0')

export function renderIndex(manifest, {GROUPS, perSheet}) {
  const L = []
  L.push('# Lemma UI audit — phone, night theme', '')
  L.push(`Source commit \`${manifest.commit}\` · viewport ${manifest.viewport.width}×${manifest.viewport.height} @${manifest.scale}x · ${manifest.theme} · clock frozen at ${manifest.generated} (timers do not tick on their own; the capture moves the clock where a flow needs time to pass).`, '')
  L.push('Read `REVIEW_BRIEF.md` first (what to judge, the design rules, the output format), then this file, then the sheets.', '')
  L.push('## How to read the pictures', '',
    `- **Sheets** (\`sheets/*.png\`, ${manifest.sheetWidth ?? 1568}px wide) put up to ${perSheet} phone frames side by side, in walkthrough order. Each frame is captioned with its id (\`F###\` populated, \`E###\` empty, \`H###\` heavy), the screen and the state. Open \`frames/<file>\` (2x, full resolution) when a detail is too small.`,
    '- Frames of one flow are adjacent and in the order a person would see them (open sheet → typed → saved → result). `1/3`, `2/3`… are scroll positions of one long screen (each step scrolls about 80% of a screen, so content overlaps a little). The bottom tab bar and top header are fixed, so they repeat on every scroll frame.',
    '- Profiles: **E = empty** (a brand-new account: no paths, cards, tasks, blocks, sessions) and **F = populated** (a typical amount of data: 3 paths, ~90 cards, 23 reviews due, 6 proposals, a few tasks and blocks). **H = heavy** (stress data) exists only when captured with `--profiles heavy`.',
    '- A red `ERROR SCREEN` / `H-SCROLL` on a caption is automatic: the app showed its error page, or the page scrolls sideways. An orange line is a capture warning: a step could not be performed, so the frame may not show the intended state (treat that as a capture gap, not a product bug, unless the control really is missing).',
    '- `manifest.json` carries the same data for tools, with DOM facts per frame (`targetsUnder40px`: visible controls smaller than 40px in either direction; `clippedOffscreen`: elements cut by the screen edge) and console errors per scene.', '')

  // scene -> frames per profile
  L.push('## Scene map (same screen, different profiles)', '', '| Scene | What | ' + Object.keys(manifest.profiles).map((p) => PROFILES[p].prefix + ' frames').join(' | ') + ' |', '|---|---|' + Object.keys(manifest.profiles).map(() => '---').join('|') + '|')
  const order = [], seen = new Set()
  for (const data of Object.values(manifest.profiles)) for (const s of data.scenes) if (!seen.has(s.id)) { seen.add(s.id); order.push(s) }
  for (const s of order) {
    const cells = Object.entries(manifest.profiles).map(([profile, data]) => {
      const fr = data.frames.filter((f) => f.scene === s.id)
      if (!fr.length) return '—'
      return fr.length === 1 ? id(profile, fr[0].n) : `${id(profile, fr[0].n)}–${id(profile, fr.at(-1).n)}`
    })
    L.push(`| \`${s.id}\` | ${s.title}${s.check ? ' — ' + s.check : ''} | ${cells.join(' | ')} |`)
  }
  L.push('')

  for (const [profile, data] of Object.entries(manifest.profiles)) {
    L.push(`## Profile: ${data.label}`, '')
    const sheets = manifest.sheets.filter((s) => s.profile === profile)
    L.push('| Sheet | Frames | Screens |', '|---|---|---|')
    for (const s of sheets) {
      const fr = s.frames.map((n) => data.frames.find((f) => f.n === n))
      const names = [...new Set(fr.map((f) => f.groupTitle))].join('; ')
      L.push(`| \`sheets/${s.sheet}\` | ${id(profile, s.frames[0])}–${id(profile, s.frames.at(-1))} | ${names} |`)
    }
    L.push('', '### Frames', '', '| Frame | Screen | State | Note |', '|---|---|---|---|')
    for (const f of data.frames) {
      const flags = [f.facts?.errorScreen ? 'ERROR SCREEN' : '', f.facts?.overflowX ? 'H-SCROLL' : '', ...(f.warnings ?? []).map((w) => '⚠ ' + w)].filter(Boolean).join('; ')
      L.push(`| ${id(profile, f.n)} | ${f.groupTitle} | ${f.label}${f.part ? ' (' + f.part + ')' : ''} | ${[f.note, flags].filter(Boolean).join(' · ').replace(/\|/g, '/')} |`)
    }
    const bad = data.scenes.filter((s) => s.error || s.consoleErrors)
    if (bad.length) {
      L.push('', '### Capture errors and console errors', '')
      for (const s of bad) L.push(`- **${s.id}**${s.error ? ' — capture failed: ' + s.error : ''}${s.consoleErrors ? ` — ${s.consoleErrors} console/page error(s): ${s.console.join(' | ').replace(/\n/g, ' ').slice(0, 300)}` : ''}`)
    }
    L.push('')
  }
  L.push('## Groups', '')
  for (const [k, v] of Object.entries(GROUPS)) L.push(`- ${v}`)
  L.push('')
  return L.join('\n')
}
