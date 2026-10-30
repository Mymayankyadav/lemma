import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

type Measurement = {
 route: string; profile: string; theme: string; width: number;
 nodes: number; horizontalOverflow: number; smallText: number; smallMath: number;
 smallTargets: number; durationMs: number;
};
/** Baseline measurements are intentionally recorded before ST-1…ST-7 fix the thresholds. */
async function measure(page: Page, route: string, profile: string, theme: string, width: number, durationMs: number): Promise<Measurement> {
 const result = await page.evaluate(() => {
  const visible = (e: Element) => {
   const r = e.getBoundingClientRect(), s = getComputedStyle(e);
   return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const elements = Array.from(document.querySelectorAll('*')).filter(visible);
  const smallText = elements.filter(e => {
   const s = getComputedStyle(e);
   return e.children.length === 0 && e.textContent?.trim() && parseFloat(s.fontSize) < 12;
  }).length;
  const smallMath = elements.filter(e => e.classList.contains('katex') && parseFloat(getComputedStyle(e).fontSize) < 16).length;
  const smallTargets = elements.filter(e => e.matches('button,a[href],[role="button"]') && (e.getBoundingClientRect().width < 44 || e.getBoundingClientRect().height < 44)).length;
  return {nodes: document.querySelectorAll('*').length, horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), smallText, smallMath, smallTargets};
 });
 return {route, profile, theme, width, durationMs, ...result};
}
const routes = ['/', '/projects', '/p/real-analysis', '/proposals', '/review', '/cards', '/atlas', '/insights'] as const;
for (const profile of ['stress', 'extreme'] as const)
for (const [theme, width, height] of [['graph',390,844],['graph-night',360,740]] as const) {
 test(`ST-0 baseline: ${profile}, ${theme}, ${width}px`, async ({page}, testInfo) => {
  test.setTimeout(300_000);
  await page.setViewportSize({width,height});
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**', route => route.fulfill({body:''}));
  const measurements: Measurement[] = [];
  for (const route of routes) {
   const start = Date.now();
   await page.goto(`/lemma/?demo=${profile}&theme=${theme}#${route}`, {waitUntil:'domcontentloaded',timeout:90_000});
   await expect(page.locator('#main-content')).toBeVisible({timeout:90_000});
   await page.waitForTimeout(250);
   measurements.push(await measure(page,route,profile,theme,width,Date.now()-start));
   const name = route === '/' ? 'today' : route.replaceAll('/','-').replace(/^-/, '');
   mkdirSync('test-results/screens/stress',{recursive:true});
   await page.screenshot({path:`test-results/screens/stress/${profile}-${theme}-${width}-${name}.png`,fullPage:false,timeout:30_000});
  }
  mkdirSync('test-results/stress',{recursive:true});
  const file = `test-results/stress/${profile}-${theme}-${width}.json`;
  writeFileSync(file,JSON.stringify(measurements,null,2));
  await testInfo.attach('stress-measurements',{body:JSON.stringify(measurements,null,2),contentType:'application/json'});
  // This first PR measures existing failures without declaring them fixed.
  // ST-1…ST-7 add the explicit threshold assertions to these measurements.
  expect(measurements).toHaveLength(routes.length);
  expect(measurements.every(m=>m.nodes>0)).toBe(true);
 });
}
