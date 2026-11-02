import {expect,test} from '@playwright/test'

test.describe.configure({retries:0})

/** A newly installed PWA must claim its first client before an offline route switch.
 * This intentionally does not reload or pre-visit Paths while online.
 */
test('FIX #751 first-visit worker controls offline lazy route navigation',async({page,context})=>{
 test.setTimeout(90_000)
 await page.setViewportSize({width:360,height:740})
 await page.goto('/lemma/?demo=1&theme=graph#/cards',{waitUntil:'domcontentloaded'})
 await expect(page.getByRole('heading',{name:'Cards',exact:true,level:1})).toBeVisible()
 await page.evaluate(()=>navigator.serviceWorker.ready)
 await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),{timeout:20_000}).toBe(true)
 await context.setOffline(true)
 await page.evaluate(()=>{window.location.hash='/projects'})
 await expect(page.getByRole('heading',{name:'Paths',exact:true,level:1})).toBeVisible({timeout:15_000})
 await expect(page.locator('[data-project-row]').first()).toBeVisible()
 await context.setOffline(false)
})
