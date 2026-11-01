import {expect,test} from '@playwright/test'
import {mkdirSync} from 'node:fs'

// stress.md §1.7: fixed-height Atlas rows can scroll their complete labels,
// but the clipped edge must be visibly faded rather than abruptly cut off.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('LOOK-4b Atlas long-title edge fade '+profile+' '+theme+' '+width,async({page})=>{
  await page.setViewportSize({width,height:740})
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
  await page.goto('./?demo='+profile+'&theme='+theme+'#/atlas')
  const tree=page.getByRole('tree',{name:'Ideas and their links'})
  await expect(tree).toBeVisible()
  const row=tree.locator('[data-level="cluster"]').first()
  await expect(row).toBeVisible()
  const name=row.locator('[data-atlas-title-scroll]')
  await expect(name).toBeVisible()
  // Deterministic overflow even if a future fixture changes its Field names.
  await name.evaluate(el=>{el.textContent='Open sets and topology: '.repeat(24)})
  const before=await name.evaluate(el=>({
   scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,
   mask:getComputedStyle(el).maskImage,
   rightPadding:parseFloat(getComputedStyle(el).paddingRight),
  }))
  expect(before.scrollWidth).toBeGreaterThan(before.clientWidth+30)
  expect(before.mask).toContain('linear-gradient')
  expect(before.rightPadding).toBeGreaterThanOrEqual(16)
  await name.evaluate(el=>{el.scrollLeft=el.scrollWidth})
  expect(await name.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0)
  expect((await row.boundingBox())?.height).toBe(56)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
  mkdirSync('test-results/screens',{recursive:true})
  await page.screenshot({path:'test-results/screens/look-4b-fade-'+profile+'-'+theme+'-'+width+'.png'})
 })
}
