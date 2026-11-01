import {test,expect} from '@playwright/test'
test.describe.configure({retries:0})

/** Installed-PWA offline acceptance, not a fake navigator.onLine override. */
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`AND-8 read-only snapshot ${profile} ${theme} ${width}px`,async({page,context})=>{
  test.setTimeout(180_000)
  await page.setViewportSize({width,height:width===360?740:844})
  const prefix=`/lemma/?demo=${profile}&theme=${theme}`
  await page.goto(prefix+'#/',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('article',{name:/Goal progress for/}).first()).toBeVisible({timeout:60_000})
  await page.goto(prefix+'#/projects',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:'Paths',exact:true,level:1})).toBeVisible()
  await page.goto(prefix+'#/p/real-analysis',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:'Project',exact:true,level:1})).toBeVisible()
  await page.goto(prefix+'#/p/real-analysis/cp/CP4',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:'Checkpoint',exact:true,level:1})).toBeVisible()
  await page.goto(prefix+'#/review',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:'Review',exact:true,level:1})).toBeVisible()
  await page.evaluate(()=>navigator.serviceWorker.ready)
  await expect.poll(async()=>page.evaluate(async(profile)=>{
   const req=indexedDB.open('lemma-offline:demo-'+profile,1)
   return await new Promise<number>(resolve=>{
    req.onerror=()=>resolve(0)
    req.onsuccess=()=>{
     const db=req.result
     const tx=db.transaction('snapshot','readonly'),get=tx.objectStore('snapshot').get('latest')
     get.onsuccess=()=>{const value=get.result as {entries?:unknown[]}|undefined;resolve(value?.entries?.length??0);db.close()}
     get.onerror=()=>{resolve(0);db.close()}
    }
   })
  },profile),{timeout:30_000}).toBeGreaterThanOrEqual(3)
  const serialized=await page.evaluate(async(profile)=>{
   const req=indexedDB.open('lemma-offline:demo-'+profile,1)
   return await new Promise<string>((resolve,reject)=>{
    req.onerror=()=>reject(req.error)
    req.onsuccess=()=>{
     const db=req.result,tx=db.transaction('snapshot','readonly'),get=tx.objectStore('snapshot').get('latest')
     get.onsuccess=()=>{resolve(JSON.stringify(get.result));db.close()}
     get.onerror=()=>{reject(get.error);db.close()}
    }
   })
  },profile)
  expect(serialized).not.toMatch(/connectorUrl|access_token|refresh_token|pushSubscription|widgetToken|SENTINEL-SECRET/)
  expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(2_000_000)
  await context.setOffline(true)
  await page.reload({waitUntil:'domcontentloaded',timeout:30_000})
  await expect(page.getByRole('status').filter({hasText:/You're offline/})).toBeVisible({timeout:30_000})
  await expect(page.getByText('Reviewing needs a connection')).toBeVisible({timeout:30_000})
  // The four cached navigation targets must remain readable without a network.
  for(const [route,heading] of [['/','Home'],['/projects','Paths'],['/p/real-analysis','Project'],['/p/real-analysis/cp/CP4','Checkpoint']] as const){
   await page.evaluate(route=>{window.location.hash=route},route)
   await expect(page.getByRole('heading',{name:heading,exact:true,level:1})).toBeVisible({timeout:30_000})
   await expect(page.getByRole('status').filter({hasText:/You're offline/})).toBeVisible()
  }
  await page.evaluate(()=>{window.location.hash='/review'})
  await expect(page.getByText('Reviewing needs a connection')).toBeVisible({timeout:30_000})
  await page.evaluate(()=>{window.location.hash='/settings'})
  await expect(page.getByRole('heading',{name:'Settings',exact:true,level:1})).toBeVisible()
  await expect(page.getByRole('heading',{name:/Saved settings · read only/})).toBeVisible()
  await expect(page.getByText(/Needs a connection to change settings or view your connector address/)).toBeVisible()
  await expect(page.getByRole('button',{name:'Copy connector address'})).toHaveCount(0)
  await page.evaluate(()=>{window.location.hash='/review'})
  await expect(page.getByText('Reviewing needs a connection')).toBeVisible()
  await expect(page.getByRole('region',{name:'Decks'})).toBeVisible()
  await expect(page.getByRole('switch',{name:'Mix decks'})).toBeDisabled()
  const start=page.getByRole('button',{name:/Start review, needs a connection/})
  await expect(start).toHaveAttribute('aria-disabled','true')
  const offlineBanner=page.getByRole('status').filter({hasText:"You're offline"})
  const [bannerBox,headingBox]=await Promise.all([
   offlineBanner.boundingBox(),
   page.getByRole('heading',{name:'Review',exact:true,level:1}).boundingBox(),
  ])
  expect(bannerBox).not.toBeNull()
  expect(headingBox).not.toBeNull()
  expect(headingBox!.y).toBeGreaterThanOrEqual(bannerBox!.y+bannerBox!.height+8)
  // aria-disabled correctly tells assistive tech this is unavailable, so
  // Playwright's actionability layer refuses locator.click(). A real browser
  // still dispatches DOM clicks on aria-disabled (not native-disabled) buttons;
  // invoke that path to prove the mutation guard shows its toast and does not start.
  await start.evaluate((button:HTMLButtonElement)=>button.click())
  await expect(page.getByText('Needs a connection',{exact:true})).toBeVisible()
  await expect(page).toHaveURL(/#\/review$/)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
  // No offline write queue: navigating and attempting disabled writes must not
  // alter even the allowlisted IndexedDB snapshot while disconnected.
  const afterOffline=await page.evaluate(async(profile)=>{
   const req=indexedDB.open('lemma-offline:demo-'+profile,1)
   return await new Promise<string>((resolve,reject)=>{
    req.onerror=()=>reject(req.error)
    req.onsuccess=()=>{
     const db=req.result,tx=db.transaction('snapshot','readonly'),get=tx.objectStore('snapshot').get('latest')
     get.onsuccess=()=>{resolve(JSON.stringify(get.result));db.close()}
     get.onerror=()=>{reject(get.error);db.close()}
    }
   })
  },profile)
  expect(afterOffline).toBe(serialized)
  await page.screenshot({path:`test-results/screens/and-8/offline-${profile}-${theme}-${width}.png`})
  await context.setOffline(false)
 })
}

/** Regression: network loss must not mutate an already-open card or project. */
test('AND-8 offline mutation guards retain the card and project state',async({page,context})=>{
 test.setTimeout(90_000)
 await page.setViewportSize({width:360,height:740})
 await page.goto('/lemma/?demo=1&theme=graph#/cards',{waitUntil:'domcontentloaded'})
 await expect(page.getByRole('heading',{name:'Cards',exact:true,level:1})).toBeVisible()
 await context.setOffline(true)
 const create=page.getByRole('button',{name:'New card, needs a connection'})
 await expect(create).toHaveAttribute('aria-disabled','true')
 // DOM click exercises the guarded handler: Playwright intentionally refuses
 // locator.click() on aria-disabled controls even though browsers dispatch it.
 await create.evaluate((button:HTMLButtonElement)=>button.click())
 await expect(page.getByText('Needs a connection',{exact:true})).toBeVisible()
 await expect(page.getByRole('dialog',{name:/New card/i})).toHaveCount(0)
 await page.evaluate(()=>{window.location.hash='/projects'})
 await expect(page.getByRole('heading',{name:'Paths',exact:true,level:1})).toBeVisible()
 const actions=page.getByRole('button',{name:/Actions for/}).first()
 await actions.click()
 const menu=page.getByRole('menu',{name:/Manage/}).first()
 await expect(menu).toBeVisible()
 const row=actions.locator('xpath=ancestor::article')
 const pinnedBefore=await row.getByText('Pinned',{exact:true}).count()
 const mutate=menu.getByRole('menuitem',{name:/^(Pin|Unpin)$/}).first()
 await expect(mutate).toHaveAttribute('aria-disabled','true')
 await mutate.evaluate((button:HTMLButtonElement)=>button.click())
 await expect(page.getByText('Needs a connection',{exact:true}).last()).toBeVisible()
 await expect.poll(()=>row.getByText('Pinned',{exact:true}).count()).toBe(pinnedBefore)
 await context.setOffline(false)
})

/** A server/DNS failure can leave navigator.onLine true while a stale snapshot
 * is rendered. Mutations must stay disabled until live data is recovered.
 */
test('AND-8 stale snapshot disables writes even when the browser reports online',async({page})=>{
 await page.goto('/lemma/?demo=1&theme=graph#/cards',{waitUntil:'domcontentloaded'})
 await expect(page.getByRole('heading',{name:'Cards',exact:true,level:1})).toBeVisible()
 await expect(page.getByRole('button',{name:'New card'})).toBeVisible()
 await page.evaluate(()=>{
  const savedAt=Date.now()
  document.documentElement.dataset.offlineSavedAt=String(savedAt)
  window.dispatchEvent(new CustomEvent('lemma:offline-snapshot',{detail:{savedAt}}))
 })
 expect(await page.evaluate(()=>navigator.onLine)).toBe(true)
 const blocked=page.getByRole('button',{name:'New card, needs a connection'})
 await expect(blocked).toHaveAttribute('aria-disabled','true')
 await blocked.evaluate((button:HTMLButtonElement)=>button.click())
 await expect(page.getByText('Needs a connection',{exact:true})).toBeVisible()
 await expect(page.getByRole('dialog',{name:/New card/i})).toHaveCount(0)
 await page.evaluate(()=>{window.location.hash='/review'})
 await expect(page.getByText('Reviewing needs a connection')).toBeVisible()
 await expect(page.getByRole('button',{name:/Start review, needs a connection/})).toHaveAttribute('aria-disabled','true')
 await page.evaluate(()=>{window.location.hash='/settings'})
 await expect(page.getByRole('heading',{name:/Saved settings · read only/})).toBeVisible()
 await page.evaluate(()=>{window.location.hash='/cards'})
 await expect(page.getByRole('button',{name:'New card, needs a connection'})).toHaveAttribute('aria-disabled','true')
 await page.evaluate(()=>{
  delete document.documentElement.dataset.offlineSavedAt
  window.dispatchEvent(new CustomEvent('lemma:offline-snapshot',{detail:{savedAt:null}}))
 })
 await expect(page.getByRole('button',{name:'New card'})).toBeVisible()
})
