import {expect,test} from '@playwright/test';

// LOOK-1e: Insights uses the same v4 section role as Review and Settings.
// These assertions deliberately inspect computed styles, not just class names.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`LOOK-1e Insights section hierarchy ${profile} ${theme} ${width}px`,async({page})=>{
  test.setTimeout(180_000);
  await page.setViewportSize({width,height:740});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto(`./?demo=${profile}&theme=${theme}#/insights`);
  await expect(page.getByRole('heading',{name:'Insights',level:1})).toBeVisible({timeout:90_000});
  const headings=['Recall','Reviews by day','When you said','Time by subject','Checkpoints'];
  for(const name of headings){
   const heading=page.getByRole('heading',{name,level:2,exact:true});
   await expect(heading).toBeVisible();
   await expect(heading).toHaveClass(/ui-section-heading/);
   const css=await heading.evaluate(el=>{
    const s=getComputedStyle(el);
    return {font:s.fontFamily,size:parseFloat(s.fontSize),line:parseFloat(s.lineHeight),style:s.fontStyle};
   });
   expect(css.font).toMatch(/Newsreader/i);
   expect(css.size).toBe(19);
   expect(css.line).toBe(23);
   expect(css.style).toBe('italic');
  }
  const range=page.getByRole('group',{name:'Time range'});
  await expect(range).toBeVisible();
  for(const days of ['7 days','30 days','90 days']){
   await page.getByRole('button',{name:days}).click();
   await expect(page.getByRole('heading',{name:days==='90 days'?'Reviews by week':'Reviews by day',level:2})).toHaveClass(/ui-section-heading/);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole('heading',{name:'Recall',level:2}).scrollIntoViewIfNeeded();
  await page.screenshot({path:`test-results/screens/look-1e-insights-${profile}-${theme}-${width}.png`});
 });
}
