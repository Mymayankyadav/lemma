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

for(const theme of ['euclid','euclid-night'] as const){
 for(const density of ['compact','comfortable'] as const){
  test(`UI-3 kit renders ${theme} in ${density} density`,async({page})=>{
   const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(`/lemma/?demo=1&theme=${theme}&density=${density}&effects=calm#/kit`);
   await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
   await expect(page.locator('html')).toHaveAttribute('data-density',density);
   await expect(page.getByRole('heading',{name:'Component kit'})).toBeVisible();
   await expect(page.getByRole('button',{name:'Start studying'})).toBeVisible();
   await expect(page.locator('html')).toHaveCSS('color-scheme',theme==='euclid'?'light':'dark');
   await expect(errors).toEqual([]);
   await page.screenshot({path:`test-results/screens/kit-${theme}-${density}.png`,fullPage:true});
  });
 }
}
test('UI-3 Appearance applies, persists, and can cycle themes from floating lab',async({page})=>{
 await page.goto('/lemma/?demo=1#/settings');
 await expect(page.getByRole('heading',{name:'Appearance'})).toBeVisible();
 await page.getByRole('radio',{name:'Euclid',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','euclid');
 await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content','#F1E7D3');
 await page.getByRole('radio',{name:'Cozy'}).click();
 await expect(page.locator('html')).toHaveAttribute('data-density','cozy');
 await page.reload();
 await expect(page.locator('html')).toHaveAttribute('data-theme','euclid');
 await expect(page.locator('html')).toHaveAttribute('data-density','cozy');
 await page.getByRole('button',{name:'Open theme lab'}).click();
 await expect(page.getByRole('dialog',{name:'Theme lab'})).toBeVisible();
 await page.getByRole('button',{name:'Next theme'}).click();
 await expect(page.locator('html')).not.toHaveAttribute('data-theme','euclid');
});
