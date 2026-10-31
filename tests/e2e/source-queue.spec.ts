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
  await expect(row).toContainText(/\d+(?:\.\d+)? (?:KB|MB)/);
  await expect(row.getByLabel('Upload status: ready')).toBeVisible({timeout:30000});
  await expect(row).toContainText(/\d+\/\d+ pages read/);
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


// Audit #510: compact source actions must retain a 44×44 CSS-pixel hit area.
for(const theme of ['graph','graph-night'] as const)
for(const [width,height] of [[390,844],[360,740]] as const){
 test('FIX #510 Sources edit/delete/retry tap targets '+theme+' '+width+'px',async({page})=>{
  test.setTimeout(60_000);
  await page.setViewportSize({width,height});
  await page.goto('./?demo=1&theme='+theme+'#/p/real-analysis?tab=sources');
  const sources=page.getByRole('region',{name:'Sources'});
  await expect(sources.getByText('Principles of Mathematical Analysis')).toBeVisible();
  const assertTarget=async(button:ReturnType<typeof sources.getByRole>)=>{
   await expect(button).toBeVisible();
   const rect=await button.boundingBox();
   expect(rect,'visible hit rectangle').not.toBeNull();
   expect(rect!.width,'tap width for '+await button.textContent()).toBeGreaterThanOrEqual(44);
   expect(rect!.height,'tap height for '+await button.textContent()).toBeGreaterThanOrEqual(44);
  };
  await sources.getByRole('button',{name:'Edit',exact:true}).first().click();
  await assertTarget(sources.getByRole('button',{name:'Save',exact:true}));
  await assertTarget(sources.getByRole('button',{name:'Cancel',exact:true}));
  await page.screenshot({path:'test-results/screens/fix-510-edit-'+theme+'-'+width+'.png'});
  await sources.getByRole('button',{name:'Cancel',exact:true}).click();
  await sources.getByRole('button',{name:/^Delete Principles of Mathematical Analysis$/}).click();
  const confirm=sources.getByRole('group',{name:/^Confirm deletion of Principles of Mathematical Analysis$/});
  await assertTarget(confirm.getByRole('button',{name:'Delete',exact:true}));
  await assertTarget(confirm.getByRole('button',{name:'Cancel',exact:true}));
  await page.screenshot({path:'test-results/screens/fix-510-delete-'+theme+'-'+width+'.png'});
  await confirm.getByRole('button',{name:'Cancel',exact:true}).click();

  // A nonempty but whitespace-only Markdown source fails extraction and remains retryable.
  await sources.locator('input[type=file]').setInputFiles({
   name:'empty-510.md',mimeType:'text/markdown',buffer:Buffer.from('   \n  ')
  });
  const failed=sources.getByRole('list',{name:'Source upload queue'}).getByRole('listitem').filter({hasText:'empty-510.md'});
  await expect(failed.getByRole('button',{name:'Retry'})).toBeVisible({timeout:30_000});
  await assertTarget(failed.getByRole('button',{name:'Retry'}));
  await failed.getByRole('button',{name:'Retry'}).scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-results/screens/fix-510-retry-'+theme+'-'+width+'.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:'test-results/screens/fix-510-'+theme+'-'+width+'.png'});
 });
}
