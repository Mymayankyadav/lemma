import {test,expect} from '@playwright/test';

// NOTIF-7: real hash-route entry points from Web Push, using the same demo
// queue and settings as the ordinary Review Start button.
test.beforeEach(async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
})

test('Review 5 deep link starts exactly five cards and consumes the query',async({page})=>{
 await page.goto('/lemma/?demo=1#/review?start=5&n=42')
 await expect(page).toHaveURL(/#\/review\/run$/)
 await expect(page.getByRole('progressbar',{name:'Review progress'})).toHaveAttribute('aria-valuemax','5')
 await expect(page.getByText('1 of 5',{exact:true})).toBeVisible()
 await page.screenshot({path:'test-results/screens/notif-review-5.png',fullPage:true})
})

for(const [raw,expected] of [['0','1'],['99','23'],['oops','1']] as const){
 test(`invalid notification start=${raw} is clamped to a safe 1–50 round`,async({page})=>{
  await page.goto('/lemma/?demo=1#/review?start='+raw)
  await expect(page).toHaveURL(/#\/review\/run$/)
  await expect(page.getByRole('progressbar',{name:'Review progress'})).toHaveAttribute('aria-valuemax',expected)
 })
}

test('Insights deep link selects seven days, ignoring notification id',async({page})=>{
 await page.goto('/lemma/?demo=1#/insights?days=7&n=42')
 await expect(page.getByRole('group',{name:'Time range'}).getByRole('button',{name:'7 days'})).toHaveAttribute('aria-pressed','true')
 await expect(page.getByRole('heading',{name:'Reviews by day'})).toBeVisible()
 await page.screenshot({path:'test-results/screens/notif-insights-7.png',fullPage:true})
})

test('unsupported Insights days retain the 30-day default',async({page})=>{
 await page.goto('/lemma/?demo=1#/insights?days=999')
 await expect(page.getByRole('group',{name:'Time range'}).getByRole('button',{name:'30 days'})).toHaveAttribute('aria-pressed','true')
})
