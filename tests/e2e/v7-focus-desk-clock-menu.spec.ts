import {expect,test} from '@playwright/test';
import {at,NOW} from './v7-scenes';

for(const touch of [false,true]){
 test.describe(touch?'desk clock on a touch screen':'desk clock on desktop',()=>{
  test.use({hasTouch:touch,viewport:touch?{width:390,height:844}:{width:1440,height:900}});
  test('Timer details stays operable at 0, 4, 8 and 15 seconds',async({page})=>{
   await page.clock.install({time:NOW});
   await page.goto(at('/').replace('-v7DeskClock','v7DeskClock'));
   await page.getByRole('button',{name:/^(Start now|Start focus)$/}).first().click();
   const focus=page.getByRole('main',{name:'Focus',exact:true}),timer=focus.getByRole('button',{name:'Timer details',exact:true});
   const chrome=focus.locator('.v7-immersive-header'),footer=focus.getByRole('region',{name:'Session controls'});
   const timerMenu=page.getByRole('dialog',{name:'Timer',exact:true});
   for(const seconds of [0,4,8,15]){
    await timer.click();
    await timerMenu.getByRole('menuitem',{name:'Desk clock',exact:true}).click();
    await expect(focus).toHaveAttribute('data-desk','');
    await expect(timer).toBeFocused();

    await timer.click();
    const leave=timerMenu.getByRole('menuitem',{name:'Leave the desk clock',exact:true});
    await expect(leave).toBeVisible();
    if(seconds)await page.clock.fastForward(seconds*1000);
    await expect(chrome).toHaveCSS('opacity','1');
    await expect(footer).toHaveCSS('opacity','1');
    if(touch)await leave.tap();
    else if(seconds>0)await leave.press('Enter');
    else await leave.click();
    await expect(focus).not.toHaveAttribute('data-desk','');
    await expect(timer).toBeFocused();
   }
   await timer.click();
   await timerMenu.getByRole('menuitem',{name:'Desk clock',exact:true}).click();
   await expect(timer).toBeFocused();
   await focus.getByRole('button',{name:/^Intention:/}).focus();
   await page.clock.fastForward(4200);
   await expect(chrome).toHaveCSS('opacity','0');
   await expect(footer).toHaveCSS('opacity','0');
   await focus.getByTestId('focus-clock').click();
   await expect(chrome).toHaveCSS('opacity','1');
   await expect(footer).toHaveCSS('opacity','1');
  });
 });
}
