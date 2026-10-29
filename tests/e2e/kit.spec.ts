import {test,expect} from '@playwright/test';
test('UI-1 components render in demo mode, remain accessible and respect reduced motion',async({page})=>{
 const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/lemma/?demo=1#/kit');
 await expect(page.getByRole('heading',{name:'Component kit'})).toBeVisible();
 for(const name of ['Surfaces','Buttons and controls','Progress and learning state','Mathematical text','Layers, feedback and loading']){
  await expect(page.getByRole('region',{name})).toBeVisible();
 }
 await expect(page.getByRole('img',{name:'Done'})).toBeVisible();
 await expect(page.getByRole('img',{name:'In progress'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Start studying'})).toBeVisible();
 await page.getByRole('button',{name:'Open bottom sheet'}).click();
 await expect(page.getByRole('dialog',{name:'Checkpoint details'})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog',{name:'Checkpoint details'})).toBeHidden();
 await page.getByRole('button',{name:'Show toast with action'}).click();
 await expect(page.getByRole('status').filter({hasText:'Prompt copied'})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getTiming().iterations===Infinity).length)).toBe(0);
 await expect(errors).toEqual([]);
 await page.screenshot({path:'test-results/screens/kit.png',fullPage:true});
 await page.goto('/lemma/?demo=1#/');
 await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('link')).toHaveCount(4);
});
