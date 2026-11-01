import {test,expect} from '@playwright/test'

test.describe.configure({retries:0})

test('AND-1 manifest, service worker and installability contracts',async({page,request})=>{
 await page.goto('/lemma/?demo=1#/',{waitUntil:'domcontentloaded'})
 const manifestResponse=await request.get('/lemma/manifest.webmanifest')
 expect(manifestResponse.ok()).toBe(true)
 const manifest=await manifestResponse.json()
 expect(manifest.start_url).toBe('/lemma/')
 expect(manifest.scope).toBe('/lemma/')
 expect(manifest.display).toBe('standalone')
 expect(manifest.display_override).toEqual(['standalone'])
 expect(manifest.launch_handler).toEqual({client_mode:'focus-existing'})
 expect(manifest.categories).toEqual(expect.arrayContaining(['education','productivity']))
 expect(manifest.orientation).toBe('any')
 expect(manifest.prefer_related_applications).toBe(false)
 expect(manifest.icons).toEqual(expect.arrayContaining([
  expect.objectContaining({sizes:'512x512',type:'image/png'}),
  expect.objectContaining({sizes:'512x512',purpose:'maskable'})
 ]))
 expect(manifest.screenshots).toHaveLength(2)
 for(const [world,src] of [['day','/lemma/screenshots/today-day-1080x1920.png'],['night','/lemma/screenshots/today-night-1080x1920.png']] as const){
  const shot=manifest.screenshots.find((item:{src:string})=>item.src===src)
  expect(shot).toEqual(expect.objectContaining({sizes:'1080x1920',type:'image/png',form_factor:'narrow'}))
  expect(shot.label).toContain(world)
  const response=await request.get(src)
  expect(response.ok()).toBe(true)
  const bytes=await response.body()
  expect(bytes.toString('hex',0,8)).toBe('89504e470d0a1a0a')
  expect(bytes.readUInt32BE(16)).toBe(1080)
  expect(bytes.readUInt32BE(20)).toBe(1920)
 }
 for(const [name,route] of [['Review','#/review'],['Approve','#/proposals'],['Atlas','#/atlas']] as const){
  const shortcut=manifest.shortcuts.find((entry:{name:string})=>entry.name===name)
  expect(shortcut?.url).toBe('/lemma/'+route)
  expect(shortcut?.icons?.[0]?.sizes).toBe('96x96')
  expect((await request.get(shortcut.icons[0].src)).ok()).toBe(true)
 }
 expect(await page.locator('link[rel="manifest"]').count()).toBe(1)
 expect(await page.locator('meta[name="theme-color"][media="(prefers-color-scheme: light)"]').count()).toBe(1)
 expect(await page.locator('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]').count()).toBe(1)
 const sw=await page.evaluate(async()=>{
  const registration=await navigator.serviceWorker.ready
  return {active:!!registration.active,scope:registration.scope}
 })
 expect(sw.active).toBe(true)
 expect(new URL(sw.scope).pathname).toBe('/lemma/')
})

test.describe('AND-1 actual 1080×1920 phone captures',()=>{
 test.use({deviceScaleFactor:3})
 for(const world of ['day','night'] as const){
 test('AND-1 genuine demo Today store screenshot '+world,async({page})=>{
  test.setTimeout(120_000)
  await page.setViewportSize({width:360,height:640})
  await page.emulateMedia({colorScheme:world==='day'?'light':'dark',reducedMotion:'reduce'})
  await page.goto('/lemma/?demo=1#/',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:'Home',level:1})).toBeVisible({timeout:60_000})
  await expect(page.getByRole('article',{name:/Goal progress for/}).first()).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
  const png=await page.screenshot({path:'test-results/screens/and-1/today-'+world+'-1080x1920.png',
   scale:'device',animations:'disabled',fullPage:false})
  expect(png.readUInt32BE(16)).toBe(1080)
  expect(png.readUInt32BE(20)).toBe(1920)
 })
 }
})
