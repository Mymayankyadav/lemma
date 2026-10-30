import {test,expect} from '@playwright/test'

test.beforeEach(async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
 await page.goto('./?demo=1#/p/real-analysis')
})

test('Graph Paper Paths groups checkpoints into named stages with current stage expanded',async({page})=>{
 const errors:string[]=[]
 page.on('pageerror',error=>errors.push(error.message))
 await expect(page.getByRole('heading',{name:'Project',level:1})).toBeVisible()
 await expect(page.getByRole('navigation',{name:'Choose a path'}).getByRole('link',{name:/Real Analysis/})).toHaveAttribute('aria-current','page')
 await expect(page.getByRole('region',{name:'Goal and distance'})).toContainText('Rudin')
 await expect(page.getByRole('region',{name:'Checkpoint progress'})).toContainText('12')
 await expect(page.getByRole('region',{name:'Project timeline'}).locator('[data-timeline="ascent"]')).toBeVisible()
 await expect(page.getByRole('article',{name:'Current checkpoint CP4'})).toBeVisible()
 const stages=page.getByRole('region',{name:'Stages'})
 const foundation=stages.getByRole('article',{name:'Foundations stage'})
 const compact=stages.getByRole('article',{name:'Compactness and continuity stage'})
 await expect(foundation).toBeVisible()
 await expect(stages.getByRole('article',{name:'Connectedness and synthesis stage'})).toBeVisible()
 const foundationToggle=foundation.getByRole('button',{name:/Foundations/})
 await expect(foundationToggle).toHaveAttribute('aria-expanded','false')
 const toggle=compact.getByRole('button',{name:/Compactness and continuity/})
 await expect(toggle).toHaveAttribute('aria-expanded','true')
 await expect(compact.getByRole('link',{name:/CP4 Compactness, in progress/})).toBeVisible()
 await foundationToggle.click()
 await expect(foundation.getByRole('link',{name:/CP1 Metric spaces, done/})).toBeVisible()
 await page.screenshot({path:'test-results/screens/project-path.png',fullPage:true})
 await toggle.click()
 await expect(toggle).toHaveAttribute('aria-expanded','false')
 await expect(compact.getByRole('link',{name:/CP4 Compactness/})).toBeHidden()
 await toggle.click()
 await expect(compact.getByRole('link',{name:/CP4 Compactness/})).toBeVisible()
 expect(errors).toEqual([])
})

test('Path chips switch projects and checkpoint rows open sheets',async({page})=>{
 const chips=page.getByRole('navigation',{name:'Choose a path'})
 await chips.getByRole('link',{name:/Linear Algebra/}).click()
 await expect(page).toHaveURL(/linear-algebra$/)
 await expect(page.getByRole('heading',{name:'Project',level:1})).toContainText('Linear Algebra')
 await chips.getByRole('link',{name:/Real Analysis/}).click()
 await expect(page).toHaveURL(/real-analysis$/)
 await page.getByRole('region',{name:'Stages'}).getByRole('link',{name:/CP4 Compactness, in progress/}).click()
 await expect(page).toHaveURL(/CP4$/)
 await expect(page.getByRole('dialog',{name:'Compactness'})).toBeVisible()
})

test('Sessions and Sources tabs preserve the selected tab in URL',async({page})=>{
 await page.getByRole('button',{name:/Sessions/}).click()
 await expect(page).toHaveURL(/tab=sessions/)
 await expect(page.getByRole('link',{name:/S7/i})).toBeVisible()
 await page.getByRole('button',{name:/Sources/}).click()
 await expect(page).toHaveURL(/tab=sources/)
 await expect(page.getByRole('region',{name:'Sources'}).getByRole('button',{name:/Add sources/})).toBeVisible()
 await page.screenshot({path:'test-results/screens/project-sources.png',fullPage:true})
})

