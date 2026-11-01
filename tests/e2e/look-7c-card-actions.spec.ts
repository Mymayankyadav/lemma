import {test,expect} from '@playwright/test';

// LOOK-7c: Card detail keeps editing discoverable while moving the ambiguous
// pause glyph into a labelled, keyboard-accessible overflow action.
test('Card detail actions are explicit, reversible and keyboard accessible',async({page})=>{
 await page.goto('/lemma/?demo=1&theme=graph#/cards/31');
 await expect(page.getByRole('heading',{name:'Card detail'})).toBeVisible();
 const actions=page.getByRole('button',{name:'Card actions'});
 await expect(actions).toBeVisible();
 await expect(page.getByRole('button',{name:'Pause card'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Edit card'})).toBeVisible();
 await actions.click();
 await expect(actions).toHaveAttribute('aria-expanded','true');
 const menu=page.getByRole('menu',{name:'Card actions'});
 const suspend=menu.getByRole('menuitem',{name:'Suspend card'});
 await expect(suspend).toBeFocused();
 await page.keyboard.press('ArrowDown');
 await expect(menu.getByRole('menuitem',{name:'Delete card'})).toBeFocused();
 await page.keyboard.press('ArrowUp');
 await expect(suspend).toBeFocused();
 await suspend.click();
 await expect(page.getByText('Paused',{exact:true})).toBeVisible();
 await actions.click();
 await expect(menu.getByRole('menuitem',{name:'Resume card'})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(menu).toHaveCount(0);
 await expect(actions).toBeFocused();
 await actions.click();
 await menu.getByRole('menuitem',{name:'Resume card'}).click();
 await expect(page.getByText('Paused',{exact:true})).toHaveCount(0);
 await actions.click();
 await menu.getByRole('menuitem',{name:'Delete card'}).click();
 await expect(page.getByRole('dialog',{name:'Delete this card?'})).toBeVisible();
 await page.getByRole('dialog',{name:'Delete this card?'}).getByRole('button',{name:'Cancel'}).click();
 await expect(page.getByRole('dialog',{name:'Delete this card?'})).toBeHidden();
});

for(const profile of ['stress','extreme'] as const)
 for(const theme of ['graph','graph-night'] as const)
  for(const width of [360,390] as const)
   test(`LOOK-7c Card detail ${profile} ${theme} ${width}px`,async({page})=>{
    test.setTimeout(120_000);
    await page.setViewportSize({width,height:844});
    await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/cards/31`,{waitUntil:'domcontentloaded'});
    await expect(page.getByRole('article',{name:'Card front and answer'})).toBeVisible();
    const edit=page.getByRole('button',{name:'Edit card'});
    const actions=page.getByRole('button',{name:'Card actions'});
    for(const button of [edit,actions]){
     const box=await button.boundingBox();
     expect(box).not.toBeNull();
     expect(box!.width).toBeGreaterThanOrEqual(44);
     expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await actions.click();
    const menu=page.getByRole('menu',{name:'Card actions'});
    await expect(menu.getByRole('menuitem',{name:'Suspend card'})).toBeVisible();
    await expect(menu.getByRole('menuitem',{name:'Delete card'})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
    expect(await page.evaluate(()=>document.querySelectorAll('*').length)).toBeLessThan(1500);
    await page.screenshot({path:`test-results/screens/review/look-7c-${profile}-${theme}-${width}.png`,fullPage:true});
   });
