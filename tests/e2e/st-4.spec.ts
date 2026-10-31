import {test,expect} from '@playwright/test';

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
