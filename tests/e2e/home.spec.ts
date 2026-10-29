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
 await expect(page.getByRole('heading',{name:'Compactness'})).toBeVisible()
 await expect(page.getByRole('link',{name:/cards due/i}).getByText('23',{exact:true})).toBeVisible()
 await expect(page.getByText('6',{exact:true})).toBeVisible()
 await expect(page.getByText('to approve')).toBeVisible()
 await expect(page.getByText('Why is a finite subcover enough to separate x from K?')).toBeVisible()
 await expect(page.getByRole('link',{name:/Real Analysis, 3 of 12 checkpoints/i})).toBeVisible()
 await expect(page.getByRole('link',{name:/Topology/i})).toBeVisible()
 await expect(page.getByRole('link',{name:/Linear Algebra/i})).toBeVisible()
 await expect(page.getByRole('navigation',{name:'Desk actions'}).getByRole('link')).toHaveCount(3)
 await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('link')).toHaveCount(4)
 await page.screenshot({path:'test-results/screens/home.png',fullPage:true})
 expect(errors).toEqual([])
})

test('Resume copies the exact prompt and offers chat selection',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write'])
 await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible()
 // Open the copy-only menu item to avoid launching an external chat during CI.
 await page.getByRole('button',{name:'Choose chat app or copy prompt'}).click()
 await expect(page.getByRole('menuitem',{name:'Copy prompt'})).toBeVisible()
 await page.getByRole('menuitem',{name:'Copy prompt'}).click()
 await expect(page.getByText('Prompt copied',{exact:true})).toBeVisible()
 const copied=await page.evaluate(()=>navigator.clipboard.readText())
 expect(copied).toBe('Resume Real Analysis')
 await page.getByRole('button',{name:'Choose chat app or copy prompt'}).click()
 await expect(page.getByRole('menuitem',{name:'ChatGPT'})).toBeVisible()
 await page.screenshot({path:'test-results/screens/home-resume-menu.png',fullPage:true})
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
