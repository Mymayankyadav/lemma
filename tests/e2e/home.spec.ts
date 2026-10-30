import {test,expect} from '@playwright/test'

test.beforeEach(async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
 await page.goto('./?demo=1#/')
})

test('today desk shows resume, reviews, proposals and projects with no runtime errors',async({page})=>{
 const errors:string[]=[]
 page.on('pageerror',error=>errors.push(error.message))
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
 await expect(page.getByRole('heading',{name:'Home',level:1})).toBeVisible()
 await expect(page.getByRole('region',{name:'Resume where you stopped'})).toContainText('Compactness, step 2 of 4')
 await expect(page.getByRole('link',{name:/cards due/i}).getByText('23',{exact:true})).toBeVisible()
 await expect(page.getByRole('link',{name:/6 proposals to approve/i}).getByText('6',{exact:true})).toBeVisible()
 await expect(page.getByText('to approve')).toBeVisible()
 await expect(page.getByRole('region',{name:'Resume where you stopped'})).not.toContainText('Why is a finite subcover enough to separate x from K?')
 await expect(page.getByRole('link',{name:/Real Analysis, 3 of 12 checkpoints/i})).toBeVisible()
 await expect(page.getByRole('region',{name:'Projects'}).getByRole('link',{name:/Topology/i})).toBeVisible()
 await expect(page.getByRole('region',{name:'Projects'}).getByRole('link',{name:/Linear Algebra/i})).toBeVisible()
 await expect(page.getByRole('navigation',{name:'Desk actions'}).getByRole('link')).toHaveCount(3)
 await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('link')).toHaveCount(4)
 await page.screenshot({path:'test-results/screens/home.png',fullPage:true})
 expect(errors).toEqual([])
})

test('Last chat is a 56px passive row with a single Copy action',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write'])
 const handoff=page.getByRole('region',{name:'Resume where you stopped'})
 await expect(handoff).toBeVisible()
 await expect(handoff).toContainText('Compactness, step 2 of 4')
 const box=await handoff.boundingBox()
 expect(box).not.toBeNull()
 expect(box!.height).toBeLessThanOrEqual(56)
 await expect(handoff.locator('svg')).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Resume',exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Choose chat app or copy prompt'})).toHaveCount(0)
 await handoff.getByRole('button',{name:'Copy resume prompt'}).click()
 await expect(page.getByText('Prompt copied',{exact:true})).toBeVisible()
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('Resume Real Analysis')
 for(const label of [/cards due/i,/proposals to approve/i]){
  await expect(page.getByRole('link',{name:label}).locator('svg')).toHaveCount(0)
 }
 await page.screenshot({path:'test-results/screens/home-last-chat.png',fullPage:true})
})

test('home shortcuts navigate to review, proposals and the project path',async({page})=>{
 await page.getByRole('link',{name:/23 cards due/i}).click()
 await expect(page).toHaveURL(/#\/review$/)
 await page.goto('./?demo=1#/')
 await page.getByRole('link',{name:/6 proposals to approve/i}).click()
 await expect(page).toHaveURL(/#\/proposals$/)
 await page.goto('./?demo=1#/')
 await page.getByRole('link',{name:/Real Analysis, 3 of 12 checkpoints/i}).click()
 await expect(page).toHaveURL(/#\/p\/real-analysis$/)
})

for(const theme of ['graph','graph-night'] as const){
 test(`UI-5b goal-first Today and keyboard Ascent timeline: ${theme}`,async({page})=>{
  await page.goto(`./?demo=1&theme=${theme}#/`)
  const goals=page.getByRole('region',{name:'Distance to your goals'})
  const cards=page.getByRole('region',{name:'Cards'})
  await expect(goals).toBeVisible()
  await expect(cards).toBeVisible()
  await expect(page.locator('[aria-label="Seven-day review forecast"]')).toBeVisible()
  await expect(page.locator('[aria-label="Seven-day review forecast"] .grid > div')).toHaveCount(7)
  await expect(page.locator('[aria-label="Due cards by project"]')).toBeVisible()
  const order=await page.evaluate(()=>{
   const a=document.querySelector('[aria-label="Distance to your goals"]')
   const b=document.querySelector('[aria-label="Cards"]')
   return !!(a&&b&&(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING))
  })
  expect(order).toBe(true)
  const algebra=goals.getByRole('article',{name:/Goal progress for Real Analysis/})
  await expect(algebra).toContainText(/3\/12 checkpoints/)
  const timeline=algebra.locator('[data-timeline="ascent"]')
  await expect(timeline.getByRole('button')).toHaveAttribute('aria-label',/Arrow keys to browse; Enter to open/)
  await page.screenshot({path:`test-results/screens/review/ui5b-goals-${theme}.png`,fullPage:true})
  await timeline.getByRole('button').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/p\/real-analysis\/cp\//)
 })
}
