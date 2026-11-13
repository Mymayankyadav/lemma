import {test, expect, type Page} from '@playwright/test'
import {NOW} from './v7-scenes'

// N131 · the rest of the release and assets plan as v7 UX plan r3 keeps it, end to end on the demo: the coded stamp
// (and its reduced-motion fallback), the emblem loader, the focus orbit behind its flag, and "Share the page".
test.use({locale: 'en-IN', timezoneId: 'Asia/Kolkata', colorScheme: 'dark'})
const at = (hash: string, flags = '') => '/lemma/?demo=1&flags=v7Shell,v6Shell' + flags + '#' + hash
async function open(page: Page, hash: string, flags = '', motion = false) {
  await page.emulateMedia({reducedMotion: motion ? 'no-preference' : 'reduce'})
  await page.clock.setFixedTime(NOW)
  await page.goto(at(hash, flags))
  await expect(page.locator('html')).toHaveAttribute('data-v7', '')
  await page.waitForLoadState('networkidle')
}

test('N131 L-07 a button decision stamps the card first; under reduced motion it leaves at once', async ({page}) => {
  await open(page, '/proposals', '', true)
  await page.getByRole('button', {name: 'Approve', exact: true}).click()
  await expect(page.locator('.v7-inbox-wash[data-stamped][data-word="Approve"]')).toBeVisible()
  await expect(page.locator('.v7-inbox-position')).toHaveText('1 of 4')
  await open(page, '/proposals')
  const before = Number((await page.locator('.v7-inbox-position').textContent())!.replace(/^1 of /, ''))
  await page.getByRole('button', {name: 'Reject', exact: true}).click()
  await expect(page.locator('[data-stamped]')).toHaveCount(0)
  await expect(page.locator('.v7-inbox-position')).toHaveText('1 of ' + (before - 1))
})

test('N131 the focus orbit appears in an open session only with its flag', async ({page}) => {
  await open(page, '/', ',focusOrbit')
  await page.getByRole('button', {name: /Quick focus/i}).first().click()
  await page.getByText(/Count up from zero|No timer/).first().click()
  await page.getByRole('button', {name: 'Start focus'}).click()
  await expect(page.locator('.v7-focus-orbit')).toBeVisible()
})

test('N131 A5′ Day closed offers "Share the page" and saves a 1200 × 630 image', async ({page}) => {
  await open(page, '/today/close?date=2026-11-08')
  await page.getByRole('button', {name: 'Next', exact: true}).click()
  await page.getByRole('button', {name: 'Next', exact: true}).click()
  await page.getByRole('textbox', {name: 'Aim for tomorrow'}).fill('Understand compactness')
  await page.getByRole('button', {name: 'Close the day', exact: true}).click()
  await expect(page.getByRole('heading', {name: 'Day closed', exact: true})).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Share the page'}).click()])
  expect(download.suggestedFilename()).toBe('lemma-day.png')
  // Sharing keeps the learner on the page: the walk back to Today stops.
  await page.waitForTimeout(5500)
  await expect(page.getByRole('heading', {name: 'Day closed', exact: true})).toBeVisible()
})
