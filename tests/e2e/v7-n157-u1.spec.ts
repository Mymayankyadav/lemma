import {test, expect, type Page} from '@playwright/test'
import {NOW, at} from './v7-scenes'

// N157 · v7 UX audit r3, U1 (large screens, web): measured in the browser at the widths the plan names.
test.use({locale: 'en-IN', timezoneId: 'Asia/Kolkata'})

async function go(page: Page, width: number, hash: string, flags = '', height = 800) {
  await page.setViewportSize({width, height})
  await page.clock.setFixedTime(NOW)
  // at() now lists the U4 flags as off; a case's own flags go last so they win.
  await page.goto(at(hash).replace('#', flags + '#'))
  await expect(page.locator('main').first()).toBeVisible()
  await page.waitForTimeout(300)
}

test('N157 V05 the rail count sits at the row end and never covers "Review"; V10 Settings is pinned, the Library scrolls', async ({page}) => {
  await go(page, 1280, '/')
  const review = page.locator('.v7-tab', {hasText: 'Review'}).first()
  const [pip, label] = await Promise.all([review.locator('.v7-tab-pip').boundingBox(), review.locator('.v7-tab-label').boundingBox()])
  expect(pip && label).toBeTruthy()
  expect(pip!.x).toBeGreaterThanOrEqual(label!.x + label!.width)
  const rail = await page.evaluate(() => {
    const settings = document.querySelector('.v7-rail-settings')!.getBoundingClientRect()
    const library = document.querySelector('.v7-rail-library')!
    return {settingsBottom: settings.bottom, overflow: getComputedStyle(library).overflowY, height: innerHeight}
  })
  expect(Math.abs(rail.settingsBottom - rail.height)).toBeLessThanOrEqual(16)
  expect(rail.overflow).toBe('auto')
})

test('N157 V06 a floating bar is centred on the content column, clear of the rail', async ({page}) => {
  for (const width of [900, 1280]) {
    await go(page, width, '/p/real-analysis')
    const bar = (await page.locator('.v7-path-bar').boundingBox())!
    const rail = await page.evaluate(() => document.querySelector('.v7-dock')!.getBoundingClientRect().right)
    expect(bar.x, String(width)).toBeGreaterThanOrEqual(rail)
    const centre = bar.x + bar.width / 2, column = rail + (width - rail) / 2
    expect(Math.abs(centre - column), String(width)).toBeLessThanOrEqual(2)
  }
})

test('N157 V07 no page scrolls sideways from 320 to 1728 px; a detail header is no wider than its column', async ({page}) => {
  for (const width of [320, 840, 1280, 1728]) for (const hash of ['/', '/cards/1', '/p/real-analysis/cp/CP4', '/insights?tab=learning', '/tasks', '/settings']) {
    await go(page, width, hash)
    const measured = await page.evaluate(() => {
      const main = document.querySelector('main')!.getBoundingClientRect(), header = document.querySelector('.v7-detail-header')?.getBoundingClientRect()
      return {scroll: document.documentElement.scrollWidth - innerWidth, header: header ? header.width - main.width : 0}
    })
    expect(measured.scroll, `${hash} at ${width}`).toBeLessThanOrEqual(0)
    expect(measured.header, `${hash} header at ${width}`).toBeLessThanOrEqual(1)
  }
})

test('N157 V08 chart text is 12 px at every width, a chart is at most 640 px, two abreast from 1100 px', async ({page}) => {
  for (const width of [390, 900, 1280, 1728]) {
    await go(page, width, '/insights?tab=learning')
    await expect(page.locator('svg.v7-plot').first()).toBeVisible()
    const plots = await page.evaluate(() => [...document.querySelectorAll<SVGSVGElement>('svg.v7-plot')].map(svg => {
      const box = svg.getBoundingClientRect(), view = svg.viewBox.baseVal.width, text = svg.querySelector('text')!
      return {scale: box.width / view, width: box.width, top: Math.round(box.top), font: parseFloat(getComputedStyle(text).fontSize) * box.width / view}
    }))
    expect(plots.length, String(width)).toBeGreaterThanOrEqual(2)
    for (const plot of plots) {
      expect(Math.abs(plot.scale - 1), `${width} ${JSON.stringify(plot)}`).toBeLessThanOrEqual(0.01)
      expect(Math.round(plot.font), String(width)).toBe(12)
      expect(plot.width, String(width)).toBeLessThanOrEqual(640)
    }
    // Two abreast: on a wide page the second chart shares its row with the section after it.
    const abreast = await page.evaluate(() => {
      const chart = document.querySelectorAll('svg.v7-plot')[1].closest('section')!, next = chart.nextElementSibling!
      return Math.round(chart.getBoundingClientRect().top) === Math.round(next.getBoundingClientRect().top)
    })
    expect(abreast, String(width)).toBe(width >= 1100)
  }
})

