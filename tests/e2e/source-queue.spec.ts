import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
});

for(const theme of ['graph','graph-night'] as const){
 test('source queue shows size and extracted page progress in '+theme,async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./?demo=1&theme='+theme+'#/p/real-analysis?tab=sources');
  const sources=page.getByRole('region',{name:'Sources'});
  await sources.locator('input[type=file]').setInputFiles('tests/fixtures/sample.pdf');
  const queue=sources.getByRole('list',{name:'Source upload queue'});
  const row=queue.getByRole('listitem').first();
  await expect(row).toContainText('sample.pdf');
  await expect(row).toContainText(/\\d+(?:\\.\\d+)? (?:KB|MB)/);
  await expect(row.getByLabel('Upload status: ready')).toBeVisible({timeout:30000});
  await expect(row).toContainText(/\\d+\\/\\d+ pages read/);
  await expect(row.getByRole('button',{name:'Retry'})).toHaveCount(0);
  await page.screenshot({path:'test-results/screens/fix-397-queue-'+theme+'.png',fullPage:true});
 });
}

test('duplicate PDFs finish as already added without a futile retry',async({page})=>{
 await page.goto('./?demo=1#/p/real-analysis?tab=sources');
 const sources=page.getByRole('region',{name:'Sources'});
 await sources.locator('input[type=file]').setInputFiles([
  'tests/fixtures/sample.pdf','tests/fixtures/sample.pdf'
 ]);
 const rows=sources.getByRole('list',{name:'Source upload queue'}).getByRole('listitem');
 await expect(rows).toHaveCount(2);
 await expect(rows.nth(0).getByLabel('Upload status: ready')).toBeVisible({timeout:30000});
 await expect(rows.nth(1)).toContainText('Already added',{timeout:30000});
 await expect(rows.nth(1).getByRole('button',{name:'Retry'})).toHaveCount(0);
});
