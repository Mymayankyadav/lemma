import {expect,test} from '@playwright/test'
import {mkdirSync} from 'node:fs'

// FIX-507c: Paths' Atlas link is the intentional warmup boundary.
// Direct navigation must remain functional under the real 2,500-idea
// extreme fixture; an eager Atlas fetch on Paths mount is not acceptable.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const)
 test('FIX-507c Paths to Atlas '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(90_000)
  await page.setViewportSize({width,height:width===360?740:844})
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/projects',{waitUntil:'domcontentloaded'})
  const atlasLink=page.getByRole('link',{name:'Open Atlas'})
  await expect(atlasLink).toBeVisible({timeout:30_000})
  const hit=await atlasLink.boundingBox()
  expect(hit?.width??0).toBeGreaterThanOrEqual(44)
  expect(hit?.height??0).toBeGreaterThanOrEqual(44)
  // Focus prefetches for keyboard users; click follows the same route.
  await atlasLink.focus()
  await atlasLink.click()
  await expect(page.getByRole('tree',{name:'Ideas and their links'})).toBeVisible({timeout:30_000})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
  mkdirSync('test-results/screens/fix-507c',{recursive:true})
  await page.screenshot({path:'test-results/screens/fix-507c/'+profile+'-'+theme+'-'+width+'.png'})
 })