test('N157 V09 prose and mathematics are at most 34 em wide; the review card is a page, not the window', async ({page}) => {
  await go(page, 1280, '/review')
  await page.getByRole('button', {name: /^Start \d+ cards$/}).click()
  await expect(page.locator('.v7-review-card')).toBeVisible()
  await page.getByRole('button', {name: 'Show answer'}).click()
  const measured = await page.evaluate(() => ({
    math: [...document.querySelectorAll<HTMLElement>('main .lemma-math')].map(node => node.getBoundingClientRect().width / parseFloat(getComputedStyle(node).fontSize)),
    card: document.querySelector('.v7-review-card')!.getBoundingClientRect().width,
  }))
  expect(measured.math.length).toBeGreaterThanOrEqual(2)
  for (const width of measured.math) expect(width).toBeLessThanOrEqual(34.01)
  expect(measured.card).toBeLessThan(800)
})

test('N157 V09 the spread (flag v7Spread): question left, answer right, blank paper before the reveal, grades with their keys', async ({page}) => {
  await go(page, 1280, '/review', ',v7Spread')
  await page.getByRole('button', {name: /^Start \d+ cards$/}).click()
  const front = page.locator('.v7-review-front')
  await expect(front).toBeVisible()
  await expect(page.locator('.v7-review-back')).toHaveCount(0)
  const card = (await page.locator('.v7-review-card').boundingBox())!
  expect((await front.boundingBox())!.x + (await front.boundingBox())!.width).toBeLessThanOrEqual(card.x + card.width / 2)
  await expect(page.getByRole('button', {name: 'Show answer'}).locator('.v7-review-key')).toHaveText('Space')
  await page.keyboard.press(' ')
  const back = (await page.locator('.v7-review-back').boundingBox())!
  expect(back.x).toBeGreaterThanOrEqual(card.x + card.width / 2)
  expect(Math.abs(back.y - (await front.boundingBox())!.y)).toBeLessThanOrEqual(40)
  await expect(page.locator('.v7-review-grades .v7-review-key')).toHaveText(['1', '2', '3', '4'])
  // Below 840 px the same flag keeps the single page.
  await go(page, 700, '/review', ',v7Spread')
  await page.getByRole('button', {name: /^Start \d+ cards$|^Resume/}).first().click()
  await page.getByRole('button', {name: 'Show answer'}).click()
  const narrow = await page.evaluate(() => ({front: document.querySelector('.v7-review-front')!.getBoundingClientRect().bottom, back: document.querySelector('.v7-review-back')!.getBoundingClientRect().top}))
  expect(narrow.back).toBeGreaterThanOrEqual(narrow.front)
})

test('N157 U1 Tasks: three columns from 900 px; Right on a task\'s handle moves it to Doing', async ({page}) => {
  await go(page, 860, '/tasks')
  await expect(page.locator('.v7-tk-board')).toHaveCount(0)
  await expect(page.getByRole('radiogroup', {name: 'Task status'}).or(page.getByRole('group', {name: 'Task status'})).first()).toBeVisible()
  await go(page, 1000, '/tasks')
  const columns = page.locator('.v7-tk-column')
  await expect(columns).toHaveCount(3)
  await expect(columns.locator('.v7-tk-column-title')).toHaveText(['To do', 'Doing', 'Done'])
  const tops = await columns.evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top)))
  expect(new Set(tops).size).toBe(1)
  const todo = columns.nth(0), doing = columns.nth(1)
  const title = (await todo.locator('.v7-tk-title').first().textContent())!
  await expect(doing.getByText(title, {exact: true})).toHaveCount(0)
  await todo.getByRole('button', {name: 'Move ' + title}).focus()
  await page.keyboard.press('ArrowRight')
  await expect(doing.getByText(title, {exact: true})).toBeVisible()
  await expect(todo.getByText(title, {exact: true})).toHaveCount(0)
})

