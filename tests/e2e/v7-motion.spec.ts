import {test, expect, type Page} from '@playwright/test'
import {NOW, at} from './v7-scenes'

// A1 · Motion v1 (release and assets plan): with motion allowed, sheets rise on the spring, a revealed answer rises in and
// a task completed here draws its tick; under the system's reduced motion or Settings › Reduce effects nothing moves,
// and the settled layout is identical either way.
test.use({locale: 'en-IN', timezoneId: 'Asia/Kolkata', colorScheme: 'dark'})

type Mode = 'motion' | 'system-reduced' | 'reduce-effects'
async function open(page: Page, mode: Mode, hash = '/') {
  await page.emulateMedia({reducedMotion: mode === 'system-reduced' ? 'reduce' : 'no-preference'})
  if (mode === 'reduce-effects') await page.addInitScript(() => localStorage.setItem('lemma.v7.reduce-effects', '1'))
  await page.clock.setFixedTime(NOW)
  await page.goto(at(hash))
  await expect(page.locator('html')).toHaveAttribute('data-v7', '')
  await page.waitForLoadState('networkidle')
}
/** Names of the animations and transitions running on an element (CSS transitions report their property). */
const running = (page: Page, selector: string) => page.locator(selector).first().evaluate(element =>
  element.getAnimations({subtree: false}).map(animation => (animation as CSSTransition).transitionProperty ?? (animation as CSSAnimation).animationName))
const settle = (page: Page, selector: string) => page.locator(selector).first().evaluate(async element => {
  await Promise.all(element.getAnimations({subtree: true}).map(animation => animation.finished.catch(() => undefined)))
  const box = element.getBoundingClientRect()
  return {x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height), opacity: getComputedStyle(element).opacity}
})

async function openCapture(page: Page) {
  await page.getByRole('button', {name: 'Capture', exact: true}).first().click()
  await expect(page.locator('dialog.v7-sheet[open]')).toBeVisible()
}

test('A1 a sheet rises and fades in on the spring when motion is allowed', async ({page}) => {
  await open(page, 'motion')
  await openCapture(page)
  const names = await running(page, 'dialog.v7-sheet[open]')
  expect(names).toEqual(expect.arrayContaining(['opacity', 'translate']))
})

for (const mode of ['system-reduced', 'reduce-effects'] as const) {
  test(`A1 under ${mode} a sheet appears without movement`, async ({page}) => {
    await open(page, mode)
    if (mode === 'reduce-effects') await expect(page.locator('html')).toHaveAttribute('data-v7-reduce-effects', '')
    await openCapture(page)
    expect(await running(page, 'dialog.v7-sheet[open]')).not.toContain('translate')
  })
}

test('A1 the settled sheet is identical with and without motion', async ({browser}) => {
  const boxes = []
  for (const mode of ['motion', 'system-reduced', 'reduce-effects'] as const) {
    const context = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, locale: 'en-IN', timezoneId: 'Asia/Kolkata', colorScheme: 'dark'})
    const page = await context.newPage()
    await open(page, mode)
    await openCapture(page)
    boxes.push(await settle(page, 'dialog.v7-sheet[open]'))
    await context.close()
  }
  expect(boxes[1]).toEqual(boxes[0])
  expect(boxes[2]).toEqual(boxes[0])
  expect(boxes[0].opacity).toBe('1')
})

test('A1 a revealed answer rises in; under reduced motion it simply appears', async ({page}) => {
  for (const mode of ['motion', 'system-reduced'] as const) {
    await open(page, mode, '/review')
    await page.getByRole('button', {name: /^(Start \d+ cards?|Resume)/}).first().click()
    await page.waitForURL(/#\/review\/run/)
    await page.getByRole('button', {name: 'Show answer'}).click()
    await expect(page.locator('.v7-review-back')).toBeVisible()
    const names = await running(page, '.v7-review-back')
    if (mode === 'motion') expect(names).toContain('v7-m-rise')
    else expect(names).not.toContain('v7-m-rise')
  }
})

test('A1 a task completed here draws its tick; tasks already done do not', async ({page}) => {
  await open(page, 'motion', '/tasks')
  await expect(page.locator('[data-v7-draw]')).toHaveCount(0)
  const box = page.getByRole('checkbox', {name: /^Complete /}).first()
  await box.click()
  const drawn = page.locator('[data-v7-draw]').first()
  await expect(drawn).toBeAttached()
  expect(await drawn.locator('path').first().evaluate(path => path.getAnimations().map(animation => (animation as CSSAnimation).animationName))).toContain('v7-m-check')
})
