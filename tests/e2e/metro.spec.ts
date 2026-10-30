import {test,expect} from '@playwright/test'

test.beforeEach(async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
 await page.setViewportSize({width:390,height:844})
})

for(const world of ['graph','graph-night'] as const){
 test('UI-6b Metro shows scheduled stations, a legend and a project headline in '+world,async({page})=>{
  await page.goto('./?demo=1&theme='+world+'#/p/real-analysis')
  const timeline=page.getByRole('region',{name:'Project timeline'}).locator('[data-timeline="metro"]')
  await expect(timeline).toBeVisible()
  await expect(timeline.locator('[data-station-state]')).toHaveCount(13)
  await expect(timeline.locator('[data-track-state]').first()).toBeVisible()
  await expect(page.getByLabel('Schedule legend')).toContainText('Early')
  await expect(page.getByLabel('Schedule legend')).toContainText('On time')
  await expect(page.getByLabel('Schedule legend')).toContainText('Late')
  await expect(page.getByRole('region',{name:'Goal and distance'}).locator('[data-schedule-chip]')).toBeVisible()
  await expect(timeline).toContainText('Planned')
  await timeline.getByRole('button').focus()
  await page.keyboard.press('ArrowRight')
  // The additional proposed CP4a has no approved date and must not be assigned one.
  await expect(timeline).toContainText('CP4a')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({path:'test-results/screens/ui6b-project-'+world+'.png',fullPage:true})
  await page.goto('./?demo=1&theme='+world+'#/p/real-analysis/cp/CP4')
  await expect(page.getByRole('dialog',{name:'Compactness'}).getByLabel('Checkpoint schedule')).toContainText('Planned')
  await page.screenshot({path:'test-results/screens/ui6b-checkpoint-'+world+'.png',fullPage:true})
 })
 test('UI-6b scheduled Metro appears in Today and the Paths library in '+world,async({page})=>{
  await page.goto('./?demo=1&theme='+world+'#/')
  const goals=page.getByRole('region',{name:'Distance to your goals'})
  await expect(goals.locator('[data-timeline="metro"]').first()).toBeVisible()
  await expect(goals.locator('[data-schedule-chip]').first()).toBeVisible()
  await page.screenshot({path:'test-results/screens/ui6b-today-'+world+'.png',fullPage:true})
  await page.goto('./?demo=1&theme='+world+'#/projects')
  const row=page.locator('[data-project-row="real-analysis"]')
  await expect(row.locator('[data-mini-metro]')).toBeVisible()
  await expect(row.locator('[data-track-state]').first()).toBeVisible()
  await page.screenshot({path:'test-results/screens/ui6b-paths-'+world+'.png',fullPage:true})
 })
}
