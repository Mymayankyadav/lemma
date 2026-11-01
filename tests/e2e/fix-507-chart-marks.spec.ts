import {expect,test} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {measureSvgMarks} from '../../scripts/stress-marks';

// Regression for the real ST-0 /insights and /kit violations. Adjacent
// grouped series and dense daily columns must keep >=8px painted clearance;
// the data series and accessible totals must not be dropped to make it pass.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const)
for(const route of ['/insights','/kit'] as const){
 test(`FIX #507a chart marks ${profile} ${route} ${theme} ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:width===360?740:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(`/lemma/?demo=${profile}&theme=${theme}#${route}`);
  await expect(page.getByRole('heading',{name:route==='/insights'?'Insights':'Component kit',level:1,exact:true})).toBeVisible();
  const reviews=page.locator('svg[aria-label^="Reviews by day"]');
  const checkpoints=page.locator('svg[aria-label^="Checkpoints by week"]');
  await expect(reviews).toBeVisible();
  await expect(checkpoints).toBeVisible();
  // The spacing fix must retain all 30/7 day buckets, not silently omit bars.
  await expect(reviews.locator('[data-stress-mark]')).toHaveCount(route==='/insights'?30:7);
  if(route==='/insights')expect(await reviews.evaluate(svg=>svg.getBoundingClientRect().width>(svg.parentElement?.clientWidth??0))).toBe(true);
  expect(await checkpoints.locator('[data-stress-mark]').count()).toBeGreaterThan(3);
  const gap=await page.evaluate(measureSvgMarks);
  expect(gap,`all ${route} informative chart marks need >=8px edge clearance`).not.toBeNull();
  expect(gap!).toBeGreaterThanOrEqual(8);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  mkdirSync('test-results/screens/fix-507-charts',{recursive:true});
  await reviews.screenshot({path:`test-results/screens/fix-507-charts/${route.slice(1)}-${theme}-${width}-reviews.png`});
  await checkpoints.screenshot({path:`test-results/screens/fix-507-charts/${route.slice(1)}-${theme}-${width}-checkpoints.png`});
 });
}
