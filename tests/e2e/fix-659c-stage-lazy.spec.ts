import {test,expect} from '@playwright/test'
import {mkdirSync} from 'node:fs'

// FIX-659c: collapsed stage rows must not consume React/KaTeX/DOM work.
// The stage headers and their progress remain visible and keyboard-accessible.
test.describe.configure({retries:0})
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX-659c stage rows mount on demand: '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(90_000)
  await page.setViewportSize({width,height:width===360?740:844})
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/p/real-analysis',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('region',{name:'Stages'})).toBeVisible()
  const cards=page.locator('[data-stage-card]')
  await expect(cards.first()).toBeVisible()
  expect(await cards.count()).toBeGreaterThan(1)
  const expanded=page.locator('[data-stage-card] > button[aria-expanded="true"]').locator('..')
  await expect(expanded).toHaveCount(1)
  // Resolve the stage by its fixed DOM index. A locator filtered by
  // aria-expanded=true stops matching as soon as the stage is collapsed,
  // making the second click impossible even though the control still exists.
  const activeIndex=await cards.evaluateAll(nodes=>nodes.findIndex(node=>node.querySelector(':scope > button[aria-expanded="true"]')))
  expect(activeIndex).toBeGreaterThanOrEqual(0)
  const active=cards.nth(activeIndex)
  await expect(active.locator('[data-cp-row]').first()).toBeVisible()
  const collapsed=page.locator('[data-stage-card] > button[aria-expanded="false"]').locator('..')
  expect(await collapsed.count()).toBeGreaterThan(0)
  for(const stage of await collapsed.all())await expect(stage.locator('[data-cp-row]')).toHaveCount(0)
  const toggle=active.locator('button[aria-expanded]').first()
  const rect=await toggle.boundingBox()
  expect(rect).not.toBeNull()
  expect(rect!.height).toBeGreaterThanOrEqual(44)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded','false')
  await expect(active.locator('[data-cp-row]')).toHaveCount(0)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded','true')
  await expect(active.locator('[data-cp-row]').first()).toBeVisible()
  expect(await page.locator('*').count()).toBeLessThan(1500)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
  mkdirSync('test-results/screens/fix-659c',{recursive:true})
  await page.screenshot({path:'test-results/screens/fix-659c/stages-'+profile+'-'+theme+'-'+width+'.png',animations:'disabled'})
 })
}
