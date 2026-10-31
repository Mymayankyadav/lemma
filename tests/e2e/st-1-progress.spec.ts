import {test,expect,type Page} from '@playwright/test'
import {mkdirSync} from 'node:fs'

async function checkRoute(page:Page,expectStages:number){
 const route=page.locator('[data-route-mode="project"]').first()
 await expect(route).toBeVisible()
 await expect(route).toHaveAttribute('data-route-layout','folded')
 await expect(route).toHaveAttribute('data-route-stage-count',String(expectStages))
 await expect(route.locator('[data-stage-rail],[data-expanded-stations]')).toHaveCount(0)
 const marks=route.locator('[data-route-mark]')
 expect(await marks.count()).toBeGreaterThan(0)
 expect(await route.locator('[data-station-index]').count()).toBeLessThanOrEqual(9)
 const controls=route.locator('[data-route-controls] button')
 await expect(controls).toHaveCount(3)
 const dimensions=await controls.evaluateAll(nodes=>nodes.map(n=>{
  const b=n.getBoundingClientRect();return {width:b.width,height:b.height}
 }))
 expect(dimensions.every(d=>d.width>=44&&d.height>=44)).toBe(true)
 const before=await route.locator('[data-route-now]').textContent()
 await route.locator('button[aria-label*="Arrow keys select"]').focus()
 await page.keyboard.press('ArrowRight')
 expect(await route.locator('[data-route-now]').textContent()).not.toBe(before)
}
for(const profile of ['stress','extreme'])
for(const theme of ['graph','graph-night'])
for(const width of [390,360]){
 test('ST-1 '+profile+' '+theme+' '+width+'px progress scale',async({page})=>{
  test.setTimeout(240_000)
  await page.setViewportSize({width,height:width===390?844:740})
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
  const base='./?demo='+profile+'&theme='+theme+'#'
  mkdirSync('test-results/screens/st-1',{recursive:true})
  const shot=(name:string)=>'test-results/screens/st-1/'+profile+'-'+theme+'-'+width+'-'+name+'.png'
  await page.goto(base+'/p/real-analysis',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:'Project',exact:true,level:1})).toBeVisible({timeout:90_000})
  await checkRoute(page,5)
  await expect(page.locator('[data-done-summary]').first()).toContainText(/\d+ done/)
  await expect(page.locator('[data-done-summary]').first()).toBeVisible()
  await page.screenshot({path:shot('no-stages-36'),fullPage:false})

  await page.evaluate(()=>{window.location.hash='/projects'})
  await expect(page.getByRole('heading',{name:'Paths',exact:true,level:1})).toBeVisible({timeout:90_000})
  const row=page.locator('[data-project-row="real-analysis"]')
  await expect(row.locator('[data-mini-metro] [data-stage-segment]')).toHaveCount(5)
  await expect(row.locator('[data-mini-tick]')).toHaveCount(0)
  await page.screenshot({path:shot('paths'),fullPage:false})

  await page.evaluate(()=>{window.location.hash='/'})
  await expect(page.getByRole('heading',{name:'Home',exact:true,level:1})).toBeVisible({timeout:90_000})
  expect(await page.locator('[aria-label^="Goal progress for"]').count()).toBeLessThanOrEqual(3)
  await expect(page.locator('[data-compact-goals]')).toBeVisible({timeout:90_000})
  await page.screenshot({path:shot('today'),fullPage:false})

  if(profile==='extreme'){
   await page.evaluate(()=>{window.location.hash='/p/stress-project-3'})
   await expect(page.getByRole('heading',{name:'Project',exact:true,level:1})).toBeVisible({timeout:90_000})
   const timeline=page.locator('[data-route-mode="project"]')
   await expect(timeline).toHaveAttribute('data-route-stage-count','15')
   await expect(page.locator('[data-stage-chip]')).toHaveCount(15)
   const stations=timeline.locator('[data-station-index]')
   expect(await stations.count()).toBeLessThanOrEqual(9)
   await expect(timeline.locator('[data-stage-rail],[data-expanded-stations]')).toHaveCount(0)
   await page.locator('[data-stage-chip="8"]').click()
   await expect(page.locator('[data-stage-chip="8"]')).toHaveAttribute('aria-pressed','true')
   await page.screenshot({path:shot('stages-100'),fullPage:false})
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 })
}
