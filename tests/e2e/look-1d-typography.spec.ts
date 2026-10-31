import {expect,test} from '@playwright/test';

// LOOK-1d: review and settings use the same notebook section hierarchy as
// the rest of Lemma, even at extreme data density and compact phone widths.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`LOOK-1d Review and Settings headings ${profile} ${theme} ${width}px`,async({page})=>{
  test.setTimeout(180_000);
  await page.setViewportSize({width,height:740});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  for(const [path,heading,screen] of [
   ['/review','Decks','review'],
   ['/settings','Apps','settings'],
  ] as const){
   await page.goto(`./?demo=${profile}&theme=${theme}#${path}`);
   const section=page.getByRole('heading',{name:heading,level:2});
   await expect(section).toBeVisible({timeout:90_000});
   await expect(section).toHaveClass(/ui-section-heading/);
   const style=await section.evaluate(el=>{
    const css=getComputedStyle(el);
    return {font:css.fontFamily,size:parseFloat(css.fontSize),
     line:parseFloat(css.lineHeight),style:css.fontStyle};
   });
   expect(style.font).toMatch(/Newsreader/i);
   expect(style.size).toBe(19);
   expect(style.line).toBe(23);
   expect(style.style).toBe('italic');
   if(screen==='settings'){
    const status=page.getByRole('heading',{name:/^(Connected|Not connected yet)$/,level:3});
    await expect(status).toBeVisible();
    const cardStyle=await status.evaluate(el=>{
     const css=getComputedStyle(el);
     return {size:parseFloat(css.fontSize),font:css.fontFamily,weight:css.fontWeight,line:parseFloat(css.lineHeight)};
    });
    expect(cardStyle.size).toBe(16);
    expect(cardStyle.font).toMatch(/Instrument Sans/i);
    expect(cardStyle.weight).toBe('600');
    expect(cardStyle.line).toBe(20);
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
   await section.scrollIntoViewIfNeeded();
   await page.screenshot({path:`test-results/screens/look-1d-${screen}-${profile}-${theme}-${width}.png`});
  }
 });
}
