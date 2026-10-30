import {test,expect} from '@playwright/test'
import {readFileSync} from 'node:fs'

test.beforeEach(async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
})
test('Paths shows goal, active checkpoint, stages and Atlas without errors',async({page})=>{
 const errors:string[]=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.goto('./?demo=1#/projects')
 await expect(page.getByRole('heading',{name:'Paths',level:2})).toBeVisible()
 await expect(page.getByRole('navigation',{name:'Choose a path'}).getByRole('link',{name:'Real Analysis',exact:true})).toBeVisible()
 await expect(page.getByText('Compactness, step 2')).toBeVisible()
 await expect(page.getByRole('link',{name:/Atlas/i})).toBeVisible()
 await page.screenshot({path:'test-results/screens/projects-dashboard.png',fullPage:true})
 expect(errors).toEqual([])
})
test('v3 name-only sheet retains focus and keeps real parent inert',async({page})=>{
 await page.goto('./?demo=1#/projects/new')
 const backdrop=page.locator('[data-sheet-background]')
 await expect(backdrop.locator('h1')).toHaveText('Projects')
 await expect(backdrop).toHaveAttribute('inert','')
 const dialog=page.getByRole('dialog',{name:'New project'})
 const name=dialog.getByRole('textbox',{name:'Name'})
 await name.fill('Complex')
 await name.pressSequentially(' Analysis',{delay:15})
 await expect(name).toHaveValue('Complex Analysis')
 await expect(name).toBeFocused()
 await expect(dialog.getByText(/Your tutor fills in the subject, goal/)).toBeVisible()
 await expect(dialog.getByRole('textbox',{name:'Goal'})).toHaveCount(0)
 await expect(dialog.getByRole('radiogroup',{name:'Subject'})).toHaveCount(0)
 await page.screenshot({path:'test-results/screens/new-project-focus.png',fullPage:true})
})
test('v3 creates a project from its name alone',async({page})=>{
 await page.goto('./?demo=1#/projects/new')
 await page.getByRole('textbox',{name:'Name'}).fill('Complex Analysis')
 await page.screenshot({path:'test-results/screens/new-project.png',fullPage:true})
 await page.getByRole('button',{name:'Create project'}).click()
 await expect(page).toHaveURL(/#\/p\/complex-analysis\?tab=sources$/)
 await expect(page.getByText(/Project created/)).toBeVisible()
 await expect(page.getByRole('region',{name:'Goal and distance'})).toContainText('Your tutor fills this in')
})
test('v3 accepts multiple real PDFs in one queue and uploads sequentially',async({page})=>{
 await page.goto('./?demo=1#/projects/new')
 await page.getByRole('textbox',{name:'Name'}).fill('Topology Exercises')
 const picker=page.locator('input[type=file]')
 await expect(picker).toHaveAttribute('multiple','')
 await picker.setInputFiles([
  {name:'notes.pdf',mimeType:'application/pdf',buffer:readFileSync('tests/fixtures/sample.pdf')},
  {name:'problem-set.pdf',mimeType:'application/pdf',buffer:readFileSync('tests/fixtures/sample.pdf')}
 ])
 await expect(page.getByRole('list',{name:'Upload queue'}).locator('li')).toHaveCount(2)
 await expect(page.getByText('notes.pdf')).toBeVisible()
 await page.getByRole('button',{name:'Create project'}).click()
 // Same-content duplicates are rejected even when filenames differ.
 await expect(page.getByRole('alert').filter({hasText:'Already added'})).toBeVisible({timeout:30000})
 await expect(page.getByRole('button',{name:'Retry remaining uploads'})).toBeVisible()
})
test('v3 accepts Android document-provider PDF MIME types',async({page})=>{
 await page.goto('./?demo=1#/projects/new')
 await page.getByRole('textbox',{name:'Name'}).fill('Mobile PDF')
 await page.locator('input[type=file]').setInputFiles({
  name:'mobile.pdf',mimeType:'application/octet-stream',
  buffer:readFileSync('tests/fixtures/sample.pdf')
 })
 await expect(page.getByText('mobile.pdf')).toBeVisible()
 await expect(page.getByRole('alert')).toHaveCount(0)
 await page.screenshot({path:'test-results/screens/new-project-mobile-pdf.png',fullPage:true})
})
test('v3 rejects invalid files without discarding valid queued PDFs',async({page})=>{
 await page.goto('./?demo=1#/projects/new')
 await page.getByRole('textbox',{name:'Name'}).fill('Replace PDF')
 const picker=page.locator('input[type=file]')
 await picker.setInputFiles('tests/fixtures/sample.pdf')
 await picker.setInputFiles({name:'not-a-pdf.txt',mimeType:'text/plain',buffer:Buffer.from('not a PDF')})
 await expect(page.getByRole('alert')).toContainText('PDFs must be nonempty')
 await expect(page.getByText('sample.pdf')).toBeVisible()
 await expect(page.getByRole('button',{name:'Create project'})).toBeEnabled()
 await page.screenshot({path:'test-results/screens/new-project-replacement.png',fullPage:true})
})
test('v3 removes and reselects the same native PDF',async({page})=>{
 await page.goto('./?demo=1#/projects/new')
 await page.getByRole('textbox',{name:'Name'}).fill('Reselected PDF')
 const picker=page.locator('input[type=file]')
 await picker.setInputFiles('tests/fixtures/sample.pdf')
 await expect(picker).toHaveValue('')
 await page.getByRole('button',{name:'Remove sample.pdf'}).click()
 await expect(page.getByText('sample.pdf')).toHaveCount(0)
 await picker.setInputFiles('tests/fixtures/sample.pdf')
 await expect(page.getByText('sample.pdf')).toBeVisible()
 await page.screenshot({path:'test-results/screens/new-project-reselected-pdf.png',fullPage:true})
})
test('v3 rejects non-PDF files without adding them to the queue',async({page})=>{
 await page.goto('./?demo=1#/projects/new')
 await page.getByRole('textbox',{name:'Name'}).fill('Rejected Upload')
 await page.locator('input[type=file]').setInputFiles({name:'not-a-pdf.txt',mimeType:'text/plain',buffer:Buffer.from('a text document')})
 await expect(page.getByRole('alert')).toContainText('PDFs must be nonempty')
 await expect(page.getByRole('list',{name:'Upload queue'}).locator('li')).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Create project'})).toBeEnabled()
})

test('Paths tab switches projects and expands stage checkpoints',async({page})=>{
 await page.goto('./?demo=1&theme=graph#/projects')
 const chips=page.getByRole('navigation',{name:'Choose a path'})
 const stages=page.getByRole('region',{name:'Stages'})
 await expect(page.getByRole('region',{name:'Goal and distance'})).toContainText('Real Analysis')
 await expect(stages.getByRole('link',{name:/CP4 Compactness, in progress/})).toBeVisible()
 const stage=stages.getByRole('article',{name:/stage$/}).first()
 await stage.getByRole('button',{name:/Unassigned checkpoints/}).click()
 await expect(stage.getByRole('link',{name:/CP4 Compactness/})).toBeHidden()
 await stage.getByRole('button',{name:/Unassigned checkpoints/}).click()
 await expect(stage.getByRole('link',{name:/CP4 Compactness/})).toBeVisible()
 await chips.getByRole('link',{name:'Linear Algebra',exact:true}).click()
 await expect(page).toHaveURL(/project=linear-algebra/)
 await expect(page.getByRole('region',{name:'Goal and distance'})).toContainText('Linear Algebra')
 await expect(chips.getByRole('link',{name:'Linear Algebra',exact:true})).toHaveAttribute('aria-current','page')
})

test('Paths matches compact Euclid and Euclid-night without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:360,height:740})
 for(const theme of ['graph','graph-night']){
  await page.goto('./?demo=1&theme='+theme+'#/projects')
  await expect(page.getByRole('region',{name:'Stages'})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth),theme).toBeLessThanOrEqual(360)
  await page.screenshot({path:'test-results/screens/review/ui5c-paths-tab-'+theme+'.png',fullPage:true})
 }
})
