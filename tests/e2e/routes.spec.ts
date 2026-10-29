import { test, expect } from '@playwright/test'
const routes = [
 ['/', 'Home'], ['/projects', 'Projects'], ['/projects/new', 'New project'],
 ['/p/real-analysis', 'Project'], ['/p/real-analysis/cp/CP4', 'Checkpoint'],
 ['/s/real-analysis/7', 'Session record'], ['/proposals', 'Approve'],
 ['/proposals/example', 'Plan proposal'], ['/review', 'Review'],
 ['/review/run', 'Card review'], ['/review/done', 'Review complete'],
 ['/cards', 'Cards'], ['/cards/7', 'Card detail'], ['/atlas', 'Atlas'],
 ['/insights', 'Insights'], ['/settings', 'Settings'], ['/sign-in', 'Sign in'], ['/kit', 'Component kit'],
] as const
const tabRoutes = new Set(['/', '/projects', '/review', '/insights'])
test('every screen renders in demo mode with correct navigation and no errors', async ({page}) => {
 const errors: string[] = []
 page.on('pageerror', error => errors.push(error.message))
 page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
 // Fonts are decorative and must not make the demo depend on the network.
 await page.route('https://fonts.googleapis.com/**', route => route.fulfill({body: ''}))
 await page.route('https://fonts.gstatic.com/**', route => route.fulfill({body: ''}))
 for (const [path, heading] of routes) {
  await page.goto(`./?demo=1#${path}`)
  await expect(page.getByRole('heading', {name: heading, exact: true, level: 1})).toBeVisible()
  await expect(page.getByText('Demo', {exact: true})).toBeVisible()
  const nav = page.getByRole('navigation', {name: 'Main navigation'})
  if (tabRoutes.has(path)) {
   await expect(nav.getByRole('link')).toHaveCount(4)
   await expect(nav.locator('[aria-current="page"]')).toHaveCount(1)
  } else await expect(nav).toHaveCount(0)
 }
 expect(errors).toEqual([])
 await page.goto('./?demo=1#/')
 await page.screenshot({path: 'test-results/screens/routes.png', fullPage: true})
})
test('demo persists in the tab and explicit live mode gates private screens', async ({page}) => {
 await page.route('https://fonts.googleapis.com/**', route => route.fulfill({body: ''}))
 await page.goto('./?demo=1#/projects')
 await expect(page.getByRole('heading', {name: 'Projects', exact: true})).toBeVisible()
 await page.goto('./#/review')
 await expect(page.getByRole('heading', {name: 'Review', exact: true})).toBeVisible()
 await page.goto('./?demo=0#/projects')
 await expect(page.getByRole('heading', {name: 'Sign in', exact: true})).toBeVisible()
 await expect(page).toHaveURL(/#\/sign-in$/)
 await expect(page.getByText('Demo', {exact: true})).toHaveCount(0)
 await page.screenshot({path: 'test-results/screens/routes-auth.png', fullPage: true})
})
