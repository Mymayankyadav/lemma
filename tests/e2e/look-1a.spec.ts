import {test,expect} from '@playwright/test';

/** LOOK-1a: shared notebook primitives must remain legible under S/X data. */
for(const theme of ['graph','graph-night'] as const)
for(const profile of ['stress','extreme'] as const)
for(const width of [360,390] as const){
 test(`LOOK-1a notebook primitives ${theme} ${profile} ${width}px`,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height:width===360?740:844});
  await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/kit`,{
   waitUntil:'domcontentloaded',timeout:90_000,
  });
  const title=page.getByRole('heading',{name:'Component kit',level:1});
  await expect(title).toBeVisible();
  const display=await title.evaluate(el=>{
   const s=getComputedStyle(el);
   return {size:s.fontSize,line:s.lineHeight,family:s.fontFamily};
  });
  expect(display).toMatchObject({size:'28px',line:'31px'});
  expect(display.family).toContain('Newsreader');

  const heading=page.getByRole('region',{name:'Surfaces'})
   .getByRole('heading',{name:'Surfaces',level:2});
  const section=await heading.evaluate(el=>{
   const s=getComputedStyle(el);
   return {tag:el.tagName,cls:el.className,size:s.fontSize,line:s.lineHeight,
    style:s.fontStyle,family:s.fontFamily};
  });
  expect(section).toMatchObject({
   tag:'H2',size:'19px',line:'23px',style:'italic',
  });
  expect(section.cls).toContain('ui-section-heading');
  expect(section.family).toContain('Newsreader');

  const chip=page.locator('.ui-chip:not(button)').first();
  await expect(chip).toBeVisible();
  const flat=await chip.evaluate(el=>{
   const s=getComputedStyle(el);
   return {tag:el.tagName,border:s.borderTopWidth,shadow:s.boxShadow,
    background:s.backgroundColor,radius:s.borderTopLeftRadius};
  });
  expect(flat.tag).toBe('SPAN');
  expect(flat.border).toBe('0px');
  expect(flat.shadow).toBe('none');
  expect(flat.radius).toBe('999px');

  const card=page.locator('.card').first();
  const paper=await card.evaluate(el=>{
   const s=getComputedStyle(el);
   return {border:s.borderTopWidth,shadow:s.boxShadow};
  });
  expect(paper.border).toBe(theme==='graph-night'?'1px':'1.5px');
  if(theme==='graph-night')expect(paper.shadow).toContain('3px 3px');

  const icon=page.locator('.ui-icon-button').first();
  const target=await icon.boundingBox();
  expect(target).not.toBeNull();
  expect(target!.width).toBeGreaterThanOrEqual(44);
  expect(target!.height).toBeGreaterThanOrEqual(44);

  const fonts=await page.locator('link[href*="fonts.googleapis.com"]').getAttribute('href');
  expect(fonts).not.toContain('EB+Garamond');
  expect(fonts).toContain('Newsreader:ital,wght@0,400;0,500;1,500');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))
   .toBeLessThanOrEqual(0);
  await page.screenshot({
   path:`test-results/screens/look-1a/${theme}-${profile}-${width}.png`,
   fullPage:true,
  });

  // Home header icons remain 44px hit areas, but lose false boxed chrome.
  await page.evaluate(()=>{window.location.hash='/';});
  const headerIcon=page.locator('header .ui-icon-button').first();
  await expect(headerIcon).toBeVisible({timeout:90_000});
  const header=await headerIcon.evaluate(el=>{
   const s=getComputedStyle(el),r=el.getBoundingClientRect();
   return {border:s.borderTopWidth,shadow:s.boxShadow,
    background:s.backgroundColor,width:r.width,height:r.height};
  });
  expect(header.border).toBe('0px');
  expect(header.shadow).toBe('none');
  expect(header.background).toBe('rgba(0, 0, 0, 0)');
  expect(header.width).toBeGreaterThanOrEqual(44);
  expect(header.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({
   path:`test-results/screens/look-1a/home-${theme}-${profile}-${width}.png`,
   fullPage:true,
  });
 });
}
