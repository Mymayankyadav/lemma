import {test, expect, type Page} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {NOW, at} from './v7-scenes'

// N155 · v7 UX audit r3, P3 (IL3, IL4, IL5): measured in the browser, with the app's own stylesheet.
test.use({locale: 'en-IN', timezoneId: 'Asia/Kolkata'})

const source = readFileSync('src/ui/v7/Illustration.tsx', 'utf8')
const art = Object.fromEntries([...source.matchAll(/^ {2}(\w+): `([\s\S]*?)`,$/gm)].map(match => [match[1], match[2]])) as Record<string, string>

/** Draw every illustration (or one, inside a subject) on a v7 page so the real stylesheet applies. */
async function sheet(page: Page, scheme: 'light' | 'dark') {
  await page.emulateMedia({colorScheme: scheme})
  await page.clock.setFixedTime(NOW)
  await page.goto(at('/review'))
  await expect(page.locator('.v7-rv-hero')).toBeVisible()
}

test('N155 IL3 every drawing fills the live area: 80 ± 6 units, inside the 86-unit box centred on the disc', async ({page}) => {
  await sheet(page, 'light')
  const measured = await page.evaluate(art => Object.fromEntries(Object.entries(art).map(([name, markup]) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 240 180'); svg.setAttribute('class', 'v7-il'); svg.innerHTML = markup
    document.body.append(svg)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    const root = svg.getScreenCTM()!.inverse()
    for (const shape of svg.querySelectorAll<SVGGraphicsElement>('path,rect,circle')) {
      if (shape.classList.contains('bg') || shape.hasAttribute('data-badge') || shape.classList.contains('w')) continue
      const box = shape.getBBox(), matrix = root.multiply(shape.getScreenCTM()!)
      for (const [x, y] of [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]) {
        const point = new DOMPoint(x, y).matrixTransform(matrix)
        x0 = Math.min(x0, point.x); y0 = Math.min(y0, point.y); x1 = Math.max(x1, point.x); y1 = Math.max(y1, point.y)
      }
    }
    svg.remove()
    return [name, {extent: Math.max(x1 - x0, y1 - y0), reach: Math.max(120 - x0, x1 - 120, 90 - y0, y1 - 90)}]
  })), art)
  expect(Object.keys(measured)).toHaveLength(10)
  for (const [name, {extent, reach}] of Object.entries(measured)) {
    expect(extent, name + ' extent').toBeGreaterThanOrEqual(74)
    expect(extent, name + ' extent').toBeLessThanOrEqual(86)
    // The object (badges sit outside it) stays inside the live area: 43 units from the disc's centre each way.
    expect(reach, name + ' reach').toBeLessThanOrEqual(43)
  }
})

for (const scheme of ['light', 'dark'] as const) {
  test(`N155 IL4 accents clear 3 : 1 on the disc for every subject; badges are the brand (${scheme})`, async ({page}) => {
    await sheet(page, scheme)
    const ratios = await page.evaluate(() => {
      const parse = (value: string) => {
        const rgb = value.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/)
        if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])].map(v => v / 255)
        const srgb = value.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/)
        if (srgb) return [Number(srgb[1]), Number(srgb[2]), Number(srgb[3])]
        throw new Error('colour ' + value)
      }
      const luminance = (value: string) => {
        const [r, g, b] = parse(value).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      const contrast = (a: string, b: string) => {const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05)}
      const out: Record<string, number> = {}
      for (const subject of ['', 'v7-subject-1', 'v7-subject-2', 'v7-subject-3', 'v7-subject-4', 'v7-subject-5', 'v7-subject-6', 'v7-subject-7', 'v7-subject-8']) {
        const host = document.createElement('div'); host.className = subject
        host.innerHTML = '<svg class="v7-il" viewBox="0 0 240 180"><circle class="bg" cx="120" cy="90" r="66"/><circle class="f" cx="114" cy="98" r="4"/><circle class="f" data-badge="" cx="154" cy="114" r="13"/></svg>'
        document.body.append(host)
        const [disc, accent, badge] = [...host.querySelectorAll('circle')].map(node => getComputedStyle(node).fill)
        out[(subject || 'none') + ' accent'] = contrast(accent, disc)
        out[(subject || 'none') + ' badge'] = contrast(badge, disc)
        host.remove()
      }
      return out
    })
    expect(Object.keys(ratios)).toHaveLength(18)
    for (const [key, ratio] of Object.entries(ratios)) expect(ratio, key).toBeGreaterThanOrEqual(3)
    // Every badge has the same colour whatever the subject.
    const badges = await page.evaluate(() => {
      const colours = new Set<string>()
      for (const subject of ['', 'v7-subject-3', 'v7-subject-5', 'v7-subject-8']) {
        const host = document.createElement('div'); host.className = subject
        host.innerHTML = '<svg class="v7-il" viewBox="0 0 240 180"><circle class="f" data-badge="" cx="154" cy="114" r="13"/></svg>'
        document.body.append(host); colours.add(getComputedStyle(host.querySelector('circle')!).fill); host.remove()
      }
      return [...colours]
    })
    expect(badges).toHaveLength(1)
  })
}

for (const [width, height] of [[360, 740], [390, 844]] as const) {
  test(`N155 IL5 empty states sit in the first viewport (${width} px)`, async ({page}) => {
    await page.setViewportSize({width, height})
    await page.clock.setFixedTime(NOW)
    await page.goto(at('/calendar?view=day&date=2026-11-30'))
    const calendar = page.locator('.v7-cal-empty-state')
    await expect(calendar).toBeVisible()
    const box = (await calendar.boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(height)
    // The grid stays tappable through it.
    const through = await calendar.evaluate(node => {
      const rect = node.getBoundingClientRect(), under = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return !!under && !node.contains(under)
    })
    expect(through).toBe(true)

    await page.goto(at('/insights?range=day'))
    const progress = page.locator('.v7-progress-nothing')
    await expect(progress).toBeVisible()
    await expect(progress.locator('[data-illustration="progress"]')).toHaveAttribute('width', '160')
    expect(((await progress.boundingBox())!).y + 120).toBeLessThanOrEqual(height)
    await expect(page.locator('.v7-progress-hero')).toHaveCount(0)
    await expect(page.getByText(/most on/)).toHaveCount(0)
  })
}
