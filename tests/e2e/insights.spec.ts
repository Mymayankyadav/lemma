import {test,expect} from '@playwright/test';
test('Insights renders study statistics and updates when the period changes',async({page})=>{
 const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/lemma/?demo=1#/insights');
 await expect(page.getByRole('heading',{name:'Insights'})).toBeVisible();
 await expect(page.getByRole('group',{name:'Time range'})).toBeVisible();
 await expect(page.getByText('18 h 40 m')).toBeVisible();
 await expect(page.locator('.tile').filter({hasText:'sessions'}).getByText('26',{exact:true})).toBeVisible();
 await expect(page.getByText('412',{exact:true})).toBeVisible();
 await expect(page.getByText('91%',{exact:true})).toBeVisible();
 await expect(page.getByText('94%',{exact:true})).toBeVisible();
 for(const name of ['Recall','Reviews by day','When you said','Time by subject','Checkpoints','Typical session','Most revisited'])
  await expect(page.getByRole('heading',{name}).or(page.getByText(name,{exact:true})).first()).toBeVisible();
 for(const name of ['Recall over time','Reviews by day','Answer confidence calibration','Checkpoints by week'])
  await expect(page.getByRole('img',{name:new RegExp(name)})).toBeVisible();
 await expect(page.getByRole('group',{name:/Time by subject/})).toBeVisible();
 await page.getByRole('button',{name:'7 days'}).click();
 await expect(page.getByText('18 h 40 m')).toHaveCount(0);
 await page.getByRole('button',{name:'90 days'}).click();
 await expect(page.getByRole('heading',{name:'Reviews by week'})).toBeVisible();
 expect(errors).toEqual([]);
 await page.screenshot({path:'test-results/screens/insights.png',fullPage:true});
});

for(const world of ['graph','graph-night'] as const){
 test(`UI-5g ink charts stay legible in ${world}`,async({page})=>{
  await page.setViewportSize({width:360,height:740});
  await page.addInitScript(theme=>localStorage.setItem('lemma.ui',JSON.stringify({theme,density:'compact',effects:'calm'})),world);
  await page.goto('/lemma/?demo=1#/insights');
  const recall=page.getByRole('img',{name:/Recall over time/});
  await expect(recall).toBeVisible();
  await expect(recall.locator('pattern')).toHaveCount(1);
  await expect(recall.locator('linearGradient')).toHaveCount(0);
  await expect(page.getByRole('group',{name:/Time by subject/})).toBeVisible();
  await expect(page.getByRole('img',{name:/Answer confidence calibration/})).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  expect(overflow).toBe(false);
  await page.screenshot({path:`test-results/screens/ui-5g-insights-${world}.png`,fullPage:true});
 });
}


for (const world of ['graph','graph-night'] as const) {
 test(`FIX #342 review grade colours are distinct in ${world}`, async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto(`/lemma/?demo=1&theme=${world}#/insights`);
  await expect(page.getByRole('heading',{name:'Reviews by day'})).toBeVisible();
  const grades=await page.evaluate(() => {
   const root=getComputedStyle(document.documentElement);
   const token=(key:string)=>root.getPropertyValue(key).trim();
   const legend=(grade:string)=>getComputedStyle(
    document.querySelector(`[data-review-grade="${grade}"] > span`)!
   ).backgroundColor;
   const rect=(grade:string)=>document.querySelector(
    `svg[aria-label^="Reviews by day"] rect[data-review-grade="${grade}"]`
   )?.getAttribute('fill');
   return {
    tokens:{again:token('--bad'),hard:token('--warn'),good:token('--grade-good'),easy:token('--easy')},
    legend:{again:legend('again'),hard:legend('hard'),good:legend('good'),easy:legend('easy')},
    bars:{again:rect('again'),hard:rect('hard'),good:rect('good'),easy:rect('easy')},
   };
  });
  expect(grades.tokens.good).not.toBe(grades.tokens.easy);
  expect(grades.legend.good).not.toBe(grades.legend.easy);
  expect(grades.legend.again).not.toBe(grades.legend.hard);
  expect(new Set(Object.values(grades.legend)).size).toBe(4);
  expect(grades.bars.good).toBe('var(--grade-good)');
  expect(grades.bars.easy).toBe('var(--easy)');
 });
}


