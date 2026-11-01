import {test,expect} from '@playwright/test'

// FIX #648: S/X project filters change form above eight projects rather than
// mounting 15–60 rich-title chips before the first Cards page is interactive.
// Preserve the first 12 rich chips required by FIX #523, including KaTeX.
// The existing Project select must retain all options, touch size and state.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX #648 bounded Cards project filters '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(120_000)
  await page.setViewportSize({width,height:width===360?740:844})
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/cards',{waitUntil:'domcontentloaded',timeout:90_000})
  await expect(page.getByRole('heading',{name:'Cards',exact:true})).toBeVisible({timeout:60_000})
  const filters=page.getByRole('group',{name:'Card filters'})
  const selector=page.getByRole('combobox',{name:'Filter project'})
  await expect(selector).toBeVisible()
  const options=selector.locator('option')
  await expect.poll(()=>options.count(),{timeout:60_000}).toBeGreaterThan(8)
  await expect(filters.locator('[data-project-slug]')).toHaveCount(12)
  const mathChip=filters.locator('[data-project-slug="stress-project-11"]')
  await expect(mathChip).toContainText('Mathematics project 12')
  await expect(mathChip.locator('.text-base')).toBeVisible()
  const box=await selector.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  const slug=await options.nth(1).getAttribute('value')
  expect(slug).toBeTruthy()
  await selector.selectOption(slug!)
  await expect(selector).toHaveValue(slug!)
  await expect(page.locator('[data-card-row]').first()).toBeVisible({timeout:60_000})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
  expect(await page.locator('[data-card-row]').count()).toBeLessThanOrEqual(24)
  await page.screenshot({path:'test-results/screens/fix-648/cards-'+profile+'-'+theme+'-'+width+'.png'})
 })
}
