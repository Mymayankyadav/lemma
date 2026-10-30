import {test,expect} from '@playwright/test'

test.beforeEach(async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
 await page.goto('./?demo=1#/p/real-analysis')
})

test('project timeline displays prerequisite states, current step and progress',async({page})=>{
 const errors:string[]=[]
 page.on('pageerror',error=>errors.push(error.message))
 await expect(page.getByRole('heading',{name:'Project',level:1})).toBeVisible()
 await expect(page.getByRole('region',{name:'Checkpoint progress'})).toContainText('12')
 await expect(page.getByRole('article',{name:'Current checkpoint CP4'})).toBeVisible()
 await expect(page.getByText('Metric spaces',{exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:/\d+ more/})).toBeVisible()
 await page.screenshot({path:'test-results/screens/project-path.png',fullPage:true})
 await page.getByRole('button',{name:/\d+ more/}).click()
 await expect(page.getByText('Capstone proofs',{exact:true})).toBeVisible()
 expect(errors).toEqual([])
})

test('Sessions and Sources tabs preserve the selected tab in URL',async({page})=>{
 await page.getByRole('button',{name:/Sessions/}).click()
 await expect(page).toHaveURL(/tab=sessions/)
 await expect(page.getByRole('link',{name:/S7/i})).toBeVisible()
 await page.getByRole('button',{name:/Sources/}).click()
 await expect(page).toHaveURL(/tab=sources/)
 await expect(page.getByRole('region',{name:'Sources'}).getByRole('button',{name:'Add a PDF'})).toBeVisible()
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
 await expect(sources.getByText('sample',{exact:false})).toBeVisible()
})
