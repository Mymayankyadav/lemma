import {test,expect} from '@playwright/test';

// FIX #614: real owner projects have 36/40 checkpoints, unlike the small
// default demo. The S profile must exercise the summary-only folded Route.
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX #614 v4 Today large goal '+theme+' '+width+'px',async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height:width===360?740:844});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
  await page.goto('/lemma/?demo=stress&theme='+theme+'#/',{waitUntil:'domcontentloaded'});
  const card=page.locator('[data-summary-goal][data-goal-card]').first();
  await expect(card).toBeVisible({timeout:90_000});
  await expect(card.locator('[data-route][data-route-layout="folded"]')).toBeVisible();
  await expect(card.locator('[data-route-track]')).toBeVisible();
  await expect(card.locator('[data-goal-now]')).toContainText(/CP\d+/);
  await expect(card.locator('[data-goal-footnote]')).toBeVisible();
  await expect(card.locator('[data-schedule-chip]')).toBeVisible();
  await expect(card).not.toContainText(/keyboard navigation|checkpoints, now|\d+%/);
  await expect(page.getByRole('region',{name:'Distance to your goals'})).not.toContainText(/\d+%/);
  const metrics=await card.evaluate(el=>{
   const route=el.querySelector<HTMLElement>('[data-route] a');
   const rect=el.getBoundingClientRect();
   const texts=[...el.querySelectorAll('svg text')];
   return {height:rect.height,linkHeight:route?.getBoundingClientRect().height??0,
    smallLabels:texts.filter(t=>parseFloat(getComputedStyle(t).fontSize)<12).length,
    overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
    marks:el.querySelectorAll('[data-route-mark]').length};
  });
  expect(metrics.height).toBeLessThanOrEqual(210);
  expect(metrics.linkHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.smallLabels).toBe(0);
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  expect(metrics.marks).toBeGreaterThan(1);
  await page.screenshot({path:'test-results/screens/fix-614-'+theme+'-'+width+'.png'});
 });
}
