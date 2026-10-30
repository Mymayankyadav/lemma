import {test,expect} from '@playwright/test'

test('suspending a card advances the polygon and resets the next card timer',async({page})=>{
 await page.clock.install({time:new Date('2026-10-30T12:00:00Z')})
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
 await page.goto('./?demo=1#/review')
 await page.getByRole('button',{name:'Start review'}).click()
 await expect(page.locator('[data-review-vertex="current"]')).toHaveCount(1)
 await expect(page.locator('[data-review-vertex="current"]')).toHaveAttribute('cx',/./)

 // Time spent reading the suspended card must not be charged to the next one.
 await page.clock.fastForward(120_000)
 await page.getByRole('button',{name:'Note for tutor'}).click()
 await page.getByRole('dialog',{name:'For your tutor'}).getByRole('button',{name:'Suspend this card'}).click()
 await expect(page.getByRole('dialog',{name:'For your tutor'})).toBeHidden()
 await expect(page.locator('[data-review-vertex="current"]')).toHaveCount(1)
 const position=await page.locator('[data-review-vertex]').evaluateAll(nodes=>nodes.findIndex(n=>n.getAttribute('data-review-vertex')==='current'))
 expect(position).toBe(1)
 await expect(page.locator('[data-review-edge="passed"]')).toHaveCount(0)
 await page.screenshot({path:'test-results/screens/review-suspend-progress.png',fullPage:true})

 await page.clock.fastForward(2_000)
 await page.getByRole('button',{name:'Sure',exact:true}).click()
 await page.getByRole('button',{name:'Grade Good'}).click()
 await expect(page.locator('[data-review-edge="passed"]')).toHaveCount(1)
 await page.getByRole('button',{name:'Close review'}).click()
 await expect(page).toHaveURL(/#\\/review\\/done$/)
 await expect(page.getByRole('region',{name:'Review statistics'}).getByText('0:02',{exact:true})).toBeVisible()
})
