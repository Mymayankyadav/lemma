import {test, expect, type Page} from '@playwright/test'
import {NOW, at} from './v7-scenes'

// N129 · A3 Lottie moments: Day closed draws itself in when motion is allowed, with the player and its WebAssembly
// served by Lemma itself; under reduced motion the still stays and the player is never fetched; Today never loads it.
test.use({locale: 'en-IN', timezoneId: 'Asia/Kolkata', colorScheme: 'dark'})

function watch(page: Page) {
  const seen: string[] = []
  page.on('request', request => seen.push(request.url()))
  return {
    player: () => seen.filter(url => /lottiePlayer|dotlottie/.test(url)),
    elsewhere: () => seen.filter(url => /jsdelivr|unpkg|lottiefiles/.test(url)),
  }
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

test('N129 Day closed plays its animation from a self-hosted player when motion is allowed', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'no-preference'})
  const requests = watch(page)
  await closeDay(page)
  await expect(page.locator('[data-lottie="day-closed"]')).toHaveAttribute('data-lottie-state', 'playing')
  expect(requests.player().some(url => url.endsWith('.wasm'))).toBe(true)
  for (const url of requests.player()) expect(new URL(url).origin).toBe(new URL(page.url()).origin)
  expect(requests.elsewhere()).toEqual([])
})

test('N129 under reduced motion Day closed shows the still and never fetches the player', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'})
  const requests = watch(page)
  await closeDay(page)
  const moment = page.locator('[data-lottie="day-closed"]')
  await expect(moment.locator('[data-illustration="closed"]')).toBeVisible()
  await page.waitForTimeout(300)
  await expect(moment).toHaveAttribute('data-lottie-state', 'still')
  expect(requests.player()).toEqual([])
})

test('N129 Today does not load the Lottie player', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'no-preference'})
  const requests = watch(page)
  await page.clock.setFixedTime(NOW)
  await page.goto(at('/'))
  await expect(page.locator('html')).toHaveAttribute('data-v7', '')
  await page.waitForLoadState('networkidle')
  expect(requests.player()).toEqual([])
})
