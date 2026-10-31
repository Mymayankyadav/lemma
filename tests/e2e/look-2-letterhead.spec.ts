import {test,expect} from '@playwright/test';

/** LOOK-2: the engineering-pad curve is decorative page letterhead, never a fixed overlay. */
const routes=[
 ['/', 'today'],['/projects','paths'],['/p/real-analysis','paths'],
 ['/review','review'],['/insights','insights'],['/settings','unit'],
] as const;

for(const theme of ['graph','graph-night'] as const)
for(const profile of ['1','stress','extreme'] as const)
for(const width of [360,390] as const){
 test(`LOOK-2 letterhead ${theme} ${profile} ${width}px`,async({page})=>{
  test.setTimeout(profile==='extreme'?180_000:120_000);
  const height=width===360?740:844;
  await page.setViewportSize({width,height});
  for(const [route,kind] of routes){
   await page.goto(`/lemma/?demo=${profile}&theme=${theme}#${route}`,{
    waitUntil:'domcontentloaded',timeout:90_000,
   });
   await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
   // Wait for the lazy route and its data-backed heading before measuring or
   // capturing evidence. Otherwise a loading shell can yield blank screenshots
   // while the decorative SVG alone makes the test appear to pass.
   const heading=page.locator('#main-content h1').first();
   await expect(heading).toBeVisible({timeout:30_000});
   await expect(heading).not.toBeEmpty();
   const sketch=page.locator('[data-graph-sketch]');
   await expect(sketch).toHaveCount(1);
   await expect(sketch).toHaveAttribute('data-graph-sketch',kind);
   const geometry=await sketch.evaluate(svg=>{
    const r=svg.getBoundingClientRect(),main=document.querySelector('#main-content')!.getBoundingClientRect();
    const s=getComputedStyle(svg);
    const curve=svg.querySelector<SVGGraphicsElement>('path[stroke="var(--accent)"]');
    const box=curve?.getBBox(),matrix=curve?.getScreenCTM();
    const painted=box&&matrix?[
     new DOMPoint(box.x,box.y).matrixTransform(matrix),
     new DOMPoint(box.x+box.width,box.y+box.height).matrixTransform(matrix),
    ]:null;
    const curveRect=painted?{left:Math.min(painted[0].x,painted[1].x)-2,
     right:Math.max(painted[0].x,painted[1].x)+2,
     top:Math.min(painted[0].y,painted[1].y)-2,
     bottom:Math.max(painted[0].y,painted[1].y)+2}:null;
    const overlaps:string[]=[];
    if(curveRect){
     const intersect=(r:DOMRect)=>Math.min(r.right,curveRect.right)-Math.max(r.left,curveRect.left)>1
      &&Math.min(r.bottom,curveRect.bottom)-Math.max(r.top,curveRect.top)>1;
     for(const element of document.querySelectorAll<HTMLElement>('[data-card],.card,.slab')){
      if(intersect(element.getBoundingClientRect()))overlaps.push(element.tagName.toLowerCase()+'.paper');
     }
     for(const element of document.querySelectorAll<HTMLElement>('h1,h2,h3')){
      const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
      for(let node=walker.nextNode();node;node=walker.nextNode()){
       if(!node.textContent?.trim())continue;
       const range=document.createRange();range.selectNodeContents(node);
       if([...range.getClientRects()].some(intersect))overlaps.push(element.tagName.toLowerCase()+'.text');
      }
     }
    }
    return {overlaps,
     position:s.position,pointer:s.pointerEvents,top:r.top-main.top,
     height:r.height,bottom:r.bottom,opacity:curve?.getAttribute('opacity'),
     labels:svg.querySelectorAll('text').length,
     visibleWidth:document.documentElement.scrollWidth,
     right:r.right,ariaHidden:svg.getAttribute('aria-hidden'),
    };
   });
   expect(geometry.position).toBe('absolute');
   expect(geometry.pointer).toBe('none');
   expect(geometry.ariaHidden).toBe('true');
   expect(geometry.labels).toBe(0);
   expect(geometry.overlaps).toEqual([]);
   expect(geometry.top).toBeGreaterThanOrEqual(-1);
   expect(geometry.top).toBeLessThanOrEqual(1);
   expect(geometry.height).toBeLessThanOrEqual(121);
   expect(geometry.bottom).toBeLessThan(height/2);
   expect(geometry.right).toBeLessThanOrEqual(width+1);
   expect(geometry.visibleWidth).toBeLessThanOrEqual(width+1);
   expect(Number(geometry.opacity)).toBeCloseTo(theme==='graph'?.12:.13,3);
   await page.screenshot({
    path:`test-results/screens/look-2/${kind}-${route.replaceAll('/','-')||'home'}-${theme}-${profile}-${width}.png`,
   });
   // A temporary, non-app spacer guarantees a scrollable document even on
   // short screens, so the assertion cannot pass vacuously at scrollY=0.
   const scrolled=await page.evaluate(()=>{
    const spacer=document.createElement('div');
    spacer.setAttribute('data-look-2-spacer','');
    spacer.style.height='1400px';
    document.querySelector('#main-content')!.appendChild(spacer);
    window.scrollTo(0,600);
    return {y:window.scrollY,bottom:document.querySelector('[data-graph-sketch]')!.getBoundingClientRect().bottom};
   });
   expect(scrolled.y).toBeGreaterThanOrEqual(590);
   expect(scrolled.bottom).toBeLessThanOrEqual(0);
  }
 });
}

test('LOOK-2 Atlas and card review remain grid-only',async({page})=>{
 for(const route of ['/atlas','/review/run']){
  await page.goto(`/lemma/?demo=1&theme=graph-night#${route}`);
  await expect(page.locator('[data-graph-sketch]')).toHaveCount(0);
 }
});
