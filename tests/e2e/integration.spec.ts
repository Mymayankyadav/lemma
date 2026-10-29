import {test,expect} from '@playwright/test'

test.beforeEach(async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
})
test('Atlas occupies the mobile viewport and deep-link review filters by concept',async({page})=>{
 await page.goto('./?demo=1#/atlas?focus=compactness')
 const map=page.locator('main[aria-label="Atlas"]')
 await expect(map).toBeVisible()
 await expect(page.getByRole('heading',{name:'Compactness'})).toBeVisible()
 const box=await map.boundingBox()
 expect(box).not.toBeNull()
 expect(box!.x).toBeLessThanOrEqual(1)
 expect(box!.width).toBeGreaterThanOrEqual(389)
 await page.getByRole('link',{name:/Review \d+/}).click()
 await expect(page).toHaveURL(/#\/review\/run\?concept=compactness$/)
 await expect(page.getByRole('heading',{name:'Card review',level:1})).toBeVisible()
 await page.screenshot({path:'test-results/screens/integration-concept-review.png',fullPage:true})
})
test('global offline banner explicitly marks unconfirmed writes and clears on reconnect',async({page,context})=>{
 await page.goto('./?demo=1#/')
 await expect(page.getByRole('heading',{name:'Home',level:1})).toBeVisible()
 await context.setOffline(true)
 await expect(page.getByRole('status').filter({hasText:/You're offline. Answers and approvals/})).toBeVisible()
 await page.screenshot({path:'test-results/screens/integration-offline.png',fullPage:true})
 await context.setOffline(false)
 await expect(page.getByRole('status').filter({hasText:/You're offline. Answers and approvals/})).toHaveCount(0)
})
