import {test,expect} from '@playwright/test'

test('suspending a card advances linear progress and resets the next card timer',async({page})=>{
 // Freeze Date.now without freezing timers or Motion's requestAnimationFrame animations.
 await page.clock.setFixedTime(new Date('2026-10-30T12:00:00Z'))
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
 await page.goto('./?demo=1#/review')
 await page.getByRole('button',{name:'Start review'}).click()
 const progress=page.getByRole('progressbar',{name:'Review progress'})
 await expect(progress).toHaveAttribute('aria-valuenow','0')

 // Time spent reading the suspended card must not be charged to the next one.
 await page.clock.setFixedTime(new Date('2026-10-30T12:02:00Z'))
 await page.getByRole('button',{name:'Note for tutor'}).click()
 await page.getByRole('dialog',{name:'For your tutor'}).getByRole('button',{name:'Suspend this card'}).click()
 // With real timers, the Sheet exit animation can finish normally.
 await expect(page.getByRole('dialog',{name:'For your tutor'})).toBeHidden()
 await expect(progress).toHaveAttribute('aria-valuenow','1')
 await expect(page.getByText('2 of 23',{exact:true})).toBeVisible()
 await page.screenshot({path:'test-results/screens/review-suspend-progress.png',fullPage:true})

 await page.clock.setFixedTime(new Date('2026-10-30T12:02:02Z'))
 await page.getByRole('button',{name:'Sure',exact:true}).click()
 await page.getByRole('button',{name:'Grade Good'}).click()
 await expect(progress).toHaveAttribute('aria-valuenow','2')
 await page.getByRole('button',{name:'Close review'}).click()
 await expect(page).toHaveURL(new RegExp('#/review/done$'))
 await expect(page.getByRole('region',{name:'Review statistics'}).getByText('0:02',{exact:true})).toBeVisible()
})
