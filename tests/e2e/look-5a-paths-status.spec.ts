import {expect,test} from '@playwright/test'

test.beforeEach(async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}))
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}))
})

for(const profile of ['1','stress','extreme'] as const){
 for(const theme of ['graph','graph-night'] as const){
  for(const width of [360,390] as const){
   test(`LOOK-5a Paths segmented status ${profile} ${theme} ${width}px`,async({page})=>{
    test.setTimeout(90_000)
    await page.setViewportSize({width,height:740})
    await page.goto(`./?demo=${profile}&theme=${theme}#/projects`)
    const group=page.getByRole('group',{name:'Project status'})
    await expect(group).toBeVisible()
    await expect(group).toHaveAttribute('data-status-segments','')
    if(profile==='1'){
     const single=page.getByRole('region',{name:'Analysis projects'})
     await expect(single.locator(':scope > button')).toHaveCount(0)
     await expect(single.getByRole('link',{name:/Real Analysis/})).toBeVisible()
     await expect(single.getByText('Analysis',{exact:false})).toBeVisible()
    }
    const buttons=group.getByRole('button')
    await expect(buttons).toHaveCount(3)
    const rects=await buttons.evaluateAll(nodes=>nodes.map(node=>{
     const box=node.getBoundingClientRect()
     const style=getComputedStyle(node)
     return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,
      width:box.width,height:box.height,borderLeft:style.borderLeftWidth,
      borderRight:style.borderRightWidth,background:style.backgroundColor}
    }))
    for(const rect of rects){
     expect(rect.height).toBeGreaterThanOrEqual(44)
     expect(rect.width).toBeGreaterThanOrEqual(44)
     expect(rect.borderLeft).toBe('0px')
     expect(rect.borderRight).toBe('0px')
    }
    for(let i=1;i<rects.length;i++){
     expect(Math.abs(rects[i].left-rects[i-1].right)).toBeLessThanOrEqual(1)
     expect(Math.abs(rects[i].top-rects[0].top)).toBeLessThanOrEqual(1)
    }
    const active=group.getByRole('button',{name:'active',exact:true})
    const paused=group.getByRole('button',{name:'paused',exact:true})
    const done=group.getByRole('button',{name:'done',exact:true})
    await expect(active).toHaveAttribute('aria-pressed','true')
    await expect(paused).toHaveAttribute('aria-pressed','false')
    await expect(done).toHaveAttribute('aria-pressed','false')
    expect(rects[0].background).not.toBe(rects[1].background)
    await page.screenshot({path:`test-results/screens/look-5a-${profile}-${theme}-${width}-active.png`,fullPage:true})
    await paused.click()
    await expect(paused).toHaveAttribute('aria-pressed','true')
    await expect(active).toHaveAttribute('aria-pressed','false')
    await done.click()
    await expect(done).toHaveAttribute('aria-pressed','true')
    await active.click()
    await expect(active).toHaveAttribute('aria-pressed','true')
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    await page.screenshot({path:`test-results/screens/look-5a-${profile}-${theme}-${width}-restored.png`,fullPage:true})
   })
  }
 }
}
