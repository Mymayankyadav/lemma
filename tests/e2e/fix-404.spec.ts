import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

test.beforeEach(async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
});

for(const world of ['graph','graph-night'] as const){
 test('Completed PDF remains retry-safe after its File is released in '+world,async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto('./?demo=1&theme='+world+'#/projects/new');
  await page.getByRole('textbox',{name:'Name'}).fill('Topology Exercises');
  const pdf=readFileSync('tests/fixtures/sample.pdf');
  await page.locator('input[type=file]').setInputFiles([
   {name:'notes.pdf',mimeType:'application/pdf',buffer:pdf},
   {name:'problem-set.pdf',mimeType:'application/pdf',buffer:pdf}
  ]);
  await page.getByRole('button',{name:'Create project'}).click();
  const queue=page.getByRole('list',{name:'Upload queue'});
  const first=queue.locator('li').first();
  await expect(first).toContainText('notes.pdf');
  await expect(first).toContainText('ready',{timeout:30000});
  await expect(queue.locator('li').nth(1)).toContainText('Already added');
  await expect(page.getByRole('button',{name:'Retry remaining uploads'})).toBeVisible();
  await page.screenshot({path:'test-results/screens/fix-404-retry-'+world+'.png',fullPage:true});

  await page.getByRole('button',{name:'Remove problem-set.pdf'}).click();
  await expect(queue.locator('li')).toHaveCount(1);
  await expect(first).toContainText('ready');
  await page.getByRole('button',{name:'Create project'}).click();
  await expect(page).toHaveURL(/#\/p\/topology-exercises\?tab=sources$/);
  await expect(page.getByRole('region',{name:'Sources'}).getByText('notes',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:'test-results/screens/fix-404-complete-'+world+'.png',fullPage:true});
  expect(errors).toEqual([]);
 });
}
