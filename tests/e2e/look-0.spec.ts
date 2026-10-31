import {test,expect} from '@playwright/test'

for(const theme of ['graph','graph-night'] as const)
for(const profile of ['1','stress','extreme'] as const)
for(const width of [360,390] as const){
 test(`LOOK-0 approved colours: ${theme}, ${profile}, ${width}px`,async({page})=>{
  if(profile==='extreme')test.setTimeout(90_000)
  await page.setViewportSize({width,height:844})
  await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/`,profile==='extreme'?{waitUntil:'domcontentloaded',timeout:90_000}:undefined)
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme)
  await expect(page.locator('#main-content')).not.toBeEmpty()
  const roles=await page.locator('html').evaluate(el=>{
   const s=getComputedStyle(el)
   return Object.fromEntries(['--accent','--late','--danger','--early','--link','--ink-2','--paper'].map(key=>[key,s.getPropertyValue(key).trim()]))
  })
  expect(roles['--accent'].toUpperCase()).toBe(theme==='graph'?'#C8372D':'#FF7B6B')
  expect(roles['--late'].toUpperCase()).toBe(theme==='graph'?'#9A6A00':'#F2B05E')
  expect(roles['--danger'].toUpperCase()).toBe(theme==='graph'?'#8E1F6B':'#E35DB0')
  expect(new Set([roles['--accent'],roles['--late'],roles['--danger']]).size).toBe(3)
  await page.evaluate(()=>document.fonts.ready)
  await page.screenshot({path:`test-results/screens/look-0/${theme}-${profile}-${width}.png`,fullPage:true})
 })
}
