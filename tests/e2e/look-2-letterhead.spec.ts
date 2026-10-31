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
   // Each route must start without the previous route's temporary scroll fixture.
   await expect(page.locator('[data-look-2-spacer]')).toHaveCount(0);
   await page.goto(`/lemma/?demo=${profile}&theme=${theme}#${route}`,{
    waitUntil:'domcontentloaded',timeout:90_000,
   });
   await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
   // Wait for the lazy route and its data-backed heading before measuring or
   // capturing evidence. Otherwise a loading shell can yield blank screenshots
   // while the decorative SVG alone makes the test appear to pass.
   const headingName=route==='/'?'Home':route==='/projects'?'Paths':route==='/p/real-analysis'?'Project':route==='/review'?'Review':route==='/insights'?'Insights':'Settings';
   const heading=page.getByRole('heading',{name:headingName,level:1,exact:true}).first();
   await expect(heading).toBeVisible({timeout:30_000});
   await expect(heading).not.toBeEmpty();
   // A heading can appear while the route still shows data skeletons. Wait
   // for a real screen landmark so every screenshot is useful visual evidence.
   const ready=route==='/'?page.getByRole('article',{name:/Goal progress for/}).first()
    :route==='/projects'?page.locator('[data-project-row]').first()
    :route==='/p/real-analysis'?page.getByRole('region',{name:'Project timeline'})
    :route==='/review'?page.getByRole('heading',{name:'Decks'})
    :route==='/insights'?page.getByRole('heading',{name:'Recall'})
    :page.getByRole('heading',{name:'Apps'});
   await expect(ready).toBeVisible({timeout:30_000});
   // Playwright's toBeVisible() accepts opacity:0. Framer Motion mounts the
   // route's heading and data while its entrance is still fully transparent;
   // the old test captured only the fixed Demo badge and background sketch.
   // Wait until *every* ancestor up to main is painted before screenshots.
   await expect.poll(()=>ready.evaluate(element=>{
    let node:Element|null=element,minOpacity=1;
    while(node&&node.id!=='main-content'){
     const opacity=Number.parseFloat(getComputedStyle(node).opacity);
     if(Number.isFinite(opacity))minOpacity=Math.min(minOpacity,opacity);
     node=node.parentElement;
    }
    return minOpacity;
   }),{timeout:30_000}).toBeGreaterThanOrEqual(.99);
   // Opacity alone does not establish that a Motion route has finished
   // translating into view. Inspect every ancestor transform and wait for the
   // actual painted position, rather than fast-forwarding Motion in screenshot().
   await expect.poll(()=>ready.evaluate(element=>{
    let node:Element|null=element,maxDisplacement=0;
    while(node&&node.id!=='main-content'){
     const transform=getComputedStyle(node).transform;
     if(transform!=='none'){
      const m=new DOMMatrixReadOnly(transform);
      maxDisplacement=Math.max(maxDisplacement,Math.abs(m.m41),Math.abs(m.m42),
       Math.abs(m.m11-1)*100,Math.abs(m.m22-1)*100);
     }
     node=node.parentElement;
    }
    return maxDisplacement;
   }),{timeout:30_000}).toBeLessThan(.5);
   // Hash-route navigation can retain the prior route's 600px test scroll.
   // Reset before taking visual evidence: otherwise the next screenshot shows
   // only the empty lower page even though all landmarks are mounted.
   // Disable CSS smooth scrolling for this test-only reset. Otherwise
   // scrollTo(0,0) starts an animation and the next viewport assertion sees
   // the previous route's 600px scroll (often 1080px after hash navigation).
   await page.evaluate(()=>{
    document.documentElement.style.setProperty('scroll-behavior','auto','important');
    document.body.style.setProperty('scroll-behavior','auto','important');
    window.scrollTo(0,0);
   });
   await heading.scrollIntoViewIfNeeded();
   // The heading must be physically inside the viewport, not merely
   // "visible" in the DOM (which permits an offscreen element).
   await expect.poll(()=>heading.evaluate(el=>{
    const rect=el.getBoundingClientRect();
    return rect.width>0&&rect.height>0&&rect.top>=0&&rect.bottom<=innerHeight&&rect.left>=0&&rect.right<=innerWidth;
   }),{timeout:30_000}).toBe(true);
   await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeLessThanOrEqual(1);
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
    // Do not fast-forward Framer Motion: disabling animations can dispatch
    // completion callbacks and remove the active route during capture.
    animations:'allow',
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
   // Remove the artificial height before the next same-document hash route.
   // Otherwise scroll anchoring can retain the prior 600–1080px offset and
   // a stale heading may be scrolled into view despite the new route loading.
   await page.evaluate(()=>{
    document.querySelector('[data-look-2-spacer]')?.remove();
    window.scrollTo(0,0);
   });
   await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeLessThanOrEqual(1);
  }
 });
}

test('LOOK-2 Atlas and card review remain grid-only',async({page})=>{
 for(const route of ['/atlas','/review/run']){
  await page.goto(`/lemma/?demo=1&theme=graph-night#${route}`);
  await expect(page.locator('[data-graph-sketch]')).toHaveCount(0);
 }
});