test('checkpoint sheet shows criterion, steps, prerequisite and study CTA',async({page})=>{
 await page.goto('./?demo=1#/p/real-analysis/cp/CP4')
 const backdrop=page.locator('[data-sheet-background]')
 await expect(backdrop.locator('h1')).toHaveText('Real Analysis')
 await expect(backdrop.locator('section[aria-label="Checkpoint progress"]')).toContainText('12')
 await expect(backdrop).toHaveAttribute('inert','')
 await expect(page.getByRole('heading',{name:'Checkpoint',level:1})).toBeVisible()
 await expect(page.getByRole('dialog',{name:'Compactness'})).toBeVisible()
 await expect(page.getByRole('region',{name:'Checkpoint steps'})).toBeVisible()
 await expect(page.getByRole('button',{name:'Study this'})).toBeVisible()
 await page.screenshot({path:'test-results/screens/checkpoint-sheet.png',fullPage:true})
 await page.getByRole('button',{name:'Close',exact:true}).click()
 await expect(page).toHaveURL(/#\/p\/real-analysis$/)
})

test('a new PDF can be uploaded from project Sources',async({page})=>{
 await page.getByRole('button',{name:/Sources/}).click()
 const sources=page.getByRole('region',{name:'Sources'})
 await sources.locator('input[type=file]').setInputFiles('tests/fixtures/sample.pdf')
 await expect(page.getByText('PDF added')).toBeVisible({timeout:30000})
 await expect(sources.getByText('sample',{exact:true})).toBeVisible()
})

test('Euclid project ascent opens a checkpoint without horizontal scrolling',async({page})=>{
 await page.goto('./?demo=1&theme=graph-night#/p/real-analysis')
 const timeline=page.getByRole('region',{name:'Project timeline'}).locator('[data-timeline="ascent"]')
 await expect(timeline).toBeVisible()
 const button=timeline.getByRole('button')
 await expect(button).toHaveAttribute('aria-label',/12 checkpoints, now CP4/)
 await page.screenshot({path:'test-results/screens/review/ui5b-project-euclid-night.png',fullPage:true})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
 await button.focus()
 await page.keyboard.press('Enter')
 await expect(page).toHaveURL(/CP4$/)
})

test('Graph Paper Paths fits both worlds at compact phone widths',async({page})=>{
 for(const world of ['graph','graph-night']){
  for(const density of ['compact','comfortable']){
   await page.setViewportSize({width:360,height:740})
   await page.goto('./?demo=1&theme='+world+'&density='+density+'#/p/real-analysis')
   await expect(page.getByRole('region',{name:'Stages'})).toBeVisible()
   expect(await page.evaluate(()=>document.documentElement.scrollWidth),world+' '+density).toBeLessThanOrEqual(360)
   const row=page.getByRole('region',{name:'Stages'})
     .getByRole('article',{name:'Compactness and continuity stage'}).locator('[data-cp-row]').first()
   await expect(row).toBeVisible()
   const metrics=await row.evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth}))
   expect(metrics.scroll,world+' '+density).toBeLessThanOrEqual(Math.ceil(metrics.width)+1)
   if(density==='compact')await page.screenshot({
    path:'test-results/screens/review/ui5c-paths-'+world+'.png',fullPage:true
   })
  }
 }
})

test('v3 Sources groups PDFs and exposes audited metadata controls',async({page})=>{
 await page.goto('./?demo=1#/p/real-analysis?tab=sources')
 const sources=page.getByRole('region',{name:'Sources'})
 await expect(sources.getByRole('heading',{name:/book|notes|other/i}).first()).toBeVisible()
 const edit=sources.getByRole('button',{name:'Edit'}).first()
 await edit.click()
 await expect(sources.getByRole('textbox',{name:'Source title'})).toBeVisible()
 await expect(sources.getByRole('combobox',{name:'Source kind'})).toBeVisible()
 await expect(sources.getByRole('button',{name:'Cancel'})).toBeVisible()
 await sources.getByRole('button',{name:'Cancel'}).click()
 await expect(sources.getByRole('textbox',{name:'Source title'})).toHaveCount(0)
 await page.screenshot({path:'test-results/screens/v3-project-sources.png',fullPage:true})
})
