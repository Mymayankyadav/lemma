import {test, expect, type Page} from '@playwright/test'
import {NOW, at} from './v7-scenes'

// N156 · v7 UX audit r3, P6 (IC1, IC2, IC3; Owner decision E21): every line icon is drawn at 1.75 px whatever its size,
// and the screens show one glyph per meaning.
test.use({locale: 'en-IN', timezoneId: 'Asia/Kolkata'})

async function strokes(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll<SVGSVGElement>('svg.lucide, svg.v7-mark, svg.v7-grade-glyph')]
    .filter(svg => {const box = svg.getBoundingClientRect(); return box.width > 0 && box.height > 0})
    .map(svg => {
      const line = svg.querySelector('path,circle,rect,line,polyline')
      return {size: Math.round(svg.getBoundingClientRect().width), width: getComputedStyle(svg).strokeWidth,
        effect: line ? getComputedStyle(line).vectorEffect : 'none', kind: svg.getAttribute('class')}
    }))
}

test('N156 IC2 every icon on Today, Calendar, Review and Settings draws 1.75 px, at every size', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844})
  await page.clock.setFixedTime(NOW)
  const seen: {size: number; width: string; effect: string; kind: string | null}[] = []
  for (const [hash, ready] of [['/', '.v7-today-hero'], ['/calendar?view=day&date=2026-11-09', '.v7-cal-scroll'], ['/review', '.v7-rv-hero'], ['/settings', '.v7-settings-body, main']] as const) {
    await page.goto(at(hash))
    await expect(page.locator(ready).first()).toBeVisible()
    seen.push(...await strokes(page))
  }
  expect(seen.length).toBeGreaterThan(20)
  expect(new Set(seen.map(item => item.size)).size).toBeGreaterThanOrEqual(3)
  for (const item of seen) {
    expect(item.width, JSON.stringify(item)).toBe('1.75px')
    expect(item.effect, JSON.stringify(item)).toBe('non-scaling-stroke')
  }
})

test('N156 IC1 Search draws a card for Cards and the constellation for Concepts', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844})
  await page.clock.setFixedTime(NOW)
  await page.goto(at('/'))
  await page.getByRole('button', {name: 'Search'}).first().click()
  const field = page.getByRole('combobox', {name: 'Search'})
  await field.fill('compact')
  const concepts = page.getByRole('region', {name: 'Concepts'}), cards = page.getByRole('region', {name: 'Cards'})
  await expect(concepts).toBeVisible()
  await expect(cards).toBeVisible()
  // The constellation: three filled stars on two lines. The card: one card with two lines of text. Neither is a stack.
  const glyph = (region: typeof concepts) => region.locator('.v7-search-row svg').first().evaluate(svg => ({
    mark: svg.classList.contains('v7-mark'), stack: svg.classList.contains('lucide-layers'), star: svg.classList.contains('lucide-star'),
    circles: svg.querySelectorAll('circle').length, rects: svg.querySelectorAll('rect').length}))
  expect(await glyph(concepts)).toEqual({mark: true, stack: false, star: false, circles: 3, rects: 0})
  expect(await glyph(cards)).toEqual({mark: true, stack: false, star: false, circles: 0, rects: 1})
})
