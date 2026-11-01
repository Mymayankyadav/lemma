import {test,expect} from '@playwright/test'

// FIX #648: sixty project filters must switch form rather than mounting sixty
// rich-title chips before the first 30k-card page becomes interactive.
test('Cards X switches 60 project chips to the existing accessible project selector',async({page})=>{
 await page.setViewportSize({width:390,height:844})
 await page.goto('/lemma/?demo=extreme&theme=graph#/cards',{waitUntil:'domcontentloaded',timeout:90_000})
 await expect(page.getByRole('heading',{name:'Cards',exact:true})).toBeVisible({timeout:60_000})
 const filters=page.getByRole('group',{name:'Card filters'})
 await expect(filters.locator('[data-project-slug]')).toHaveCount(0)
 const selector=page.getByRole('combobox',{name:'Filter project'})
 await expect(selector).toBeVisible()
 const options=selector.locator('option')
 expect(await options.count()).toBeGreaterThan(40)
 const slug=await options.nth(1).getAttribute('value')
 expect(slug).toBeTruthy()
 await selector.selectOption(slug!)
 await expect(selector).toHaveValue(slug!)
 await expect(page.locator('[data-card-row]').first()).toBeVisible({timeout:60_000})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
})
