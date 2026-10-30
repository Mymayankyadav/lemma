import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
});

for(const theme of ['graph','graph-night'] as const){
 test('Sources shows honest storage usage in '+theme,async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./?demo=1&theme='+theme+'#/p/real-analysis?tab=sources');
  const sources=page.getByRole('region',{name:'Sources'});
  const storage=sources.getByRole('group',{name:'Source storage'});
  await expect(storage).toContainText('At least 0 KB / 1 GB');
  await expect(storage).toContainText(/source sizes unknown/);
  await sources.locator('input[type=file]').setInputFiles('tests/fixtures/sample.pdf');
  const queue=sources.getByRole('list',{name:'Source upload queue'});
  await expect(queue.getByLabel('Upload status: ready')).toBeVisible({timeout:30000});
  await expect(storage).toContainText('At least 2 KB / 1 GB');
  await expect(storage.getByRole('progressbar',{name:'PDF storage used'}))
   .toHaveAttribute('aria-valuetext','At least 2 KB of 1 GB');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button',{name:'Dismiss notification'}).click();
  await expect(page.getByRole('status').filter({hasText:'PDF added'})).toHaveCount(0);
  await page.screenshot({path:'test-results/screens/fix-399-storage-'+theme+'.png',fullPage:true});
 });
}
