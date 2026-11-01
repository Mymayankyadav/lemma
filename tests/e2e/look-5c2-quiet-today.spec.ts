import {expect, test} from '@playwright/test';

// LOOK-5c2: the bottom of Today remains one quiet review row and one handoff
// card even when the owner has tens of thousands of cards and long maths.
for (const profile of ['stress','extreme'] as const)
for (const theme of ['graph','graph-night'] as const)
for (const width of [360,390] as const) {
 test(`LOOK-5c2 quiet Today ${profile} ${theme} ${width}px`,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height:844});
  await page.goto(`./?demo=${profile}&theme=${theme}&reviewSparkFixture=adjacent#/`);
  const review=page.getByRole('region',{name:'Review',exact:true});
  await expect(review).toBeVisible({timeout:90_000});
  const start=review.getByRole('link',{name:/Start review of [\d,]+ cards/i});
  await expect(start).toBeVisible();
  const startBox=await start.boundingBox();
  expect(startBox).not.toBeNull();
  expect(startBox!.height).toBeGreaterThanOrEqual(44);
  expect(startBox!.width).toBeGreaterThanOrEqual(44);
  await expect(page.getByLabel('Due cards by project')).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Cards',exact:true})).toHaveCount(0);
  const forecast=review.getByLabel('Seven-day review forecast');
  await expect(forecast).toBeVisible({timeout:90_000});
  await expect(forecast.locator('.grid > div')).toHaveCount(7);
  // A deterministic demo-only forecast paints two neighbouring days. The
  // previous single-bar fixture could not detect 7px painted-edge gaps.
  const bars=forecast.locator('[data-review-spark-bar]');
  await expect(bars).toHaveCount(7);
  const painted=await bars.evaluateAll(elements=>elements.map(element=>{
   const box=element.getBoundingClientRect();
   return {left:box.left,right:box.right,height:box.height};
  }));
  expect(painted[0].height).toBeGreaterThan(0);
  expect(painted[1].height).toBeGreaterThan(0);
  for(let i=0;i<painted.length-1;i++){
   if(painted[i].height<=0||painted[i+1].height<=0)continue;
   const edgeGap=painted[i+1].left-painted[i].right;
   expect(edgeGap,`painted Review spark bars ${i} and ${i+1} must clear 8px`).toBeGreaterThanOrEqual(8-0.01);
  }
  const handoff=page.getByRole('region',{name:'Study handoff'});
  await expect(handoff).toBeVisible();
  const continueSection=handoff.getByRole('region',{name:'Continue'});
  await expect(continueSection).toBeVisible();
  const resume=continueSection.getByRole('region',{name:'Resume where you stopped'});
  await expect(resume).toBeVisible();
  expect((await resume.boundingBox())!.height).toBeGreaterThanOrEqual(64);
  const copy=resume.getByRole('button',{name:'Copy resume prompt'});
  const bounds=await copy.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  const smallMath=await page.locator('#main-content .katex').evaluateAll(nodes=>
   nodes.filter(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&parseFloat(getComputedStyle(node).fontSize)<16}).length);
  expect(smallMath).toBe(0);
  await page.screenshot({path:`test-results/screens/look-5c2-${profile}-${theme}-${width}.png`,fullPage:true});
 });
}
