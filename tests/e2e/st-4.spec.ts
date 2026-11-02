import {test,expect} from '@playwright/test';
import {waitForLoadedPaths} from './helpers/waitForLoadedPaths';

for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [390,360] as const){
 test('ST-4 bounded review and card library: '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(120_000);
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
  await page.setViewportSize({width,height:width===360?740:844});
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/review',{waitUntil:'domcontentloaded'});
  const summary=page.getByRole('region',{name:'Review summary'});
  await expect(summary).toBeVisible();
  await expect(summary.getByRole('button',{name:'Start review'})).toBeEnabled();
  await expect(page.getByRole('region',{name:'Decks'})).toBeVisible();
  await expect(page.getByRole('button',{name:/Expand /}).first()).toBeVisible();
  if(profile==='extreme'){
   await expect(summary.getByText(/3,800 overdue/)).toBeVisible();
   await expect(page.getByRole('navigation',{name:'Main navigation'}).getByText('999+')).toBeVisible();
  }
  await page.screenshot({path:'test-results/screens/stress/st-4-'+profile+'-'+theme+'-'+width+'-hub.png'});
  await summary.getByRole('button',{name:'Start review'}).click();
  const scroll=page.locator('[data-review-card-scroll]');
  await expect(scroll).toBeVisible();
  const controls=page.getByRole('region',{name:'Confidence'});
  await expect(controls).toBeInViewport();
  const fit=await page.evaluate(()=>{
   const card=document.querySelector<HTMLElement>('[data-review-card-scroll]')!;
   const controls=document.querySelector<HTMLElement>('section[aria-label="Confidence"]')!;
   return {
    pageOverflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
    cardOverflow:card.scrollWidth-card.clientWidth,
    controlsBottom:controls.getBoundingClientRect().bottom,
    height:innerHeight,
   };
  });
  expect(fit.pageOverflow).toBeLessThanOrEqual(1);
  expect(fit.cardOverflow).toBeLessThanOrEqual(1);
  expect(fit.controlsBottom).toBeLessThanOrEqual(fit.height+1);
  await page.getByRole('button',{name:'Show answer'}).click();
  await expect(page.getByRole('region',{name:'Grade answer'})).toBeInViewport();
  await page.screenshot({path:'test-results/screens/stress/st-4-'+profile+'-'+theme+'-'+width+'-face.png'});
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/cards',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Cards'})).toBeVisible();
  await expect(page.locator('[data-card-virtual-list]')).toBeVisible();
  const count=await page.locator('[data-card-row]').count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(24);
  const widthOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  expect(widthOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({path:'test-results/screens/stress/st-4-'+profile+'-'+theme+'-'+width+'-cards.png'});
  expect(errors).toEqual([]);
 });
}


