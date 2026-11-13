import {test, expect, type Page} from '@playwright/test'
import {NOW, at} from './v7-scenes'

// N154 · v7 UX audit r3 (Owner decisions E17 and E22): the endings are felt where they land (LT8), the review round and
// task ticks speak the haptic vocabulary (AW6), and the Lottie player respects Save-Data and is warmed near an ending (LT7).
test.use({locale: 'en-IN', timezoneId: 'Asia/Kolkata'})

/** Record every vibration pattern the page asks for. */
async function feel(page: Page) {
  await page.addInitScript(() => {
    const felt: unknown[] = [];
    (window as unknown as {felt: unknown[]}).felt = felt;
    Object.defineProperty(navigator, 'vibrate', {configurable: true, value: (pattern: unknown) => {felt.push(pattern); return true}})
  })
  return () => page.evaluate(() => (window as unknown as {felt: unknown[]}).felt)
}
function players(page: Page) {
  const seen: string[] = []
  page.on('request', request => {if (/lottiePlayer|dotlottie/.test(request.url())) seen.push(request.url())})
  return () => seen
}
async function closeDay(page: Page) {
  await page.clock.setFixedTime(NOW)
  await page.goto(at('/today/close?date=2026-11-08'))
  await page.getByRole('button', {name: 'Next', exact: true}).click()
  await page.getByRole('button', {name: 'Next', exact: true}).click()
  await page.getByRole('textbox', {name: 'Aim for tomorrow'}).fill('Understand compactness')
  await page.getByRole('button', {name: 'Close the day', exact: true}).click()
  await expect(page.getByRole('heading', {name: 'Day closed', exact: true})).toBeVisible()
}

test('N154 LT8 Day closed is felt once when its ∎ lands (still, reduced motion)', async ({page}) => {
  const felt = await feel(page)
  await closeDay(page)
  await expect.poll(felt).toEqual([[12, 40, 20]])
})

test('N154 LT8 with motion, Day closed is felt on the frame its ∎ lands, not before', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'no-preference'})
  const felt = await feel(page)
  await closeDay(page)
  const moment = page.locator('[data-lottie="day-closed"]')
  await expect(moment).toHaveAttribute('data-lottie-state', 'playing')
  await expect.poll(felt, {timeout: 5000}).toEqual([[12, 40, 20]])
})

test('N154 LT7 on Save-Data Day closed shows its still and never fetches the player', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'no-preference'})
  await page.addInitScript(() => Object.defineProperty(navigator, 'connection', {configurable: true, value: {saveData: true, effectiveType: '4g'}}))
  const fetched = players(page)
  await closeDay(page)
  const moment = page.locator('[data-lottie="day-closed"]')
  await expect(moment.locator('[data-illustration="closed"]')).toBeVisible()
  await page.waitForTimeout(500)
  await expect(moment).toHaveAttribute('data-lottie-state', 'still')
  expect(fetched()).toEqual([])
})

test('N154 LT7 with one proposal left the Inbox fetches the ending in idle time; the last decision is felt', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'no-preference'})
  const fetched = players(page), felt = await feel(page)
  await page.setViewportSize({width: 390, height: 844})
  await page.clock.setFixedTime(NOW)
  await page.goto(at('/proposals'))
  const position = page.locator('.v7-inbox-position')
  await expect(position).toHaveText('1 of 5')
  for (const left of ['1 of 4', '1 of 3', '1 of 2', '1 of 1']) {
    expect(fetched()).toEqual([])
    await page.keyboard.press('a')
    await expect(position).toHaveText(left)
  }
  await expect.poll(() => fetched().length).toBeGreaterThan(0)
  await page.keyboard.press('a')
  await expect(page.getByRole('heading', {name: 'Inbox zero'})).toBeVisible()
  // Five decisions (a click each), then the ending (Inbox zero lands).
  await expect.poll(felt, {timeout: 5000}).toEqual([8, 8, 8, 8, 8, [12, 40, 20]])
  // Coming back to the now-empty Inbox shows Inbox zero again, but nothing was just finished, so nothing is felt.
  await page.evaluate(() => {location.hash = '#/'})
  await expect(page.locator('.v7-today-hero')).toBeVisible()
  await page.evaluate(() => {location.hash = '#/proposals'})
  await expect(page.getByRole('heading', {name: 'Inbox zero'})).toBeVisible()
  await page.waitForTimeout(2500)
  expect(await felt()).toEqual([8, 8, 8, 8, 8, [12, 40, 20]])
})

test('N154 AW6 the review round: a soft tick on reveal, a click for Good, two ticks for Again', async ({page}) => {
  const felt = await feel(page)
  await page.setViewportSize({width: 390, height: 844})
  await page.clock.setFixedTime(NOW)
  await page.goto(at('/review'))
  await page.getByRole('button', {name: /^Start \d+ cards$/}).click()
  await expect(page.locator('.v7-review-card')).toBeVisible()
  await page.getByRole('button', {name: 'Show answer'}).click()
  await expect.poll(felt).toEqual([5])
  await page.keyboard.press('3')
  await expect.poll(felt).toEqual([5, 8])
  await expect(page.getByRole('button', {name: 'Show answer'})).toBeVisible()
  await page.keyboard.press(' ')
  await page.keyboard.press('1')
  await expect.poll(felt).toEqual([5, 8, 5, [8, 40, 8]])
})
