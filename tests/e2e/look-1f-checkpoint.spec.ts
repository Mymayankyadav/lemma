import {expect,test} from '@playwright/test';

// LOOK-1f: sheet sections use the shared v4 type role without changing
// the established h3 heading level or hiding mathematical content.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`LOOK-1f checkpoint headings ${profile} ${theme} ${width}px`,async({page})=>{
  test.setTimeout(180_000);
  await page.setViewportSize({width,height:740});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto(`./?demo=${profile}&theme=${theme}#/p/real-analysis/cp/CP4`);
  await expect(page.getByRole('heading',{name:'Checkpoint',level:1})).toBeVisible({timeout:90_000});
  for(const name of ['Evidence required','Steps']){
   const heading=page.getByRole('heading',{name,level:3,exact:true});
   await expect(heading).toBeVisible();
   await expect(heading).toHaveClass(/ui-section-heading/);
   const style=await heading.evaluate(el=>{
    const css=getComputedStyle(el);
    return {family:css.fontFamily,size:parseFloat(css.fontSize),line:parseFloat(css.lineHeight),italic:css.fontStyle};
   });
   expect(style.family).toMatch(/Newsreader/i);
   expect(style.size).toBe(19);
   expect(style.line).toBe(23);
   expect(style.italic).toBe('italic');
  }
  for(const name of ['Prerequisites','Concepts','Recent evidence']){
   const heading=page.getByRole('heading',{name,level:3,exact:true});
   if(await heading.count())await expect(heading).toHaveClass(/ui-section-heading/);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole('heading',{name:'Evidence required',level:3}).scrollIntoViewIfNeeded();
  await page.screenshot({path:`test-results/screens/look-1f-checkpoint-${profile}-${theme}-${width}.png`});
 });
}
