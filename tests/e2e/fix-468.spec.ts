import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX #468 Review has one forgetting curve before grading: '+theme+' '+width,async({page})=>{
  await page.setViewportSize({width,height:740});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  const base='/lemma/?demo=1&theme='+theme+'#';
  await page.goto(base+'/review');
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await expect(page.getByRole('heading',{name:'Review',level:1})).toBeVisible();
  const sketch=page.locator('svg[data-graph-sketch="review"]');
  await expect(sketch).toHaveCount(1);
  await expect(sketch.locator('path[stroke="var(--accent)"]')).toHaveCount(1);
  await expect(sketch.locator('path[stroke-dasharray]')).toHaveCount(0);
  mkdirSync('test-results/screens/fix-468',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-468/'+theme+'-'+width+'.png'});
  await page.goto(base+'/review/done');
  await expect(page.getByRole('heading',{name:'Review complete',level:1})).toBeVisible();
  await expect(page.locator('[data-graph-sketch]')).toHaveCount(0);
  await page.goto(base+'/review/run');
  await expect(page.locator('[data-graph-sketch]')).toHaveCount(0);
 });
}

for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX #468 dotted second curve appears only after a graded round: '+theme+' '+width,async({page})=>{
  await page.setViewportSize({width,height:740});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.goto('/lemma/?demo=1&theme='+theme+'#/review');
  const sketch=page.locator('svg[data-graph-sketch="review"]');
  await expect(sketch.locator('path[stroke-dasharray]')).toHaveCount(0);
  await page.getByRole('button',{name:'Start review'}).click();
  await expect(page.locator('[data-graph-sketch]')).toHaveCount(0);
  await page.getByRole('button',{name:'Sure',exact:true}).click();
  await page.getByRole('button',{name:'Grade Good'}).click();
  await page.getByRole('button',{name:'Close review'}).click();
  await expect(page.getByRole('heading',{name:'Review complete',level:1})).toBeVisible();
  await expect(page.locator('[data-graph-sketch]')).toHaveCount(0);
  await page.getByRole('link',{name:'Review more'}).click();
  await expect(sketch).toBeVisible();
  await expect(sketch.locator('path[stroke-dasharray]')).toHaveCount(1);
  mkdirSync('test-results/screens/fix-468',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-468/after-'+theme+'-'+width+'.png'});
 });
}
