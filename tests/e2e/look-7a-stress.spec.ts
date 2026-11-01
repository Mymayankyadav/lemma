import {test,expect} from '@playwright/test'
import {mkdirSync} from 'node:fs'

/** LOOK-7a: linear Review progress must keep its job for 150/400-card rounds.
 * Unlike the old polygon, it must never create hundreds of tiny marks.
 */
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const [width,height] of [[360,740],[390,844]] as const){
 test(`LOOK-7a linear Review remains usable: ${profile} ${theme} ${width}px`,async({page})=>{
  test.setTimeout(180_000)
  await page.setViewportSize({width,height})
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
  await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/review`,{waitUntil:'domcontentloaded',timeout:90_000})
  const start=page.getByRole('button',{name:'Start review'})
  await expect(start).toBeEnabled({timeout:90_000})
  if(profile==='extreme'){
   // The ordinary daily limit is 200 even when 4,000 cards are due. Activate
   // the real catch-up control so this regression actually exercises a
   // 400+-card round, rather than falsely claiming X coverage at 200 cards.
   await page.getByRole('button',{name:/Catch-up plan/}).click()
   await expect(start).toContainText(/Start [4-9]\d\d/,{timeout:90_000})
  }
  await start.click()
  const progress=page.getByRole('progressbar',{name:'Review progress'})
  await expect(progress).toBeVisible({timeout:90_000})
  const total=Number(await progress.getAttribute('aria-valuemax'))
  expect(total,'actual S/X review round, not merely a 200-card default cap')
   .toBeGreaterThanOrEqual(profile==='extreme'?400:150)
  await expect(progress).toHaveAttribute('aria-valuenow','0')
  await expect(page.locator('[data-review-vertex], [data-review-edge]')).toHaveCount(0)
  const geometry=await page.evaluate(()=>{
   const bar=document.querySelector('[role="progressbar"]')!
   const r=bar.getBoundingClientRect()
   const controls=[...document.querySelectorAll<HTMLElement>('button')].filter(el=>
    ['Close review','Sure','Unsure','Guess'].includes(el.getAttribute('aria-label')||el.textContent?.trim()||''))
    .map(el=>({name:el.getAttribute('aria-label')||el.textContent?.trim(),rect:el.getBoundingClientRect()}))
   return {barWidth:r.width,barHeight:r.height,viewport:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,
    controls:controls.map(({name,rect})=>({name,width:rect.width,height:rect.height}))}
  })
  expect(geometry.barWidth).toBeGreaterThan(40)
  expect(geometry.barWidth).toBeLessThanOrEqual(width)
  expect(geometry.overflow,'Review must not scroll sideways').toBeLessThanOrEqual(1)
  for(const control of geometry.controls){
   expect(control.width,control.name+' tap width').toBeGreaterThanOrEqual(43.5)
   expect(control.height,control.name+' tap height').toBeGreaterThanOrEqual(43.5)
  }
  mkdirSync('test-results/screens/look-7a',{recursive:true})
  const prefix=`test-results/screens/look-7a/${profile}-${theme}-${width}`
  await page.screenshot({path:prefix+'-front.png'})
  await page.getByRole('button',{name:'Sure',exact:true}).click()
  await page.getByRole('button',{name:'Grade Again'}).click()
  await expect(progress,'Again requeues without falsely increasing settled progress').toHaveAttribute('aria-valuenow','0')
  for(let settled=1;settled<=2;settled++){
   await page.getByRole('button',{name:'Sure',exact:true}).click()
   await page.getByRole('button',{name:'Grade Good'}).click()
   await expect(progress).toHaveAttribute('aria-valuenow',String(settled))
  }
  await page.screenshot({path:prefix+'-progress.png'})
  await page.getByRole('button',{name:'Close review'}).click()
  await expect(page.getByRole('heading',{name:'Review complete',level:1})).toBeVisible()
  await expect(page.getByRole('region',{name:'Review statistics'})).toBeVisible()
  // The route is technically visible during the fade-in; screenshots must
  // capture fully painted Q.E.D. and metrics, not an intermediate frame.
  await expect.poll(()=>page.getByRole('heading',{name:'Review complete',level:1}).evaluate(element=>{
   let node:HTMLElement|null=element
   let opacity=1
   while(node&&node.id!=='main-content'){
    opacity=Math.min(opacity,Number(getComputedStyle(node).opacity))
    node=node.parentElement
   }
   return opacity
  })).toBeGreaterThanOrEqual(0.99)
  await page.screenshot({path:prefix+'-done.png'})
 })
}

/** A Review done route can be opened before any answer exists. Every statistic
 * must communicate "unavailable", not a fabricated zero or tomorrow forecast.
 * This regression also waits for the actual route animation to settle before
 * capturing visual evidence, rather than treating visibility as full opacity.
 */
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const [width,height] of [[360,740],[390,844]] as const){
 test(`LOOK-7a empty Review done is honest: ${profile} ${theme} ${width}px`,async({page})=>{
  test.setTimeout(90_000)
  await page.setViewportSize({width,height})
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
  await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/review/done`,{waitUntil:'domcontentloaded'})
  const heading=page.getByRole('heading',{name:'Review complete',level:1})
  await expect(heading).toBeVisible()
  await expect(page.getByText('Review a round to see stats.',{exact:true})).toBeVisible()
  await expect(page.getByText('0 cards reviewed, 0 needed another pass.',{exact:true})).toHaveCount(0)
  await expect(page.getByRole('region',{name:'Round transcript'})).toHaveCount(0)
  const metrics=page.getByRole('region',{name:'Review statistics'}).locator('strong')
  await expect(metrics).toHaveCount(4)
  await expect(metrics).toHaveText(['–','–','–','–'])
  const colours=await metrics.evaluateAll(elements=>elements.map(value=>{
   const probe=document.createElement('span')
   probe.style.color='var(--ink-4)'
   value.parentElement!.appendChild(probe)
   const actual=getComputedStyle(value).color
   const expected=getComputedStyle(probe).color
   probe.remove()
   return {actual,expected}
  }))
  for(const {actual,expected} of colours)expect(actual,'unavailable stat must use --ink-4').toBe(expected)
  await expect(page.locator('[data-round-edge], [data-seal-ray]')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Done'})).toBeVisible()
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
  // Screen and AppShell both animate opacity; a visible node can still be
  // partly transparent. Inspect the settled final frame instead.
  await expect.poll(()=>heading.evaluate(element=>{
   let node:HTMLElement|null=element
   let opacity=1
   while(node&&node.id!=='main-content'){
    opacity=Math.min(opacity,Number(getComputedStyle(node).opacity))
    node=node.parentElement
   }
   return opacity
  })).toBeGreaterThanOrEqual(0.99)
  mkdirSync('test-results/screens/look-7a',{recursive:true})
  await page.screenshot({path:`test-results/screens/look-7a/empty-${profile}-${theme}-${width}.png`})
 })
}
