import {expect,test} from '@playwright/test'

// FIX #509 / LOOK-3c: folded Route retains distinguishable stage ranges,
// a readable current-stage label and station-by-station keyboard access.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [390,360] as const){
 test('FIX #509 visible stage identity '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(180_000)
  await page.setViewportSize({width,height:width===390?844:740})
  await page.emulateMedia({colorScheme:theme==='graph-night'?'dark':'light'})
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}))
  await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}))
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/')
  await expect(page.getByRole('heading',{name:'Home'})).toBeVisible({timeout:90_000})
  await page.screenshot({path:'test-results/screens/fix-509-today-'+profile+'-'+theme+'-'+width+'.png'})
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/p/real-analysis')
  const route=page.locator('[data-route-mode="project"]').first()
  await expect(route).toBeVisible({timeout:90_000})
  await expect(route).toHaveAttribute('data-route-layout','folded')
  await expect(route).toHaveAttribute('data-route-stage-count','5')
  await expect(route.locator('[data-stage-rail],[data-expanded-stations]')).toHaveCount(0)
  const ranges=await route.locator('[data-stage-range]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-stage-range')))
  expect(ranges.length).toBeGreaterThan(0)
  expect(new Set(ranges).size).toBe(ranges.length)
  const label=route.locator('[data-route-folded-stage-label]')
  await expect(label).toBeVisible()
  expect((await label.textContent())?.trim().length).toBeGreaterThan(0)
  const now=route.locator('[data-route-now]')
  const first=await now.textContent()
  await route.getByRole('button',{name:'Next checkpoint'}).click()
  expect(await now.textContent()).not.toBe(first)
  const targets=await route.locator('[data-route-controls] button').evaluateAll(nodes=>nodes.map(node=>({
   width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height
  })))
  expect(targets.every(r=>r.width>=44&&r.height>=44)).toBe(true)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(0)
  await page.screenshot({path:'test-results/screens/fix-509-project-'+profile+'-'+theme+'-'+width+'.png'})
 })
}
