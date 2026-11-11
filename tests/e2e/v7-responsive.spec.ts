import {test,expect} from '@playwright/test';
import {at,NOW,openScene,shots} from './v7-scenes';
test.use({locale:'en-IN',timezoneId:'Asia/Kolkata'});
for(const scheme of ['light','dark'] as const)for(const width of [768,1280])for(const name of ['today','calendar-day']){
 test(`C3: ${name} at ${width} in ${scheme} uses its responsive layout`,async({page},testInfo)=>{
  await openScene(page,shots.find(scene=>scene.name===name)!,scheme,{width,height:800});
  const rail=await page.locator('.v7-dock').boundingBox(),main=await page.getByRole('main').boundingBox();
  expect(Math.round(rail!.width)).toBe(width>=1100?248:72);
  expect(main!.x).toBeGreaterThanOrEqual(rail!.x+rail!.width-1);
  await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('link')).toHaveCount(5);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
  if(width>=1100){
   await expect(page.getByRole('navigation',{name:'Library'})).toBeVisible();
   if(name==='today'){
    const calendar=page.getByRole('complementary',{name:"Today's calendar"});
    await expect(calendar.getByRole('region',{name:'Day time grid'})).toBeVisible();
    const grid=await calendar.boundingBox(),hero=await page.getByRole('region',{name:'Your next step'}).boundingBox();
    expect(grid!.x).toBeGreaterThan(hero!.x+hero!.width);
   }else{
    const panel=page.getByRole('complementary',{name:'Selected day'});
    await expect(panel.getByRole('group',{name:'Choose a date'}).getByRole('button')).toHaveCount(42);
    expect(Math.round((await panel.boundingBox())!.width)).toBe(280);
   }
  }
  await testInfo.attach(`${name}-${width}x800-${scheme}`,{body:await page.screenshot({animations:'disabled'}),contentType:'image/png'});
 });
}
test('Desktop default Calendar is Week; N, Ctrl K, destination keys and shortcuts work',async({page})=>{
 await page.setViewportSize({width:1280,height:800});await page.clock.setFixedTime(NOW);
 await page.goto(at('/calendar'));
 await expect(page.getByRole('radio',{name:'Week',exact:true})).toHaveAttribute('aria-checked','true');
 await page.keyboard.press('n');await expect(page.getByRole('dialog',{name:'Capture',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await page.keyboard.press('Control+k');
 await expect(page.getByRole('textbox',{name:/Search/})).toBeFocused();
 await page.keyboard.press('Escape');await page.keyboard.press('1');
 await expect(page.getByRole('main',{name:'Today'})).toBeVisible();
 await page.keyboard.press('?');await expect(page.getByRole('dialog',{name:'Keyboard shortcuts'})).toBeVisible();
});
