import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
});

for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('LOOK-3c project Route replaces both Metro rails: '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(180_000);
  await page.setViewportSize({width,height:width===360?740:844});
  await page.goto('./?demo='+profile+'&theme='+theme+'#/p/real-analysis');
  const region=page.getByRole('region',{name:'Project timeline'});
  const route=region.locator('[data-route-mode="project"]');
  await expect(route).toBeVisible({timeout:90_000});
  await expect(region.locator('[data-stage-rail],[data-expanded-stations]')).toHaveCount(0);
  await expect(route.locator('[data-route-track]')).toHaveCount(1);
  for(const label of ['Previous checkpoint','Next checkpoint','Open checkpoint']){
   const button=route.getByRole('button',{name:label});
   const rect=await button.boundingBox();
   expect(rect).not.toBeNull();
   expect(rect!.width).toBeGreaterThanOrEqual(44);
   expect(rect!.height).toBeGreaterThanOrEqual(44);
  }
  const track=await route.locator('[data-route-track]').boundingBox();
  expect(track).not.toBeNull();
  expect(track!.height).toBe(80);
  // ST-0 A1: every visible station/capsule retains at least 8px
  // edge clearance even when 100 checkpoints fold into stage capsules.
  const marks=await route.locator('[data-route-mark]').evaluateAll(elements=>elements.map(el=>{
   const rect=el.getBoundingClientRect();
   return {left:rect.left,right:rect.right};
  }).sort((a,b)=>a.left-b.left));
  expect(marks.length).toBeGreaterThan(1);
  for(let i=1;i<marks.length;i++)
   expect(marks[i].left-marks[i-1].right,`Route mark gap ${i}`).toBeGreaterThanOrEqual(7.5);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(0);
  await route.screenshot({path:'test-results/screens/look-3c/'+profile+'-'+theme+'-'+width+'.png'});
 });
}
test('LOOK-3c Today goal Route is one link to the current checkpoint',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('./?demo=1&theme=graph-night#/');
 const goal=page.getByRole('article',{name:/Goal progress for Real Analysis/});
 const route=goal.locator('[data-route-mode="today"]');
 await expect(route).toBeVisible();
 await expect(route.getByRole('link')).toHaveCount(1);
 await expect(goal.locator('[data-stage-rail],[data-expanded-stations]')).toHaveCount(0);
 const link=route.getByRole('link');
 expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(64);
 await link.click();
 await expect(page).toHaveURL(/\/p\/real-analysis\/cp\/CP4/);
});
test('LOOK-3c project Route keyboard stepper crosses stages and opens the selection',async({page})=>{
 await page.goto('./?demo=1&theme=graph#/p/real-analysis');
 const route=page.getByRole('region',{name:'Project timeline'}).locator('[data-route-mode="project"]');
 await expect(route).toBeVisible();
 await route.getByRole('button',{name:'Next checkpoint'}).click();
 // Proposed CP4a remains reachable; the stepper must not skip it.
 await expect(route.locator('[data-route-now]')).toContainText('CP4a');
 await expect(route.locator('[data-route-now]')).toContainText('Proposed · 4 of 12');
 await route.getByRole('button',{name:'Next checkpoint'}).click();
 await expect(route.locator('[data-route-now]')).toContainText('CP5');
 await expect(route.locator('[data-route-now]')).toContainText('5 of 12');
 await route.getByRole('button',{name:'Previous checkpoint'}).click();
 await expect(route.locator('[data-route-now]')).toContainText('CP4a');
 await route.getByRole('button',{name:'Previous checkpoint'}).click();
 await expect(route.locator('[data-route-now]')).toContainText('CP4');
 await route.locator('button[aria-label*="Arrow keys select"]').focus();
 await page.keyboard.press('ArrowRight');
 await expect(route.locator('[data-route-now]')).toContainText('CP4a');
 await page.keyboard.press('Enter');
 await expect(page).toHaveURL(/\/cp\/CP4a/);
});

for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('LOOK-3c compact Today goal stays within 210px '+theme+' '+width,async({page})=>{
  await page.setViewportSize({width,height:width===360?740:844});
  await page.goto('./?demo=1&theme='+theme+'#/');
  const goal=page.getByRole('article',{name:/Goal progress for Real Analysis/});
  await expect(goal.locator('[data-route-mode="today"]')).toBeVisible();
  const rect=await goal.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.height).toBeLessThanOrEqual(210);
  await expect(goal.locator('[data-goal-now]')).toContainText('CP4');
  await expect(goal.locator('[data-schedule-chip]')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(0);
  await goal.screenshot({path:'test-results/screens/look-3c/goal-'+theme+'-'+width+'.png'});
 });
}
