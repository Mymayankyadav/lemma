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

// Owner-approved v4: each review grade is distinct and none is prefilled red.
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`LOOK-0 review grade roles: ${theme}, ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844})
  await page.goto(`/lemma/?demo=1&theme=${theme}#/review`)
  await page.getByRole('button',{name:'Start review'}).click()
  await page.getByRole('button',{name:'Sure',exact:true}).click()
  const actual=await page.getByRole('region',{name:'Grade answer'}).evaluate(section=>{
   const roles=['--danger','--late','--early','--link']
   const probe=document.createElement('span')
   probe.style.display='none'
   document.body.appendChild(probe)
   const colors=roles.map(role=>{
    probe.style.color=`var(${role})`
    return getComputedStyle(probe).color
   })
   probe.style.backgroundColor='var(--accent)'
   const accent=getComputedStyle(probe).backgroundColor
   probe.remove()
   return roles.map((role,index)=>{
    const button=section.querySelectorAll('button')[index]
    const label=button.querySelector('span')!
    const dot=label.querySelector('span')!
    return {role,expected:colors[index],accent,
     label:getComputedStyle(label).color,dot:getComputedStyle(dot).backgroundColor,
     button:getComputedStyle(button).backgroundColor,
     width:button.getBoundingClientRect().width,height:button.getBoundingClientRect().height}
   })
  })
  expect(new Set(actual.map(a=>a.expected)).size).toBe(4)
  expect(new Set(actual.map(a=>a.dot)).size).toBe(4)
  expect(new Set(actual.map(a=>a.button)).size).toBe(1)
  for(const grade of actual){
   expect(grade.label).toBe(grade.expected)
   expect(grade.dot).toBe(grade.expected)
   expect(grade.width).toBeGreaterThanOrEqual(44)
   expect(grade.height).toBeGreaterThanOrEqual(44)
   expect(grade.button).not.toBe(grade.accent)
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(0)
  await page.screenshot({path:`test-results/screens/look-0/review-grades-${theme}-${width}.png`,fullPage:true})
 })
}