test('ST-4 long aligned and matrix maths expand without horizontal page overflow',async({page})=>{
 test.setTimeout(120_000);
 await page.setViewportSize({width:360,height:740});
 await page.goto('/lemma/?demo=stress&theme=graph-night#/cards/4',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('heading',{name:'Card detail'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Show all 25 lines'})).toBeVisible();
 await page.getByRole('button',{name:'Show all 25 lines'}).click();
 const view=page.getByRole('button',{name:'View maths full screen'}).first();
 await expect(view).toBeVisible();
 await view.click();
 const dialog=page.getByRole('dialog',{name:'Full screen maths'});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Zoom in'}).click();
 await expect(dialog.getByRole('button',{name:'Close maths'})).toBeVisible();
 await page.screenshot({path:'test-results/screens/stress/st-4-fullscreen-maths.png'});
 await dialog.getByRole('button',{name:'Close maths'}).click();
 await expect(dialog).toBeHidden();
 await page.goto('/lemma/?demo=stress&theme=graph-night#/cards/3',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('button',{name:'Show all 10 lines'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});


for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('ST-4 virtual card rows typeset fraction and inline maths: '+theme+' '+width,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height:width===360?740:844});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto('/lemma/?demo=1&theme='+theme+'#/cards');
  await page.getByRole('button',{name:'New card'}).click();
  const editor=page.getByRole('dialog',{name:'New card'});
  await editor.getByLabel('Front').fill('Fraction preview: $\\frac{a}{b}$ and $x^2$');
  await editor.getByLabel('Back').fill('A fraction and a square.');
  await editor.getByLabel('Project').selectOption('real-analysis');
  await editor.getByLabel('Checkpoint').selectOption('CP1');
  await editor.getByRole('button',{name:'Create card'}).click();
  await expect(page).toHaveURL(/#\/cards\/\d+$/);
  // Hash navigation preserves the in-memory demo card created above.
  await page.evaluate(()=>{window.location.hash='/cards'});
  await expect(page.getByRole('heading',{name:'Cards',exact:true})).toBeVisible();
  await page.getByLabel('Search cards').fill('Fraction preview:');
  const row=page.locator('[data-card-row]').filter({hasText:'Fraction preview:'}).first();
  await expect(row).toBeVisible();
  const preview=row.locator('[data-card-front-preview]');
  await expect(preview.locator('.katex')).toHaveCount(2);
  await expect(preview.locator('.katex .mfrac')).toHaveCount(1);
  const bounds=await preview.evaluate(el=>{
   const rect=el.getBoundingClientRect();
   const row=el.closest('[data-card-row]')!.getBoundingClientRect();
   return {width:rect.width,rowWidth:row.width,height:rect.height,rowHeight:row.height,
    mathSizes:[...el.querySelectorAll('.katex')].map(k=>parseFloat(getComputedStyle(k).fontSize))};
  });
  expect(bounds.width).toBeLessThanOrEqual(bounds.rowWidth);
  expect(bounds.height).toBeLessThanOrEqual(bounds.rowHeight);
  expect(bounds.mathSizes.every(size=>size>=16)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  expect(await page.locator('[data-card-row]').count()).toBeLessThanOrEqual(24);
  await page.screenshot({path:'test-results/screens/stress/st-4-math-preview-'+theme+'-'+width+'.png'});
 });
}


// D6 acceptance: measure the interactive list transition under 4x CPU.
// Loading the deterministic 30,000-card fixture happens before timing.
// Unlike normal UI tests, a retry must never certify a failed 2000ms budget.
// Ordered default mode avoids simultaneous 4x CPU tests on one CI runner,
// while still executing all four cells even if one exceeds the limit.
test.describe('D6 strict first-attempt 4x CPU budget',()=>{
 test.describe.configure({mode:'default',retries:0});
for(const theme of ['graph','graph-night'] as const)
for(const [width,height] of [[360,740],[390,844]] as const){
 test('ST-4 extreme cards open under 2s at 4x CPU: '+theme+' '+width,async({page},testInfo)=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto('/lemma/?demo=extreme&theme='+theme+'#/projects',{waitUntil:'domcontentloaded',timeout:90_000});
  await waitForLoadedPaths(page);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  try{
   await page.evaluate(()=>{
    (window as typeof window&{__cardsStart:number}).__cardsStart=performance.now();
    location.hash='/cards';
   });
   await page.waitForFunction(()=>document.querySelectorAll('[data-card-row]').length>0,null,{timeout:90_000});
   const metrics=await page.evaluate(()=>({
    durationMs:performance.now()-(window as typeof window&{__cardsStart:number}).__cardsStart,
    nodes:document.querySelectorAll('*').length,
    rows:document.querySelectorAll('[data-card-row]').length,
    overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
   }));
   const evidence={...metrics,theme,width,profile:'extreme',cpuThrottle:4};
   await testInfo.attach('cards-d6-first-attempt-measurement',{
    body:JSON.stringify(evidence,null,2),contentType:'application/json',
   });
   console.info('Cards D6 cold 4x: '+JSON.stringify(evidence));
   expect(metrics.durationMs,'Card list first interactive render at 4x CPU').toBeLessThan(2000);
   expect(metrics.nodes,'Card list DOM budget').toBeLessThan(1500);
   expect(metrics.rows).toBeLessThanOrEqual(24);
   expect(metrics.overflow,'Card list horizontal overflow').toBeLessThanOrEqual(1);
   await page.screenshot({path:'test-results/screens/stress/st-4-4x-cards-'+theme+'-'+width+'.png'});
  }finally{
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
   await cdp.detach();
  }
 });
}

});