test('N157 U1 Settings: from 840 px the index stays on the left and the section opens on the right', async ({page}) => {
  await go(page, 800, '/settings?section=reminders')
  await expect(page.getByRole('navigation', {name: 'Settings sections'})).toHaveCount(0)
  await go(page, 900, '/settings')
  const index = page.getByRole('navigation', {name: 'Settings sections'}), pane = page.locator('section.v7-settings-pane')
  await expect(index).toBeVisible()
  await expect(pane.getByRole('heading', {level: 2}).first()).toHaveText('Appearance')
  await index.getByRole('link', {name: /Reminders/}).click()
  await expect(pane.getByRole('heading', {level: 2}).first()).toHaveText('Reminders')
  await expect(index.getByRole('link', {name: /Reminders/})).toHaveAttribute('aria-current', 'page')
  const [left, right] = await Promise.all([index.boundingBox(), pane.boundingBox()])
  expect(left!.x + left!.width).toBeLessThanOrEqual(right!.x)
})

test('N157 V23 with a fine pointer, buttons are 40 px only from 700 px; the touch size below', async ({page}) => {
  for (const [width, expected] of [[390, 48], [1280, 40]] as const) {
    await go(page, width, '/review')
    const height = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--v7-button').trim())
    expect(height, String(width)).toBe(expected + 'px')
  }
})

test('N157 S11 the margin (flag v7Margin): notes beside the page from 1100 px, M hides it and is remembered, a sheet below', async ({page}) => {
  await go(page, 1280, '/cards/1')
  await expect(page.getByRole('complementary', {name: 'Notes'})).toHaveCount(0)
  await go(page, 1280, '/cards/1', ',v7Margin')
  const notes = page.getByRole('complementary', {name: 'Notes'})
  await expect(notes).toBeVisible()
  await expect(notes.getByRole('region', {name: 'Why this card'})).toBeVisible()
  const [face, margin, bar] = await Promise.all([page.locator('.v7-card-face').boundingBox(), notes.boundingBox(), page.locator('.v7-learn-bar').boundingBox()])
  expect(margin!.x).toBeGreaterThanOrEqual(face!.x + face!.width)
  expect(margin!.width).toBeGreaterThanOrEqual(290)
  expect(bar!.x + bar!.width).toBeLessThanOrEqual(margin!.x)
  expect(await notes.evaluate(node => getComputedStyle(node).borderLeftWidth)).toBe('2px')
  await page.keyboard.press('m')
  await expect(notes).toHaveCount(0)
  await page.reload()
  await expect(page.locator('main').first()).toBeVisible()
  await expect(page.getByRole('complementary', {name: 'Notes'})).toHaveCount(0)
  await page.getByRole('button', {name: 'Show notes'}).click()
  await expect(page.getByRole('complementary', {name: 'Notes'})).toBeVisible()
  await go(page, 900, '/p/real-analysis', ',v7Margin')
  await expect(page.getByRole('complementary', {name: 'Notes'})).toHaveCount(0)
  await page.getByRole('button', {name: 'Margin', exact: true}).click()
  await expect(page.getByRole('dialog', {name: 'Notes'}).getByRole('complementary', {name: 'Notes'})).toBeVisible()
})

test('N157 V08 the card\'s recall chart is drawn at its width too: 12 px text, at most 640 px', async ({page}) => {
  for (const width of [320, 1280]) {
    await go(page, width, '/cards/1')
    const svg = page.locator('.v7-recall svg')
    await expect(svg).toBeVisible()
    const measured = await svg.evaluate((node: SVGSVGElement) => {
      const box = node.getBoundingClientRect(), scale = box.width / node.viewBox.baseVal.width
      return {scale, width: box.width, font: parseFloat(getComputedStyle(node.querySelector('text')!).fontSize) * scale}
    })
    expect(Math.round(measured.font), String(width)).toBe(12)
    expect(measured.width, String(width)).toBeLessThanOrEqual(640)
  }
})
