import {test,expect,type Page} from '@playwright/test'
import {mkdirSync} from 'node:fs'

mkdirSync('test-results/screens',{recursive:true})

test.beforeEach(async({page})=>{
 await page.setViewportSize({width:390,height:844})
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
})

async function capturePhone(page:Page,world:string,screen:string){
 await expect(page.locator('html')).toHaveAttribute('data-theme',world)
 const width=await page.evaluate(()=>({
  document:document.documentElement.scrollWidth,
  viewport:document.documentElement.clientWidth,
 }))
 expect(width.document,screen+' overflows: '+JSON.stringify(width)).toBeLessThanOrEqual(width.viewport)
 await page.screenshot({path:`test-results/screens/qa2-${world}-${screen}.png`,fullPage:true})
}

for(const world of ['graph','graph-night'] as const){
 test('QA-2 v3 integrated phone journey — '+world,async({page})=>{
  const errors:string[]=[]
  page.on('pageerror',error=>errors.push(error.message))
  const base=`./?demo=1&theme=${world}#`

  await page.goto(base+'/')
  await expect(page.getByRole('heading',{name:'Home',level:1})).toBeVisible()
  await expect(page.getByRole('region',{name:'Distance to your goals'}).locator('[data-route]').first()).toBeVisible()
  await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('link')).toHaveCount(4)
  await capturePhone(page,world,'today')

  await page.goto(base+'/projects')
  await expect(page.getByRole('heading',{name:'Paths',level:1})).toBeVisible()
  const realAnalysis=page.locator('[data-project-row="real-analysis"]')
  await expect(realAnalysis.locator('[data-mini-metro]')).toBeVisible()
  await page.getByRole('searchbox',{name:'Search paths'}).fill('Linear')
  await expect(page.locator('[data-project-row="linear-algebra"]')).toBeVisible()
  await expect(realAnalysis).toHaveCount(0)
  await page.getByRole('button',{name:'Clear search'}).click()
  await capturePhone(page,world,'paths')

  await page.goto(base+'/p/real-analysis')
  const metro=page.getByRole('region',{name:'Project timeline'}).locator('[data-route-mode="project"]')
  await expect(metro.locator('[data-station-state]')).toHaveCount(13)
  await expect(metro.locator('[data-stage-rail],[data-expanded-stations]')).toHaveCount(0)
  await expect(page.getByLabel('Schedule legend')).toContainText('Late')
  await capturePhone(page,world,'project')

  await page.goto(base+'/atlas')
  await expect(page.getByRole('tree',{name:'Ideas and their links'})).toBeVisible()
  await expect(page.locator('[data-level="cluster"]')).toHaveCount(3)
  await expect(page.locator('[data-atlas-details]')).toHaveCount(0)
  const areas=page.getByRole('group',{name:'Fold to depth'}).getByRole('button',{name:'Areas',exact:true})
  await areas.click()
  await expect(areas).toHaveAttribute('aria-pressed','true')
  await capturePhone(page,world,'atlas')

  await page.goto(base+'/projects/new')
  const dialog=page.getByRole('dialog',{name:'New project'})
  await expect(dialog.getByRole('textbox',{name:'Goal'})).toHaveCount(0)
  await dialog.getByRole('textbox',{name:'Name'}).fill('QA Two World Project')
  await capturePhone(page,world,'new-project')
  await dialog.getByRole('button',{name:'Create project'}).click()
  await expect(page).toHaveURL(/#\/p\/qa-two-world-project\?tab=sources$/)
  await expect(page.getByRole('region',{name:'Goal and distance'})).toContainText('Your tutor fills this in')
  await capturePhone(page,world,'draft-project')

  await page.goto(base+'/review')
  await expect(page.getByRole('region',{name:'Review summary'})).toBeVisible()
  await capturePhone(page,world,'review')
  await page.goto(base+'/insights')
  await expect(page.getByRole('heading',{name:'Insights',level:1})).toBeVisible()
  await capturePhone(page,world,'insights')
  expect(errors).toEqual([])
 })
}
