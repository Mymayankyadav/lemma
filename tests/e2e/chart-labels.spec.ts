import {expect,test} from '@playwright/test'

// FIX #506: SVG labels are informative text, never miniature decorations.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [390,360] as const){
 test('FIX #506 chart labels '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(120_000)
  await page.setViewportSize({width,height:width===390?844:740})
  await page.emulateMedia({colorScheme:theme==='graph-night'?'dark':'light'})
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}))
  await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}))
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/kit')
  const section=page.getByRole('region',{name:'Analytical charts'})
  await expect(section).toBeVisible()
  const labels=section.locator('svg[role="img"] text')
  expect(await labels.count()).toBeGreaterThan(12)
  const bad=await labels.evaluateAll(nodes=>nodes.flatMap(node=>{
   const size=Number.parseFloat(getComputedStyle(node).fontSize)
   return size>=12?[]:[{text:node.textContent,size}]
  }))
  expect(bad,'All informative SVG labels are >=12px').toEqual([])
  const overlaps=await section.locator('svg[role="img"]').evaluateAll(charts=>{
   const collisions:string[]=[]
   for(const chart of charts){
    const nodes=Array.from(chart.querySelectorAll('text')).filter(node=>node.textContent?.trim())
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
     const a=nodes[i].getBoundingClientRect(),b=nodes[j].getBoundingClientRect()
     if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 &&
        Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)
      collisions.push((nodes[i].textContent||'')+' / '+(nodes[j].textContent||''))
    }
   }
   return collisions
  })
  expect(overlaps,'SVG chart labels must not overlap').toEqual([])
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({path:'test-results/screens/fix-506-kit-'+profile+'-'+theme+'-'+width+'.png'})
  // Insights uses its own ink-drawn recall chart, not the kit's LineArea.
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/insights')
  const recall=page.locator('svg[aria-label^="Recall over time"]')
  await expect(recall).toBeVisible({timeout:90_000})
  const recallSizes=await recall.locator('text').evaluateAll(nodes=>nodes.map(node=>
   Number.parseFloat(getComputedStyle(node).fontSize)))
  expect(recallSizes.length).toBeGreaterThan(4)
  expect(recallSizes.every(size=>size>=12)).toBe(true)
  // The kit alone is not proof of the actual Insights route. Check every
  // informative SVG chart label here, including Reviews by day and Checkpoints.
  const insightCharts=page.locator('svg[role="img"]')
  const insightLabels=insightCharts.locator('text')
  expect(await insightLabels.count()).toBeGreaterThan(12)
  const tiny=await insightLabels.evaluateAll(nodes=>nodes.flatMap(node=>{
   const size=Number.parseFloat(getComputedStyle(node).fontSize)
   return size>=12?[]:[{text:node.textContent,size}]
  }))
  expect(tiny,'Insights chart labels must be at least 12 CSS px').toEqual([])
  const insightOverlaps=await insightCharts.evaluateAll(charts=>{
   const collisions:string[]=[]
   for(const chart of charts){
    const nodes=Array.from(chart.querySelectorAll('text')).filter(node=>node.textContent?.trim())
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
     const a=nodes[i].getBoundingClientRect(),b=nodes[j].getBoundingClientRect()
     if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 &&
        Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)
      collisions.push((nodes[i].textContent||'')+' / '+(nodes[j].textContent||''))
    }
   }
   return collisions
  })
  expect(insightOverlaps,'Insights chart labels must not overlap').toEqual([])
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({path:'test-results/screens/fix-506-insights-'+profile+'-'+theme+'-'+width+'.png'})
 })
}
