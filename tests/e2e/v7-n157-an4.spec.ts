import {test, expect, type Page} from '@playwright/test'
import {NOW, at} from './v7-scenes'

// N157 · v7 UX audit r3, AN4 (large screens and postures). Foldables are emulated with Chromium's display-feature
// override: a vertical hinge is the book posture, a horizontal one the tabletop posture. Measured, not screenshotted
// (a screenshot resets the emulated device metrics).
test.use({locale: 'en-IN', timezoneId: 'Asia/Kolkata'})

async function fold(page: Page, width: number, height: number, orientation: 'vertical' | 'horizontal', hash: string, flags = '') {
  await page.setViewportSize({width, height})
  const offset = orientation === 'vertical' ? width / 2 - 12 : height / 2 - 12
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false,
    displayFeature: {orientation, offset, maskLength: 24}})
  await page.clock.setFixedTime(NOW)
  await page.goto(at(hash).replace('flags=v7Shell,v6Shell', 'flags=v7Shell,v6Shell' + flags))
  await expect(page.locator('main').first()).toBeVisible()
  await page.waitForTimeout(400)
  expect(await page.evaluate(query => matchMedia(query).matches, orientation === 'vertical' ? '(horizontal-viewport-segments:2)' : '(vertical-viewport-segments:2)')).toBe(true)
  return {start: offset, end: offset + 24}
}
/** Every visible interactive element lies wholly on one side of the hinge. */
async function crossing(page: Page, axis: 'x' | 'y', start: number, end: number) {
  return page.evaluate(({axis, start, end}) => [...document.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[role="button"],[role="radio"],[role="checkbox"],[tabindex="0"]')]
    .filter(node => {const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== 'hidden'})
    .filter(node => {
      const box = node.getBoundingClientRect(), [low, high] = axis === 'x' ? [box.left, box.right] : [box.top, box.bottom]
      return high > start + 0.5 && low < end - 0.5
    }).map(node => node.tagName + ' ' + (node.getAttribute('aria-label') ?? node.textContent ?? '').trim().slice(0, 30)), {axis, start, end})
}

test('N157 AN4 list beside detail from 600 px: the Inbox queue sits beside the card', async ({page}) => {
  await page.setViewportSize({width: 599, height: 900})
  await page.clock.setFixedTime(NOW)
  await page.goto(at('/proposals'))
  await expect(page.locator('.v7-inbox-card, .v7-inbox-panel').first()).toBeVisible()
  await expect(page.getByRole('list', {name: 'Queue'})).toHaveCount(0)
  await page.setViewportSize({width: 600, height: 900})
  const queue = page.getByRole('list', {name: 'Queue'})
  await expect(queue).toBeVisible()
  const [list, stack] = await Promise.all([queue.boundingBox(), page.locator('.v7-inbox-stack').boundingBox()])
  expect(list!.x + list!.width).toBeLessThanOrEqual(stack!.x)
})

test('N157 AN4 book posture: nothing interactive across the hinge; a list on one screen, its detail on the other', async ({page}) => {
  for (const hash of ['/', '/proposals', '/settings', '/cards/1', '/p/real-analysis', '/tasks']) {
    const {start, end} = await fold(page, 1200, 800, 'vertical', hash)
    expect(await crossing(page, 'x', start, end), hash).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), hash).toBeLessThanOrEqual(0)
  }
  const {start, end} = await fold(page, 1200, 800, 'vertical', '/proposals')
  const [queue, card] = await Promise.all([page.getByRole('list', {name: 'Queue'}).boundingBox(), page.locator('.v7-inbox-stack').boundingBox()])
  expect(queue!.x + queue!.width).toBeLessThanOrEqual(start)
  expect(card!.x).toBeGreaterThanOrEqual(end)
})

test('N157 AN4 book posture: the review spread (v7Spread) puts the question on one screen and the answer on the other', async ({page}) => {
  const {start, end} = await fold(page, 1200, 800, 'vertical', '/review', ',v7Spread')
  await page.getByRole('button', {name: /^Start \d+ cards$/}).click()
  await page.getByRole('button', {name: 'Show answer'}).click()
  const [front, back] = await Promise.all([page.locator('.v7-review-front').boundingBox(), page.locator('.v7-review-back').boundingBox()])
  expect(front!.x + front!.width).toBeLessThanOrEqual(start)
  expect(back!.x).toBeGreaterThanOrEqual(end)
  expect(await crossing(page, 'x', start, end)).toEqual([])
})

test('N157 AN4 tabletop posture: Focus is a clock on the upper screen, its controls on the lower', async ({page}) => {
  const {start, end} = await fold(page, 900, 1000, 'horizontal', '/focus')
  const clock = page.getByTestId('focus-clock')
  if (!(await clock.count())) {
    await page.goto(at('/'))
    await page.getByRole('button', {name: /^(Start now|Start focus)$/}).first().click()
    await page.waitForURL(/#\/focus/)
  }
  await expect(clock).toBeVisible()
  const [time, controls] = await Promise.all([clock.boundingBox(), page.getByRole('region', {name: 'Session controls'}).boundingBox()])
  expect(time!.y + time!.height).toBeLessThanOrEqual(start)
  expect(controls!.y).toBeGreaterThanOrEqual(end)
  expect(await crossing(page, 'y', start, end)).toEqual([])
})

test('N157 AN4 48 px at every width in the app: buttons keep the touch size on a tablet', async ({page}) => {
  await page.setViewportSize({width: 1200, height: 800})
  await page.clock.setFixedTime(NOW)
  await page.goto(at('/review'))
  await expect(page.locator('main').first()).toBeVisible()
  await page.evaluate(() => document.documentElement.setAttribute('data-native-app', ''))
  const sizes = await page.evaluate(() => {const style = getComputedStyle(document.documentElement); return [style.getPropertyValue('--v7-touch').trim()]})
  expect(sizes).toEqual(['48px'])
})
