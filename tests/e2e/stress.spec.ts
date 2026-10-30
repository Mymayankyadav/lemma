import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { stressViolations } from '../../scripts/stress-limits';

type Measurement = {
 route: string; actualRoute: string; profile: string; theme: string; width: number;
 nodes: number; horizontalOverflow: number; smallText: number; smallMath: number;
 smallTargets: number; minCircleGap: number | null; durationMs: number;
 requestCount: number; transferBytes: number; cpuThrottle: number;
};

/** Record all hard-limit violations before downstream ST-1…ST-7 make them pass. */
async function measure(page: Page, route: string, profile: string, theme: string, width: number, durationMs: number, cpuThrottle: number): Promise<Measurement> {
 const result = await page.evaluate(() => {
  const visible = (e: Element) => {
   const r = e.getBoundingClientRect(), s = getComputedStyle(e);
   return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const elements = Array.from(document.querySelectorAll('*')).filter(visible);
  const smallText = elements.filter(e => {
   const s = getComputedStyle(e);
   return e.children.length === 0 && !!e.textContent?.trim() && parseFloat(s.fontSize) < 12;
  }).length;
  const smallMath = elements.filter(e => e.classList.contains('katex') && parseFloat(getComputedStyle(e).fontSize) < 16).length;
  const smallTargets = elements.filter(e => e.matches('button,a[href],[role="button"]') && (e.getBoundingClientRect().width < 44 || e.getBoundingClientRect().height < 44)).length;
  const gaps: number[] = [];
  for (const svg of document.querySelectorAll('svg')) {
   const centers = Array.from(svg.querySelectorAll('circle')).map(circle => {
    const r = circle.getBoundingClientRect();
    return {x:r.x+r.width/2, y:r.y+r.height/2, width:r.width};
   }).filter(c => c.width > 0 && c.width < 30);
   for (let i=1;i<centers.length;i++) {
    if (Math.abs(centers[i].y-centers[i-1].y)<10) gaps.push(Math.abs(centers[i].x-centers[i-1].x));
   }
  }
  const resources = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
   .filter(entry => /\/(rest|functions)\/v1\//.test(entry.name));
  return {
   nodes: document.querySelectorAll('*').length,
   horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
   smallText, smallMath, smallTargets,
   minCircleGap: gaps.length ? Math.min(...gaps) : null,
   requestCount: resources.length,
   transferBytes: resources.reduce((total,entry)=>total+entry.transferSize,0),
  };
 });
 return {route, actualRoute: await page.evaluate(()=>location.hash.slice(1)), profile, theme, width, durationMs, cpuThrottle, ...result};
}

// Full route inventory, matching the normal mobile layout audit.
const routes = [
 '/', '/projects', '/projects/new', '/p/real-analysis', '/p/real-analysis/cp/CP4',
 '/s/real-analysis/7', '/proposals', '/proposals/proposal-6', '/review',
 '/review/run', '/review/done', '/cards', '/cards/31', '/atlas',
 '/insights', '/settings', '/sign-in', '/kit',
] as const;
for (const profile of ['stress', 'extreme'] as const)
for (const theme of ['graph', 'graph-night'] as const)
for (const [width, height] of [[390, 844], [360, 740]] as const) {
 test('ST-0 all-route baseline: '+profile+', '+theme+', '+width+'px', async ({page}, testInfo) => {
  test.setTimeout(600_000);
  await page.setViewportSize({width,height});
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**', route => route.fulfill({body:''}));
  const measurements: Measurement[] = [];
  // Measure the first render under 4x CPU throttling; other routes remain
  // unthrottled to keep the pre-fix 30,000-card profile within CI budgets.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate:4});
  for (const [index, route] of routes.entries()) {
   const throttle = index===0 ? 4 : 1;
   if(index===1) await cdp.send('Emulation.setCPUThrottlingRate', {rate:1});
   const start = Date.now();
   await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#'+route, {waitUntil:'domcontentloaded',timeout:90_000});
   await expect(page.locator('#main-content')).toBeVisible({timeout:90_000});
   await page.waitForFunction(() => (document.querySelector('#main-content')?.textContent?.trim().length ?? 0) > 40, null, {timeout:90_000});
   await page.waitForTimeout(150);
   measurements.push(await measure(page,route,profile,theme,width,Date.now()-start,throttle));
   // Avoid counting the same cached resources again on subsequent hash routes.
   await page.evaluate(() => performance.clearResourceTimings());
   const name = route === '/' ? 'today' : route.replaceAll('/','-').replace(/^-/, '');
   mkdirSync('test-results/screens/stress',{recursive:true});
   await page.screenshot({path:'test-results/screens/stress/'+profile+'-'+theme+'-'+width+'-'+name+'.png',fullPage:false,timeout:30_000});
  }
  await cdp.detach();
  mkdirSync('test-results/stress',{recursive:true});
  const file = 'test-results/stress/'+profile+'-'+theme+'-'+width+'.json';
  const report=measurements.map(m=>({...m,violations:stressViolations(m)}));
  writeFileSync(file,JSON.stringify(report,null,2));
  await testInfo.attach('stress-measurements',{body:JSON.stringify(report,null,2),contentType:'application/json'});
  // ST-0 establishes the baseline and route inventory. ST-1…ST-7 enforce
  // the hard thresholds once the known pre-existing scale failures are fixed.
  expect(measurements.map(m=>m.route)).toEqual([...routes]);
  expect(measurements.every(m=>m.nodes>0 && Number.isFinite(m.durationMs))).toBe(true);
  expect(measurements[0].cpuThrottle).toBe(4);
 });
}
