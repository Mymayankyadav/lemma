import {test,expect} from '@playwright/test'
import {mkdirSync} from 'node:fs'

// FIX #507: defer the expensive demo forecast, not a permanent loading
// skeleton. The real seven-day data must become available on user scroll.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const)
 test('FIX #507 deferred Today forecast stays usable without a persistent skeleton: '+profile+' '+theme+' '+width,async({page})=>{
  await page.setViewportSize({width,height:width===360?740:844})
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:'Home',level:1})).toBeVisible()
  await expect(page.getByRole('article',{name:/Goal progress for/}).first()).toBeVisible({timeout:90_000})
  const deferred=page.locator('[data-forecast-on-demand]')
  await expect(deferred).toBeAttached()
  // ST-0's all-route evidence rejects loading placeholders left behind
  // below the fold. A real, accessible reveal action is required instead.
  // At 390px the forecast may already intersect the bottom of the
  // viewport and auto-mount before this assertion. Both the accessible
  // reveal button and an already-loaded real forecast are valid; a
  // persistent pulsing skeleton is not.
  const reveal=deferred.getByRole('button',{name:'Show seven-day forecast'})
  const bars=deferred.locator('[aria-label="Seven-day review forecast"] .grid > div')
  await expect(reveal.or(bars.first()).first()).toBeVisible({timeout:90_000})
  await expect(page.locator('.animate-pulse.bg-fill-2')).toHaveCount(0)
  await deferred.scrollIntoViewIfNeeded()
  await expect(deferred.locator('[aria-label="Seven-day review forecast"] .grid > div'))
   .toHaveCount(7,{timeout:90_000})
  await expect(page.locator('[aria-label="Due cards by project"]')).toBeVisible()
  await expect(page.locator('.animate-pulse.bg-fill-2')).toHaveCount(0)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
  mkdirSync('test-results/screens/fix-507-forecast',{recursive:true})
  await page.screenshot({path:'test-results/screens/fix-507-forecast/'+profile+'-'+theme+'-'+width+'.png',fullPage:true})
 })
