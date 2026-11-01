import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { QA3_ROUTE_READINESS, qa3ScreenshotName } from '../../scripts/qa3-report';
import { enforceStressBudgets } from '../../scripts/stress-gate';
import { stressViolations } from '../../scripts/stress-limits';
import { measureSvgMarks } from '../../scripts/stress-marks';

// The ST-0 4× CPU hard budget is a first-attempt gate: a retry must never
// turn a >1,500ms cold Today paint into a green acceptance result.
test.describe.configure({retries:0});

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
  const readinessEvidence: Array<{route:string;actualRoute:string;profile:string;theme:string;width:number;heading:string;landmark:string;screenshot:string;sha256:string;ready:true}> = [];
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
   // Cold Today must render a real goal, not just a heading or skeleton.
   if(route==='/')await expect(page.getByRole('article',{name:/Goal progress for/}).first()).toBeVisible({timeout:90_000});
   // A heading and 40 characters also matched the missing-proposal error.
   // Check that the actual plan change, its amendments and idea tree loaded.
   if (route === '/proposals/proposal-6') {
    await expect(page.getByRole('heading', {name:'Plan change', exact:true, level:2})).toBeVisible();
    await expect(page.getByRole('region', {name:'Plan errata'})).toBeVisible();
    await expect(page.getByRole('region', {name:'Ideas in this plan'})).toBeVisible();
    await expect(page.getByText('This proposal could not be loaded.')).toHaveCount(0);
   }
   // FIX #586: the page shell and a heading are not a data-backed render.
   // Check a route-specific landmark and reject skeleton/error states before
   // taking the screenshot or claiming its visual evidence is ready.
   const readiness=QA3_ROUTE_READINESS[route];
   expect(routeHeadings[route]).toBe(readiness.heading);
   await expect(page.locator('html')).toHaveAttribute('data-theme',theme,{timeout:90_000});
   await expect(page.locator(readiness.landmark).first()).toBeVisible({timeout:90_000});
   if(route==='/cards'){
    await expect(page.locator('[data-card-row]').first()).toHaveAttribute(
     'href','#/cards/'+(profile==='extreme'?'30000':'5000'),{timeout:90_000});
    await expect(page.locator('[aria-live="polite"]').filter({hasText:'50 loaded'}))
     .toBeVisible({timeout:90_000});
   }
   if(route!=='/kit')await expect(page.locator('.animate-pulse.bg-fill-2')).toHaveCount(0,{timeout:90_000});
   await expect(page.getByText(/This (card|proposal) could not be loaded\./)).toHaveCount(0,{timeout:90_000});
   await expect(page.getByText('Session unavailable.')).toHaveCount(0,{timeout:90_000});
   // A loaded landmark below a retained scroll position still yields a blank
   // viewport. Reset to the route letterhead and prove its heading is painted.
   // Visually hidden semantic h1 elements are not a screenshot anchor. Use
   // the route's loaded form/control instead; keep the semantic heading check
   // above and require actual painted content in the captured viewport.
   const anchor=readiness.viewportAnchor
    ?page.locator(readiness.viewportAnchor).first()
    :page.getByRole('heading',{name:readiness.heading,exact:true,level:1});
   await page.evaluate(()=>{
    document.documentElement.style.setProperty('scroll-behavior','auto','important');
    window.scrollTo(0,0);
   });
   await anchor.scrollIntoViewIfNeeded({timeout:90_000});
   await expect(anchor).toBeInViewport({ratio:0.05,timeout:90_000});
   // React Router and Screen use finite Motion fades. A visible DOM heading
   // can still be visually blank while an ancestor is at opacity 0.
   await page.waitForFunction(()=>{
    const heading=document.querySelector('#main-content h1');
    if(!heading)return false;
    for(let el:Element|null=heading;el&&el.id!=='main-content';el=el.parentElement){
     if(Number(getComputedStyle(el).opacity)<0.99)return false;
    }
    return true;
   },null,{timeout:90_000});
   await page.evaluate(()=>new Promise<void>(resolve=>
    requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   // The browser's navigation clock measures first meaningful *paint*, not
   // Playwright's later scroll/opacity/readiness assertion round trips.
   // Keep all those assertions and the full screenshot gate unchanged. The
   // 1,500ms/4x budget still fails closed if the real painted-goal mark is
   // missing, invalid, or late. Log the host wall clock for diagnostics.
   let firstGoalPaintMs:number|null=null;
   if(route==='/'){
    const phases=await page.evaluate(()=>{
     const duration=(name:string)=>performance.getEntriesByName(name,'measure')[0]?.duration??null;
     const nav=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined;
     const paintMarks=performance.getEntriesByName('lemma-stress-first-goal-paint','mark');
     return {fixtureGenerateMs:duration('lemma-stress-fixture-generate'),
      fixtureHydrateMs:duration('lemma-stress-fixture-hydrate'),
      domContentLoadedMs:nav?.domContentLoadedEventEnd??null,
      loadedResources:performance.getEntriesByType('resource').length,
      homeQueryMs:duration('lemma-stress-home-query'),
      homeQueryStartMs:performance.getEntriesByName('lemma-stress-home-query','measure')[0]?.startTime??null,
      goalMountedMs:performance.getEntriesByName('lemma-stress-goal-mounted','mark')[0]?.startTime??null,
      firstGoalPaintMs:paintMarks.length===1?paintMarks[0].startTime:Number.NaN,
      firstContentfulPaintMs:(performance.getEntriesByType('paint') as PerformanceEntry[])
       .find(entry=>entry.name==='first-contentful-paint')?.startTime??null};
    });
    firstGoalPaintMs=phases.firstGoalPaintMs;
    console.info('ST-0 cold Today phase timings',JSON.stringify({profile,theme,width,
     ...phases,coldWallClockMs:Date.now()-start}));
   }
   const coldWallClockMs=Date.now()-start;
   const firstRenderMs=route==='/'?(firstGoalPaintMs??Number.NaN):coldWallClockMs;
   measurements.push(await measure(page,route,profile,theme,width,firstRenderMs,throttle));
   // Avoid counting the same cached resources again on subsequent hash routes.
   await page.evaluate(() => performance.clearResourceTimings());
   const screenshot=qa3ScreenshotName({profile,theme,width,filename:''},route);
   mkdirSync('test-results/screens/stress',{recursive:true});
   // Even after the DOM reports visible, finite Motion/WAAPI entrance frames
   // can leave the captured pixels as an empty Graph shell. Fast-forward those
   // animations for the evidence frame rather than certifying a blank PNG.
   const png=await page.screenshot({path:'test-results/screens/stress/'+screenshot,
    fullPage:false,animations:'disabled',timeout:30_000});
   const actualRoute=await page.evaluate(()=>location.hash.slice(1));
   expect(actualRoute).toBe(route);
   readinessEvidence.push({
    route,actualRoute,profile,theme,width,heading:readiness.heading,
    landmark:readiness.landmark,screenshot,
    sha256:createHash('sha256').update(png).digest('hex'),ready:true,
   });
  }
  await cdp.detach();
  // This manifest travels in the same screens-shard artifact as the PNGs.
  // The aggregate gate rejects absent, mismatched, or stale route evidence.
  writeFileSync('test-results/screens/stress/'+profile+'-'+theme+'-'+width+'-readiness.json',
   JSON.stringify(readinessEvidence,null,2));
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
