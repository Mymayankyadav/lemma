import {test,expect,type Page} from '@playwright/test';
/** UI-5a §9: repeatable Euclid mobile audit with the offending DOM selector in each failure. */
const routes=[
 '/', '/projects','/p/algebra-1','/p/algebra-1/cp/CP11','/s/algebra-1/7',
 '/proposals','/review','/cards','/cards/31','/atlas','/insights','/settings','/sign-in'
] as const;
type Issue={selector:string;reason:string};
async function audit(page:Page):Promise<Issue[]>{
 return page.evaluate(()=>{
  const issues:Issue[]=[];
  const selector=(e:Element)=>{const id=e.id?'#'+e.id:'';const cls=[...e.classList].slice(0,2).join('.');return e.tagName.toLowerCase()+id+(cls?'.'+cls:'')};
  const visible=(e:Element)=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
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
    if(!parent||!visible(parent)||parent.closest('[data-bleed]'))continue;
    const range=document.createRange();range.selectNodeContents(n);
    for(const rect of Array.from(range.getClientRects())){
     if(rect.width===0||rect.height===0)continue;
     if(rect.left<edge.left+11.5||rect.right>edge.right-11.5)report(parent,`card edge clearance < 12px in ${selector(card)}`);
     texts.push({node:n,rect,element:parent});
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
    if(el.scrollWidth>el.clientWidth+1&&el.textContent?.trim()&&!el.closest('[data-bleed]'))report(el,`hidden text overflow by ${el.scrollWidth-el.clientWidth}px`);
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
for(const theme of ['euclid','euclid-night'] as const)
for(const density of ['compact','comfortable'] as const)
for(const viewport of [{width:390,height:844},{width:360,height:740}] as const){
 test(`UI-5a layout: ${theme}, ${density}, ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);
  for(const route of routes){
   await page.goto(`/lemma/?demo=1&theme=${theme}&density=${density}&effects=calm#${route}`);
   await page.locator('#main-content').waitFor();
   await page.evaluate(()=>document.fonts.ready);
   const issues=[...(await audit(page)),...(await coveredAtBottom(page))];
   expect(issues,`${route}: ${issues.map(i=>i.selector+': '+i.reason).join('; ')}`).toEqual([]);
   if(density==='compact'&&viewport.width===390&&(route==='/'||route==='/review')){
    await page.screenshot({path:`test-results/screens/review/ui5a-${theme}-${route==='/'?'today':'review'}.png`,fullPage:true});
   }
  }
 });
}

test('UI-5a auto-switches Euclid worlds with OS theme and respects a manual choice',async({page})=>{
 await page.emulateMedia({colorScheme:'light'});
 await page.goto('/lemma/?demo=1&theme=system#/settings');
 await expect(page.locator('html')).toHaveAttribute('data-theme','euclid');
 await page.emulateMedia({colorScheme:'dark'});
 await expect(page.locator('html')).toHaveAttribute('data-theme','euclid-night');
 await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content','#17130E');
 await page.getByRole('radio',{name:'Euclid',exact:true}).click();
 await page.emulateMedia({colorScheme:'light'});
 await expect(page.locator('html')).toHaveAttribute('data-theme','euclid');
 await page.emulateMedia({colorScheme:'dark'});
 await expect(page.locator('html')).toHaveAttribute('data-theme','euclid');
});
