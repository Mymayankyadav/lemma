import {test,expect} from '@playwright/test';
test.use({locale:'en-IN',timezoneId:'Asia/Kolkata'});
for(const viewport of [{width:390,height:844},{width:1280,height:800}]){
 test(`N121 A2 Card Filters dialog is centred and its footer clickable at ${viewport.width}`,async({page})=>{
  await page.setViewportSize(viewport);
  await page.goto('/?demo=1&flags=v6Shell#/cards');
  await page.getByRole('button',{name:'Filters',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Filter cards'});
  await expect(dialog).toBeVisible();
  const bounds=await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(Math.abs(bounds!.x-(viewport.width-bounds!.x-bounds!.width))).toBeLessThanOrEqual(2);
  if(viewport.width>=700)
   expect(Math.abs(bounds!.y-(viewport.height-bounds!.y-bounds!.height))).toBeLessThanOrEqual(2);
  const apply=dialog.getByRole('button',{name:'Apply filters'});
  await apply.click({trial:true,timeout:3000});
  await apply.click();
  await expect(dialog).toBeHidden();
 });
}
test('N121 A2 Escape closes filter modal and restores its opener',async({page})=>{
 await page.goto('/?demo=1&flags=v6Shell#/cards');
 const opener=page.getByRole('button',{name:'Filters',exact:true});
 await opener.click();
 await expect(page.getByRole('dialog',{name:'Filter cards'})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog',{name:'Filter cards'})).toBeHidden();
 await expect(opener).toBeFocused();
});
