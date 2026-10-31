import {expect,test} from '@playwright/test'

// FIX #509: stage segments remain distinguishable when 100 checkpoints collapse.
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
  // Today may use the bounded summary Metro after FIX-484b; the project
  // page always keeps the interactive stage Metro and its full labels.
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/p/real-analysis')
  const metro=page.locator('[data-timeline="stage-metro"]').first()
  await expect(metro).toBeVisible({timeout:90_000})
  const stages=metro.locator('[data-stage-button]')
  const labels=await stages.locator('[data-stage-name]').allTextContents()
  expect(labels.length).toBeGreaterThanOrEqual(5)
  expect(labels).toEqual(labels.map((_,i)=>'S'+(i+1)))
  expect(new Set(labels).size).toBe(labels.length)
  const full=metro.locator('[data-stage-full-name]')
  await expect(full).toBeVisible()
  const first=await full.textContent()
  expect(first?.trim().length).toBeGreaterThan(0)
  await stages.nth(1).click()
  await expect(stages.nth(1)).toHaveAttribute('aria-pressed','true')
  await expect.poll(()=>full.textContent()).not.toBe(first)
  const targets=await stages.evaluateAll(nodes=>nodes.map(node=>({
   width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height
  })))
  expect(targets.every(r=>r.width>=44&&r.height>=44)).toBe(true)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({path:'test-results/screens/fix-509-project-'+profile+'-'+theme+'-'+width+'.png'})
 })
}
