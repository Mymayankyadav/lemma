import {test,expect} from '@playwright/test';

// FIX-648b: lazy create-sheet must still behave like the original eager
// Sheet after its first request, including focus, Escape and reopening.
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('Cards lazy New card sheet opens, closes and reopens '+theme+' '+width,async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width,height:width===360?740:844});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto('/lemma/?demo=1&theme='+theme+'#/cards',{waitUntil:'domcontentloaded'});
  await expect(page.locator('[data-card-row]').first()).toBeVisible();
  const trigger=page.getByRole('button',{name:'New card'});
  await expect(page.getByRole('dialog',{name:'New card'})).toHaveCount(0);
  await trigger.click();
  const dialog=page.getByRole('dialog',{name:'New card'});
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Front').fill('A draft that must not persist');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Front')).toHaveValue('');
  await dialog.getByRole('button',{name:'Close'}).click();
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
  await page.screenshot({path:'test-results/screens/fix-648b-cards-sheet-'+theme+'-'+width+'.png'});
 });
}
