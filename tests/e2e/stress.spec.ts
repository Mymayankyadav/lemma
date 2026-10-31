import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { stressViolations } from '../../scripts/stress-limits';
import { enforceStressBudgets } from '../../scripts/stress-gate';
import { measureSvgMarks } from '../../scripts/stress-marks';

type Measurement = {
 route: string; actualRoute: string; profile: string; theme: string; width: number;
 nodes: number; horizontalOverflow: number; smallText: number; smallMath: number;
 smallTargets: number; minCircleGap: number | null; durationMs: number;
 requestCount: number; transferBytes: number; cpuThrottle: number;
 smallTextSamples: {size:string;inMath:boolean;html:string}[];
 closeCircleSamples: {gap:number;svg:string}[];
};

/** Record all hard-limit violations before downstream ST-1…ST-7 make them pass. */
async function measure(page: Page, route: string, profile: string, theme: string, width: number, durationMs: number, cpuThrottle: number): Promise<Measurement> {
 const result = await page.evaluate(() => {
  const visible = (e: Element) => {
   const r = e.getBoundingClientRect(), s = getComputedStyle(e);
   return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const elements = Array.from(document.querySelectorAll('*')).filter(visible);
  const undersizedText = elements.filter(e => {
   const s = getComputedStyle(e);
   // KaTeX scriptstyle glyphs are part of one mathematical expression;
   // the expression itself is checked separately against the 16px maths floor.
   return !e.closest('.katex') && e.children.length === 0 && !!e.textContent?.trim() && parseFloat(s.fontSize) < 12;
  });
  const smallText = undersizedText.length;
  // Diagnostic evidence only: retain the exact hard-budget measurement.
  const smallTextSamples = undersizedText.slice(0,6).map(e => ({
   size: getComputedStyle(e).fontSize,
   inMath: !!e.closest('.katex'),
   html: e.outerHTML.slice(0,180),
  }));
  const smallMath = elements.filter(e => e.classList.contains('katex') && parseFloat(getComputedStyle(e).fontSize) < 16).length;
  const smallTargets = elements.filter(e => e.matches('button,a[href],[role="button"]') && (e.getBoundingClientRect().width < 44 || e.getBoundingClientRect().height < 44)).length;
  const resources = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
   .filter(entry => /\/(rest|functions)\/v1\//.test(entry.name));
  return {
   nodes: document.querySelectorAll('*').length,
   horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
   smallText, smallMath, smallTargets,
   smallTextSamples, closeCircleSamples: [],
   requestCount: resources.length,
   transferBytes: resources.reduce((total,entry)=>total+entry.transferSize,0),
  };
 });
 const minCircleGap = await page.evaluate(measureSvgMarks); // Compatibility field: now all tagged SVG count marks.
 return {route, actualRoute: await page.evaluate(()=>location.hash.slice(1)), profile, theme, width, durationMs, cpuThrottle, ...result, minCircleGap};
}

test('ST-0 counts small informative text but not KaTeX internal script glyphs',async({page})=>{
 await page.setContent('<div style="font-size:11px">Informative label</div><span class="katex" style="font-size:16px"><span style="font-size:9px">script glyph</span></span>');
 const measured=await measure(page,'/probe','probe','graph',390,0,1);
 expect(measured.smallText).toBe(1);
 expect(measured.smallMath).toBe(0);
});

// Full route inventory, matching the normal mobile layout audit.
const routes = [
 '/', '/projects', '/projects/new', '/p/real-analysis', '/p/real-analysis/cp/CP4',
 '/s/real-analysis/7', '/proposals', '/proposals/proposal-6', '/review',
 '/review/run', '/review/done', '/cards', '/cards/31', '/atlas',
 '/insights', '/settings', '/sign-in', '/kit',
] as const;
// Require the new route's own heading before measuring. The previous route
// remains mounted briefly during HashRouter transitions, so checking only that
// #main-content has text can capture stale screens under heavy stress data.
const routeHeadings: Record<(typeof routes)[number], string> = {
 '/': 'Home', '/projects': 'Paths', '/projects/new': 'New project',
 '/p/real-analysis': 'Project', '/p/real-analysis/cp/CP4': 'Checkpoint',
 '/s/real-analysis/7': 'Session record', '/proposals': 'Approve',
 '/proposals/proposal-6': 'Plan proposal', '/review': 'Review',
 '/review/run': 'Card review', '/review/done': 'Review complete',
 '/cards': 'Cards', '/cards/31': 'Card detail', '/atlas': 'Atlas',
 '/insights': 'Insights', '/settings': 'Settings',
 '/sign-in': 'Sign in', '/kit': 'Component kit',
};
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
   // Load the 30,000-card extreme fixture once per test, not once per route.
   // HashRouter navigation still exercises every screen and its route hooks,
   // while avoiding 18 full fixture regenerations and the 15-minute CI timeout.
   if(index===0){
    await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#'+route, {waitUntil:'domcontentloaded',timeout:90_000});
   }else{
    await page.evaluate(nextRoute => {window.location.hash=nextRoute},route);
   }
   await expect(page.locator('#main-content')).toBeVisible({timeout:90_000});
   await expect(page.getByRole('heading', {name:routeHeadings[route], exact:true, level:1})).toBeVisible({timeout:90_000});
   await page.waitForFunction(() => (document.querySelector('#main-content')?.textContent?.trim().length ?? 0) > 40, null, {timeout:90_000});
   // A heading and 40 characters also matched the missing-proposal error.
   // Check that the actual plan change, its amendments and idea tree loaded.
   if (route === '/proposals/proposal-6') {
    await expect(page.getByRole('heading', {name:'Plan change', exact:true, level:2})).toBeVisible();
    await expect(page.getByRole('region', {name:'Plan errata'})).toBeVisible();
    await expect(page.getByRole('region', {name:'Ideas in this plan'})).toBeVisible();
    await expect(page.getByText('This proposal could not be loaded.')).toHaveCount(0);
   }
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
  // Log bounded concrete examples when the strict gate is red; never mask a failure.
  for(const row of report.filter(row=>row.violations.length)){
   console.info('ST-0 hard-budget measurement',JSON.stringify({route:row.route,profile,theme,width,
    durationMs:row.durationMs,cpuThrottle:row.cpuThrottle,violations:row.violations}));
   if(row.violations.some(v=>v==='text below 12px'||v==='marks closer than 8px'))
    console.info('ST-0 offender samples',JSON.stringify({route:row.route,profile,theme,width,
     text:row.smallTextSamples,marks:row.closeCircleSamples}));
  }
  writeFileSync(file,JSON.stringify(report,null,2));
  await testInfo.attach('stress-measurements',{body:JSON.stringify(report,null,2),contentType:'application/json'});
  // ST-0 establishes the baseline and route inventory. ST-1…ST-7 enforce
  // the hard thresholds once the known pre-existing scale failures are fixed.
  expect(measurements.map(m=>m.route)).toEqual([...routes]);
  expect(measurements.every(m=>m.nodes>0 && Number.isFinite(m.durationMs))).toBe(true);
  expect(measurements[0].cpuThrottle).toBe(4);
  enforceStressBudgets(measurements);
 });
}
