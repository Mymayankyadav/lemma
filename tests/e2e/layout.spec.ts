import {test,expect,type Page} from '@playwright/test';
/** UI-5a §9: repeatable Euclid mobile audit with the offending DOM selector in each failure. */
const routes=[
 '/', '/projects','/projects/new','/p/real-analysis','/p/real-analysis/cp/CP4','/s/real-analysis/7',
 '/proposals','/proposals/proposal-6','/review','/review/run','/review/done',
 '/cards','/cards/31','/atlas','/insights','/settings','/sign-in','/kit'
] as const;
type Issue={selector:string;reason:string};
async function audit(page:Page):Promise<Issue[]>{
 return page.evaluate(()=>{
  const issues:Issue[]=[];
  const selector=(e:Element)=>{const id=e.id?'#'+e.id:'';const cls=[...e.classList].slice(0,2).join('.');return e.tagName.toLowerCase()+id+(cls?'.'+cls:'')};
  const visible=(e:Element)=>{
   if(e.closest('[inert],.sr-only,.katex-mathml'))return false;
   const r=e.getBoundingClientRect(),s=getComputedStyle(e);
   return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&s.clipPath!=='inset(50%)';
  };
  const report=(e:Element,reason:string)=>issues.push({selector:selector(e),reason});
  if(document.documentElement.scrollWidth>innerWidth+1)report(document.documentElement,`horizontal scroll: ${document.documentElement.scrollWidth}px > ${innerWidth}px`);
  // Text ranges are leaves, not nested element boxes: that avoids parent/child false positives.
  for(const card of document.querySelectorAll<HTMLElement>('[data-card], .card')){
   if(!visible(card))continue;
   const edge=card.getBoundingClientRect(),texts:{node:Node;rect:DOMRect;element:Element}[]=[];
   const walk=document.createTreeWalker(card,NodeFilter.SHOW_TEXT);
   for(let n=walk.nextNode();n;n=walk.nextNode()){
    if(!n.textContent?.trim())continue;
    const parent=n.parentElement;
    if(!parent||!visible(parent)||parent.closest('[data-bleed],.katex'))continue;
    const range=document.createRange();range.selectNodeContents(n);
    for(const rect of Array.from(range.getClientRects())){
     if(rect.width===0||rect.height===0)continue;
     if(rect.left<edge.left+11.5||rect.right>edge.right-11.5)report(parent,`card edge clearance < 12px in ${selector(card)}`);
     texts.push({node:n,rect,element:parent});
    }
   }
   // KaTeX positions glyphs and its hidden MathML in overlapping boxes by design.
   // Audit the visible formula as one atom against neighbouring prose instead.
   for(const math of card.querySelectorAll('.katex')){
    if(visible(math)&&!math.closest('[data-bleed]')){
     const rect=math.getBoundingClientRect();
     if(rect.left<edge.left+11.5||rect.right>edge.right-11.5)report(math,`formula crosses card clearance in ${selector(card)}`);
     texts.push({node:math,rect,element:math});
    }
   }
   for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){
    if(texts[i].node===texts[j].node)continue;
    const a=texts[i].rect,b=texts[j].rect;
    if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)
      report(texts[j].element,`text overlaps ${selector(texts[i].element)} inside ${selector(card)}`);
   }
  }
  for(const el of document.querySelectorAll<HTMLElement>('*')){
   if(!visible(el))continue;
   const s=getComputedStyle(el);
   if(['hidden','clip','ellipsis'].includes(s.overflowX)||s.textOverflow==='ellipsis'){
    if(el.scrollWidth>el.clientWidth+1&&Array.from(el.childNodes).some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent?.trim())&&!el.closest('[data-bleed]'))report(el,`hidden text overflow by ${el.scrollWidth-el.clientWidth}px`);
   }
   if(el.matches('button,a[href],[role="button"]')&&!(el.matches('a')&&s.display==='inline')){
    const r=el.getBoundingClientRect();
    if(r.width<43.5||r.height<43.5)report(el,`tap target ${Math.round(r.width)}x${Math.round(r.height)} < 44x44`);
   }
  }
  return issues.slice(0,40);
 });
}
async function coveredAtBottom(page:Page):Promise<Issue[]>{
 return page.evaluate(()=>{
  window.scrollTo(0,document.documentElement.scrollHeight);
  const nav=document.querySelector<HTMLElement>('nav[aria-label="Main navigation"]');
  if(!nav)return [];
  const navTop=nav.getBoundingClientRect().top;
  const els=Array.from(document.querySelectorAll<HTMLElement>('#main-content button,#main-content a[href],#main-content [role="button"]')).filter(e=>{
   const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';
  });
  const last=els.sort((a,b)=>b.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom)[0];
  if(!last)return [];
  const r=last.getBoundingClientRect();
  return r.bottom>navTop+1&&r.top<navTop?[{selector:last.tagName.toLowerCase()+(last.id?'#'+last.id:''),reason:'fixed tab bar covers the last interactive control'}]:[];
 });
}
for(const theme of ['graph','graph-night'] as const)
for(const density of ['compact'] as const)
for(const viewport of [{width:390,height:844},{width:360,height:740}] as const){
 test(`UI-6a layout: ${theme}, ${density}, ${viewport.width}x${viewport.height}`,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize(viewport);
  const failures:string[]=[];
  for(const route of routes){
   const entry=route.startsWith('/review/')?'/review':route;
   await page.goto(`/lemma/?demo=1&theme=${theme}&density=${density}&effects=calm#${entry}`);
   await page.waitForFunction(()=> (document.querySelector('#main-content')?.textContent?.trim().length??0)>40);
   if(route.startsWith('/review/')){
    await page.getByRole('button',{name:'Start review'}).click();
    await expect(page.getByRole('button',{name:'Sure',exact:true})).toBeVisible();
    if(route==='/review/done'){
     await page.getByRole('button',{name:'Sure',exact:true}).click();
     await page.getByRole('button',{name:'Grade Good'}).click();
     await page.getByRole('button',{name:'Close review'}).click();
     await expect(page.getByRole('heading',{name:'Review complete',level:1})).toBeVisible();
    }
   }
   await expect(page).toHaveURL(new RegExp('#'+route.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'));
   await page.evaluate(()=>document.fonts.ready);
   // Wait for the shell's drill-in transform to settle before measuring boxes.
   await expect.poll(()=>page.locator('#main-content > div').first().evaluate(e=>getComputedStyle(e).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
   const issues=[...(await audit(page)),...(await coveredAtBottom(page))];
   failures.push(...issues.map(i=>`${route} / ${i.selector}: ${i.reason}`));
   if(density==='compact'&&viewport.width===390){
    await page.screenshot({path:`test-results/screens/review/ui5a-${theme}-${route==='/'?'today':route.slice(1).replaceAll('/','-')}.png`,fullPage:true});
   }
  }
  expect(failures,failures.join('\n')).toEqual([]);
 });
}

test('UI-6a auto-switches graph worlds with OS theme and respects a manual choice',async({page})=>{
 await page.emulateMedia({colorScheme:'light'});
 await page.goto('/lemma/?demo=1&theme=system#/settings');
 await expect(page.locator('html')).toHaveAttribute('data-theme','graph');
 await page.emulateMedia({colorScheme:'dark'});
 await expect(page.locator('html')).toHaveAttribute('data-theme','graph-night');
 const themeMetas=page.locator('meta[name="theme-color"]');
 await expect(themeMetas).toHaveCount(2);
 await expect(themeMetas.nth(0)).toHaveAttribute('media','(prefers-color-scheme: light)');
 await expect(themeMetas.nth(1)).toHaveAttribute('media','(prefers-color-scheme: dark)');
 await expect(themeMetas.nth(0)).toHaveAttribute('content','#13171D');
 await expect(themeMetas.nth(1)).toHaveAttribute('content','#13171D');
 await page.getByRole('radio',{name:/^Day /}).click();
 await page.emulateMedia({colorScheme:'light'});
 await expect(page.locator('html')).toHaveAttribute('data-theme','graph');
 await page.emulateMedia({colorScheme:'dark'});
 await expect(page.locator('html')).toHaveAttribute('data-theme','graph');
 await expect(themeMetas.nth(0)).toHaveAttribute('content','#FAFAF6');
 await expect(themeMetas.nth(1)).toHaveAttribute('content','#FAFAF6');
});
