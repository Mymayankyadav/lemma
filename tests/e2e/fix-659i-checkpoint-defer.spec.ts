import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

test('FIX-659i Project Route stays usable before supplemental checkpoint detail resolves',async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
 await page.goto('/lemma/?demo=1&theme=graph#/p/real-analysis');
 await expect(page.getByRole('region',{name:'Project timeline'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Stages'})).toBeVisible();
 const current=page.getByRole('article',{name:'Current checkpoint CP4'});
 await expect(current).toBeVisible();
 await expect(current.getByRole('button',{name:'Resume'})).toBeVisible();
 const details=current.getByRole('link',{name:'Details for CP4'});
 await expect(details).toBeVisible();
 // The independent checkpoint query must still hydrate the original objective,
 // source pages and sessions after the Route is painted.
 await expect(current).toContainText('Prove compact sets in a Hausdorff space are closed.');
 await expect(current).toContainText('p. 36-40');
 await expect(current).toContainText('sessions');
 mkdirSync('test-results/screens/fix-659i',{recursive:true});
 await page.screenshot({path:'test-results/screens/fix-659i/project-detail-after-paint.png',fullPage:true,animations:'disabled'});
 await details.click();
 await expect(page.getByRole('dialog',{name:'Compactness'})).toBeVisible();
});

for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX-659i current checkpoint survives deferred hydration: '+profile+' '+theme+' '+width,async({page})=>{
  await page.setViewportSize({width,height:width===360?740:844});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/p/real-analysis');
  await expect(page.getByRole('region',{name:'Project timeline'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Stages'})).toBeVisible();
  const current=page.getByRole('article',{name:'Current checkpoint CP4'});
  await expect(current.getByRole('button',{name:'Resume'})).toBeVisible();
  await expect(current.getByRole('link',{name:'Details for CP4'})).toBeVisible();
  await expect(current).toContainText('Prove compact sets in a Hausdorff space are closed.');
  const metrics=await page.evaluate(()=>{
   const article=document.querySelector('[aria-label="Current checkpoint CP4"]');
   const resume=article?.querySelector('button');
   const detail=article?.querySelector('a[aria-label="Details for CP4"]');
   const size=(element:Element|null|undefined)=>{
    const box=element?.getBoundingClientRect();
    return {width:box?.width??0,height:box?.height??0};
   };
   return {nodes:document.querySelectorAll('*').length,
    overflow:document.documentElement.scrollWidth-innerWidth,
    resume:size(resume),detail:size(detail)};
  });
  expect(metrics.nodes).toBeLessThan(1500);
  expect(metrics.overflow).toBeLessThanOrEqual(0);
  expect(metrics.resume.height).toBeGreaterThanOrEqual(44);
  expect(metrics.detail.width).toBeGreaterThanOrEqual(44);
  expect(metrics.detail.height).toBeGreaterThanOrEqual(44);
  mkdirSync('test-results/screens/fix-659i',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-659i/checkpoint-'+profile+'-'+theme+'-'+width+'.png',animations:'disabled'});
 });
}
