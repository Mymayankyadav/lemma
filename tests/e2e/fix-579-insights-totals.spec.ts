import {expect,test} from '@playwright/test';

// FIX #579: 100x study totals must change form rather than clip text.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`FIX #579 all Insights totals remain legible ${profile} ${theme} ${width}px`,async({page})=>{
  test.setTimeout(180_000);
  await page.setViewportSize({width,height:740});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
  await page.goto(`./?demo=${profile}&theme=${theme}#/insights`);
  const totals=page.locator('[aria-label="Study totals"]');
  await expect(totals.locator('strong')).toHaveCount(3,{timeout:90_000});
  await page.getByRole('button',{name:'90 days'}).click();
  const studied=totals.locator('[data-study-total-visible]');
  await expect(studied).toBeVisible();
  await expect(studied).toHaveAttribute('aria-hidden','true');
  const exact=totals.locator('[data-study-total-exact]');
  await expect(exact).toContainText(/^Studied \d/);
  const exactText=await exact.textContent();
  expect(exactText).toMatch(/(?:days?|hours?|minutes?)/);
  const bounds=await totals.locator('strong').evaluateAll(elements=>elements.map(el=>{
   const css=getComputedStyle(el);
   return {client:el.clientWidth,scroll:el.scrollWidth,size:parseFloat(css.fontSize)};
  }));
  expect(bounds).toHaveLength(3);
  for(const [index,item] of bounds.entries()){
   expect(item.scroll,`metric tile ${index} must not clip its value`).toBeLessThanOrEqual(item.client+1);
   expect(item.size,`metric tile ${index} text size`).toBeGreaterThanOrEqual(12);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/screens/fix-579-insights-${profile}-${theme}-${width}.png`});
 });
}
