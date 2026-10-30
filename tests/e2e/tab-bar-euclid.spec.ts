import {test,expect} from '@playwright/test'

for(const world of ['euclid','euclid-night'] as const){
 test(`FIX #319: ${world} tab dock is icon-first, accessible and non-glass`,async({page})=>{
  await page.setViewportSize({width:360,height:740})
  await page.addInitScript(theme=>{
   localStorage.setItem('lemma.ui',JSON.stringify({theme,density:'compact',effects:'rich'}))
  },world)
  await page.goto('./?demo=1#/')
  const nav=page.getByRole('navigation',{name:'Main navigation'})
  await expect(nav.getByRole('link')).toHaveCount(4)
  await expect(nav.getByRole('link',{name:'Today'})).toHaveAttribute('aria-current','page')
  await expect(nav.getByText('Today',{exact:true})).toBeVisible()
  await expect(nav.getByText('Paths',{exact:true})).toHaveCount(0)
  await expect(nav.getByText('Review',{exact:true})).toHaveCount(0)
  await expect(nav.getByText('Insights',{exact:true})).toHaveCount(0)
  await expect(nav.getByRole('link',{name:'Review'}).getByText('23')).toBeVisible()
  const style=await nav.evaluate(el=>{
   const css=getComputedStyle(el)
   return {radius:css.borderRadius,blur:css.backdropFilter,width:el.getBoundingClientRect().width}
  })
  expect(style.radius).toBe('8px')
  expect(style.blur).toBe('none')
  expect(style.width).toBeLessThanOrEqual(360)
  await page.screenshot({path:`test-results/screens/fix-319-${world}-today.png`,fullPage:true})
  await page.goto('./?demo=1#/projects')
  await expect(nav.getByRole('link',{name:'Paths'})).toHaveAttribute('aria-current','page')
  await expect(nav.getByText('Paths',{exact:true})).toBeVisible()
  await expect(nav.getByText('Today',{exact:true})).toHaveCount(0)
  await page.screenshot({path:`test-results/screens/fix-319-${world}-paths.png`,fullPage:true})
 })
}
