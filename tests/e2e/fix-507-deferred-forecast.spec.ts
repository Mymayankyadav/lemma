import {test,expect} from '@playwright/test'

// FIX #507: virtualizing a below-the-fold stress forecast must never make
// the real seven-day data inaccessible. It loads on actual user scroll while
// the ordinary demo retains its existing eager forecast acceptance.
test('stress Today loads its real seven-day forecast when Cards enters view',async({page})=>{
 await page.setViewportSize({width:390,height:740})
 await page.goto('/lemma/?demo=stress&theme=graph#/',{waitUntil:'domcontentloaded'})
 await expect(page.getByRole('heading',{name:'Home',level:1})).toBeVisible()
 const deferred=page.locator('[data-forecast-on-demand]')
 await expect(deferred).toBeAttached()
 await expect(deferred.getByRole('status',{name:'Seven-day review forecast'})).toHaveCount(1)
 await deferred.scrollIntoViewIfNeeded()
 await expect(deferred.locator('[aria-label="Seven-day review forecast"] .grid > div')).toHaveCount(7,{timeout:30_000})
 await expect(page.locator('[aria-label="Due cards by project"]')).toBeVisible()
})
