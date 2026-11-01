import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

// FIX #655: a checkpoint remains a sheet over the actual project, but the
// project chooser is not needed until someone opens it. These checks guard
// the user journey while the cold CP4 4x CPU budget is measured by FIX #540.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [390,360] as const){
 test('FIX #655 checkpoint keeps real background and on-demand project chooser: '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height:width===360?740:844});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',r=>r.fulfill({body:''}));
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/p/real-analysis/cp/CP4',{waitUntil:'domcontentloaded',timeout:90_000});
  await expect(page.getByRole('heading',{name:'Checkpoint',level:1})).toBeVisible({timeout:90_000});
  const backdrop=page.locator('[data-sheet-background]');
  await expect(backdrop).toHaveAttribute('inert','');
  await expect(backdrop.getByRole('region',{name:'Checkpoint progress',includeHidden:true})).toBeAttached({timeout:90_000});
  await expect(page.getByRole('dialog',{name:'Compactness'})).toBeVisible({timeout:90_000});
  await expect(page.getByRole('region',{name:'Checkpoint steps'})).toBeVisible({timeout:90_000});
  await expect(page.getByRole('dialog',{name:'Switch project'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  expect(await page.locator('*').count()).toBeLessThan(1500);
  mkdirSync('test-results/screens/fix-655',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-655/'+profile+'-'+theme+'-'+width+'.png'});
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await expect(page).toHaveURL(/#\/p\/real-analysis$/);
  const open=page.getByRole('button',{name:/Switch project from/});
  await expect(open).toBeVisible();
  await open.click();
  const chooser=page.getByRole('dialog',{name:'Switch project'});
  await expect(chooser.getByRole('searchbox',{name:'Find a project'})).toBeVisible();
  await chooser.getByRole('button',{name:'Close'}).click();
  await expect(chooser).toHaveCount(0);
 });
}