// FIX #590: passive Insights marks must not borrow the red pencil reserved for
// the active tab and selected time-range control (v4-look §2a).
for (const theme of ['graph','graph-night'] as const) {
 for (const width of [360,390]) {
  test(`FIX #590 passive Insights marks use ink in ${theme} at ${width}px`,async({page})=>{
   await page.setViewportSize({width,height:844});
   await page.goto(`/lemma/?demo=1&theme=${theme}#/insights`);
   await expect(page.getByRole('img',{name:/Recall over time/})).toBeVisible();
   await expect(page.locator('[aria-label="Study totals"] svg')).toHaveCount(3);
   const colours=await page.evaluate(()=>{
    const probe=(value:string)=>{
     const element=document.createElement('span');
     element.style.color=`var(${value})`;
     document.body.appendChild(element);
     const colour=getComputedStyle(element).color;
     element.remove();
     return colour;
    };
    const colour=(element:Element|undefined|null)=>getComputedStyle(element!).color;
    const tile=[...document.querySelectorAll('.tile')].find(el=>el.textContent?.includes('Typical session'));
    const recallHeading=[...document.querySelectorAll('h2,h3')].find(el=>el.textContent?.trim()==='Recall');
    const svg=(selector:string,property:'stroke'|'fill')=>getComputedStyle(document.querySelector(selector)!).getPropertyValue(property);
    return {
     accent:probe('--accent'),ink:probe('--ink'),secondary:probe('--ink-2'),
     icons:[...document.querySelectorAll('[aria-label="Study totals"] svg')].map(icon=>getComputedStyle(icon).color),
     typicalIcon:colour(tile?.querySelector('svg')),
     recallNumber:colour(recallHeading?.parentElement?.querySelector('strong')),
     trend:svg('svg[aria-label^="Recall over time"] path[stroke]','stroke'),
     endpoint:svg('svg[aria-label^="Recall over time"] circle','fill'),
     hatching:svg('svg[aria-label^="Recall over time"] pattern line','stroke'),
     subjectGlyph:colour(document.querySelector('[aria-label="Time by subject"] button span[aria-hidden="true"]')),
     subjectBar:getComputedStyle(document.querySelector('[aria-label="Time by subject"] .h-full')!).backgroundColor,
     calibrationBar:getComputedStyle(document.querySelector('[aria-label^="Answer confidence calibration"] .h-full')!).backgroundColor,
     mostRevisitedIcons:[...document.querySelectorAll('a[aria-label^="Most revisited:"] svg')].map(icon=>getComputedStyle(icon).color),
    };
   });
   expect(colours.icons).toEqual([colours.secondary,colours.secondary,colours.secondary]);
   expect(colours.typicalIcon).toBe(colours.secondary);
   expect(colours.subjectGlyph).toBe(colours.secondary);
   expect(colours.subjectBar).toBe(colours.secondary);
   expect(colours.calibrationBar).toBe(colours.secondary);
   expect(colours.mostRevisitedIcons).toEqual([colours.secondary,colours.secondary]);
   expect(colours.recallNumber).toBe(colours.ink);
   await expect(page.getByRole('group',{name:'Time range'}).getByRole('button',{name:'30 days'})).toHaveAttribute('aria-pressed','true');
   for(const key of ['trend','endpoint','hatching'] as const){
    expect(colours[key]).toBe(colours.secondary);
    expect(colours[key]).not.toBe(colours.accent);
   }
   await page.screenshot({path:`test-results/screens/fix-590-insights-${theme}-${width}.png`,fullPage:true});
  });
 }
}
