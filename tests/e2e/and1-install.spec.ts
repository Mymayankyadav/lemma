import {test,expect} from '@playwright/test'
test.describe.configure({retries:0})

test('AND-1 installed PWA exposes correct manifest, service worker and launcher shortcuts',async({page})=>{
 await page.goto('/lemma/?demo=1&theme=graph#/',{waitUntil:'domcontentloaded'})
 const result=await page.evaluate(async()=>{
  const response=await fetch('/lemma/manifest.webmanifest')
  if(!response.ok)throw Error('manifest missing')
  const manifest=await response.json()
  const assets=[...manifest.icons,...manifest.shortcuts.flatMap((item:{icons:unknown[]})=>item.icons)]
  const dimensions=await Promise.all(assets.map(async(asset:{src:string;sizes:string})=>{
   const response=await fetch(asset.src)
   if(!response.ok)throw Error('Missing icon: '+asset.src)
   const bytes=await response.arrayBuffer(),view=new DataView(bytes)
   return {src:asset.src,sizes:asset.sizes,w:view.getUint32(16),h:view.getUint32(20)}
  }))
  return {manifest,dimensions,sw:!!(await navigator.serviceWorker.ready).active}
 })
 const {manifest,dimensions}=result
 expect(result.sw).toBe(true)
 expect(manifest.start_url).toBe('/lemma/')
 expect(manifest.scope).toBe('/lemma/')
 expect(manifest.display).toBe('standalone')
 expect(manifest.display_override).toEqual(['standalone'])
 expect(manifest.launch_handler).toEqual({client_mode:'focus-existing'})
 expect(manifest.categories).toEqual(['education','productivity'])
 expect(manifest.orientation).toBe('any')
 expect(manifest.prefer_related_applications).toBe(false)
 expect(manifest.icons.some((icon:{sizes:string;purpose?:string})=>icon.sizes==='512x512'&&icon.purpose==='maskable')).toBe(true)
 expect(manifest.shortcuts.map((item:{name:string;url:string})=>[item.name,item.url])).toEqual([
  ['Review','/lemma/#/review'],['Approve','/lemma/#/proposals'],['Atlas','/lemma/#/atlas']
 ])
 for(const item of dimensions){
  const [w,h]=item.sizes.split('x').map(Number)
  expect([item.w,item.h],item.src).toEqual([w,h])
 }
})

for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`AND-1 mobile install quality ${profile} ${theme} ${width}`,async({page})=>{
  test.setTimeout(120_000)
  await page.setViewportSize({width,height:width===360?740:844})
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('article',{name:/Goal progress for/}).first()).toBeVisible({timeout:60_000})
  const metrics=await page.evaluate(()=>({
   overflow:document.documentElement.scrollWidth-innerWidth,
   nodes:document.querySelectorAll('*').length,
  }))
  expect(metrics.overflow).toBeLessThanOrEqual(1)
  expect(metrics.nodes).toBeLessThan(1500)
  await page.screenshot({path:`test-results/screens/and1/today-${profile}-${theme}-${width}.png`})
 })
}
for(const theme of ['graph','graph-night'] as const){
 test(`AND-1 real demo listing screenshots ${theme} 1080x1920`,async({page})=>{
  test.setTimeout(120_000)
  await page.setViewportSize({width:1080,height:1920})
  const prefix='/lemma/?demo=1&theme='+theme
  await page.goto(prefix+'#/',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('article',{name:/Goal progress for/}).first()).toBeVisible()
  await page.screenshot({path:`test-results/screens/and1/listing-today-${theme}-1080x1920.png`,animations:'disabled'})
  await page.goto(prefix+'#/atlas',{waitUntil:'domcontentloaded'})
  await expect(page.getByRole('heading',{name:'Atlas',exact:true,level:1})).toBeVisible()
  await page.screenshot({path:`test-results/screens/and1/listing-atlas-${theme}-1080x1920.png`,animations:'disabled'})
 })
}
