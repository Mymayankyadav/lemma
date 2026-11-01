import {expect,test} from '@playwright/test';

// LOOK-1c: the same notebook section-heading role must be visible across
// daily-use screens, without shrinking the maths or introducing page overflow.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`LOOK-1c section roles ${profile} ${theme} ${width}px`,async({page})=>{
  test.setTimeout(180_000);
  await page.setViewportSize({width,height:740});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  for(const [path,section,name] of [
   // LOOK-5c2 replaced the old Cards summary with a Review section;
   // retain the exact notebook heading-role and font assertions.
   ['/', 'Review', 'today'],
   ['/projects', null, 'paths'],
   ['/p/real-analysis', 'Stages', 'project'],
  ] as const){
   await page.goto(`./?demo=${profile}&theme=${theme}#${path}`);
   const headings=page.locator('h2.ui-section-heading');
   await expect(headings.first()).toBeVisible({timeout:90_000});
   if(section)await expect(page.getByRole('heading',{name:section,level:2}).first()).toHaveClass(/ui-section-heading/);
   const styles=await headings.first().evaluate(el=>{
    const css=getComputedStyle(el);
    return {font:css.fontFamily,size:parseFloat(css.fontSize),
     line:parseFloat(css.lineHeight),style:css.fontStyle};
   });
   expect(styles.font).toMatch(/Newsreader/i);
   expect(styles.size).toBe(19);
   expect(styles.line).toBe(23);
   expect(styles.style).toBe('italic');
   if(name!=='today'){
    const count=page.locator('[data-count-role]').first();
    await expect(count).toBeVisible();
    expect(await count.evaluate(el=>getComputedStyle(el).fontFamily)).toMatch(/Instrument Sans/i);
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
   const focusHeading=section?page.getByRole('heading',{name:section,level:2}).first():headings.first();
   await focusHeading.scrollIntoViewIfNeeded();
   await page.screenshot({path:`test-results/screens/look-1c-${name}-${profile}-${theme}-${width}.png`});
  }
 });
}
