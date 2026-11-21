import {expect,type Locator} from '@playwright/test';

/** Tap near a minute on the native ruler and use its one-minute keyboard steps to reach it. */
export async function setTimeRuler(slider:Locator,minute:number){
 await slider.scrollIntoViewIfNeeded();
 const box=(await slider.boundingBox())!;
 await slider.click({position:{x:Math.round((box.width-2)*minute/1439)+1,y:Math.floor(box.height/2)}});
 const difference=minute-Number(await slider.inputValue());
 const key=difference>0?'ArrowRight':'ArrowLeft';
 for(let step=0;step<Math.abs(difference);step++)await slider.press(key);
 await expect(slider).toHaveValue(String(minute));
}
