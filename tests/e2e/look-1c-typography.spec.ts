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
   // LOOK-5c2 renamed Cards to Review; retain the full heading-style assertion.
   ['/', 'Review', 'today'],
   ['/projects', null, 'paths'],
   ['/p/real-analysis', 'Stages', 'project'],
  ] as const){
   await page.goto(`./?demo=${profile}&theme=${theme}#${path}`);
   // LOOK-5a removes redundant subject headings when every visible
   // subject has just one project. Wait for data before distinguishing that
   // intentional layout from a missing or still-loading section heading.
   if(name==='paths')await expect(page.locator('[data-project-row]').first()).toBeVisible({timeout:90_000});
   const headings=page.locator('h2.ui-section-heading');
   const singletonPaths=name==='paths'&&(await headings.count())===0;
   if(singletonPaths){
    const groups=page.locator('section[aria-label$=" projects"][data-group-size]');
    await expect(groups.first()).toBeVisible();
    const sizes=await groups.evaluateAll(nodes=>nodes.map(node=>Number(node.getAttribute('data-group-size'))));
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.every(size=>size===1)).toBe(true);
    await expect(page.locator('[data-project-row] .mr-2').first()).toBeVisible();
   }else{
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
   }
   if(name!=='today'){
    const count=page.locator('[data-count-role]').first();
    await expect(count).toBeVisible();
    expect(await count.evaluate(el=>getComputedStyle(el).fontFamily)).toMatch(/Instrument Sans/i);
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
   const focusHeading=singletonPaths?page.locator('[data-project-row]').first():
    section?page.getByRole('heading',{name:section,level:2}).first():headings.first();
   await focusHeading.scrollIntoViewIfNeeded();
   await page.screenshot({path:`test-results/screens/look-1c-${name}-${profile}-${theme}-${width}.png`});
  }
 });
}
