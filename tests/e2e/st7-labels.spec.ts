import {test,expect} from '@playwright/test';

// The original ST-7 failure was first-attempt only. Never hide it by retry.
test.describe.configure({retries:0});

// ST-7 I3 survives the v4 removal of the stacked due-by-project legend:
// a long, unbroken mathematical Continue title must still clip within 360px.
for(const theme of ['graph','graph-night'] as const){
 test(`ST-7 Continue clips unbroken mathematical titles on a 360px phone (${theme})`,async({page})=>{
  await page.setViewportSize({width:360,height:740});
  await page.goto(`/lemma/?demo=1&theme=${theme}#/`);
  const handoff=page.getByRole('region',{name:'Resume where you stopped'});
  await expect(handoff).toBeVisible();
  const name=handoff.locator('[data-resume-meta]');
  await expect(name).toBeVisible();
  expect((await name.getAttribute('title'))?.length).toBeGreaterThan(0);
  // Simulate the 80-character/unbroken-token stress case without mutating
  // the demo fixture or adding production-only test hooks.
  await name.evaluate(node=>{node.textContent='A'.repeat(160)});
  await expect(name).toHaveCSS('white-space','nowrap');
  await expect(name).toHaveCSS('text-overflow','ellipsis');
  const bounds=await page.evaluate(()=>{
   const name=document.querySelector('[data-resume-meta]')!;
   return {page:document.documentElement.scrollWidth,viewport:window.innerWidth,
    labelScroll:name.scrollWidth,labelWidth:name.clientWidth};
  });
  expect(bounds.labelScroll).toBeGreaterThan(bounds.labelWidth);
  expect(bounds.page).toBeLessThanOrEqual(bounds.viewport);
  await name.scrollIntoViewIfNeeded();
  await expect(name).toBeInViewport();
  await page.screenshot({path:`test-results/screens/st-7-continue-360-${theme}.png`});
 });
}

test('FIX #760 Continue remains reachable after real lazy goals hydrate above it',async({page})=>{
 test.setTimeout(60_000);
 await page.setViewportSize({width:360,height:740});
 let unblock!:()=>void;
 let intercepted!:()=>void;
 const gate=new Promise<void>(resolve=>{unblock=resolve});
 const sawChunk=new Promise<void>(resolve=>{intercepted=resolve});
 // Stall the actual built GoalDistance chunk, not the app's data or a mock
 // component. The original 160px fallback lets the real cards move Continue
 // out of view after the owner scrolls to it.
 await page.route('**/assets/GoalDistance-*.js',async route=>{
  intercepted();
  await gate;
  await route.continue();
 });
 try{
  await page.goto('/lemma/?demo=1&theme=graph#/',{waitUntil:'domcontentloaded'});
  await sawChunk;
  const handoff=page.getByRole('region',{name:'Resume where you stopped'});
  await expect(handoff).toBeVisible();
  await handoff.scrollIntoViewIfNeeded();
  await expect(handoff).toBeInViewport();
  const before=await handoff.evaluate(node=>node.getBoundingClientRect().top);
  unblock();
  // Wait for the real three GoalCard components, including nested lazy
  // modules; only then test whether the earlier scroll was preserved.
  await expect(page.locator('[data-goal-card]')).toHaveCount(3);
  const after=await handoff.evaluate(node=>node.getBoundingClientRect().top);
  expect(after-before,'deferred goal cards must not shift Continue below the viewport').toBeLessThan(80);
  await expect(handoff).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
 }finally{
  unblock();
 }
});
