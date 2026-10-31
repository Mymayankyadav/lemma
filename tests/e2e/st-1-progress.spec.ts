import {test,expect,type Page} from '@playwright/test'
import {mkdirSync} from 'node:fs'

async function checkStageMetro(page:Page,expectStages:number){
 const timeline=page.locator('[data-timeline="stage-metro"]').first()
 await expect(timeline).toBeVisible()
 await expect(timeline).toHaveAttribute('data-stage-count',String(expectStages))
 await expect(timeline.locator('[data-timeline-header]')).toContainText(/CP\d+ of 36 · Stage \d+ of 5/)
 const stations=timeline.locator('[data-station-index]')
 expect(await stations.count()).toBeLessThanOrEqual(9)
 expect(await stations.count()).toBeGreaterThan(0)
 const dimensions=await stations.evaluateAll(nodes=>nodes.map(n=>{
  const b=n.getBoundingClientRect();return {x:b.x,width:b.width,height:b.height}
 }))
 expect(dimensions.every(d=>d.width>=44&&d.height>=44)).toBe(true)
 for(let i=1;i<dimensions.length;i++)expect(dimensions[i].x-dimensions[i-1].x).toBeGreaterThanOrEqual(44)
 const stageButtons=timeline.locator('[data-stage-button]')
 expect(await stageButtons.count()).toBe(expectStages)
 expect(await stageButtons.evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44))).toBe(true)
 const before=await timeline.locator('[data-timeline-header]').textContent()
 await stageButtons.first().focus()
 await stageButtons.first().press('ArrowRight')
 expect(await timeline.locator('[data-timeline-header]').textContent()).not.toBe(before)
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
  await expect(page.getByRole('heading',{name:'Project',exact:true,level:1})).toBeVisible()
  await checkStageMetro(page,5)
  await expect(page.locator('[data-done-summary]').first()).toContainText(/\d+ done/)
  await expect(page.locator('[data-done-summary]').first()).toBeVisible()
  await page.screenshot({path:shot('no-stages-36'),fullPage:false})

  await page.evaluate(()=>{window.location.hash='/projects'})
  await expect(page.getByRole('heading',{name:'Paths',exact:true,level:1})).toBeVisible()
  const row=page.locator('[data-project-row="real-analysis"]')
  await expect(row.locator('[data-mini-metro] [data-stage-segment]')).toHaveCount(5)
  await expect(row.locator('[data-mini-tick]')).toHaveCount(0)
  await page.screenshot({path:shot('paths'),fullPage:false})

  await page.evaluate(()=>{window.location.hash='/'})
  await expect(page.getByRole('heading',{name:'Home',exact:true,level:1})).toBeVisible()
  expect(await page.locator('[aria-label^="Goal progress for"]').count()).toBeLessThanOrEqual(3)
  await expect(page.locator('[data-compact-goals]')).toBeVisible()
  await page.screenshot({path:shot('today'),fullPage:false})

  if(profile==='extreme'){
   await page.evaluate(()=>{window.location.hash='/p/stress-project-3'})
   await expect(page.getByRole('heading',{name:'Project',exact:true,level:1})).toBeVisible()
   const timeline=page.locator('[data-timeline="stage-metro"]')
   await expect(timeline).toHaveAttribute('data-stage-count','15')
   await expect(page.locator('[data-stage-chip]')).toHaveCount(15)
   const stations=timeline.locator('[data-station-index]')
   expect(await stations.count()).toBeLessThanOrEqual(9)
   await page.locator('[data-stage-chip="8"]').click()
   await expect(page.locator('[data-stage-chip="8"]')).toHaveAttribute('aria-pressed','true')
   await page.screenshot({path:shot('stages-100'),fullPage:false})
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 })
}
