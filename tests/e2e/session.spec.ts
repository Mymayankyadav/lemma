import {test,expect} from '@playwright/test';
test('session record shows the tutor reasoning, cards, unresolved mistakes and source citation',async({page})=>{
 const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/lemma/?demo=1#/s/real-analysis/7');
 await expect(page.getByRole('heading',{name:'Session 7'})).toBeVisible();
 await expect(page.getByText('42 min',{exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Reasoning'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Reasoning'}).getByRole('listitem')).toHaveCount(4);
 await expect(page.getByRole('heading',{name:'Cards'})).toBeVisible();
 await expect(page.getByRole('link',{name:/Review/})).toBeVisible();
 await page.getByRole('button',{name:/Pages/}).click();
 await expect(page.getByRole('dialog',{name:'Session pages'})).toBeVisible();
 await expect(page.getByText(/PDF tools/)).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog',{name:'Session pages'})).toBeHidden();
 await expect(page.getByRole('button',{name:'Copy session summary'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Start studying'})).toBeVisible();
 await expect(errors).toEqual([]);
 await page.screenshot({path:'test-results/screens/session.png',fullPage:true});
});
test('nonexistent session has a readable recovery link',async({page})=>{
 await page.goto('/lemma/?demo=1#/s/real-analysis/9999');
 await expect(page.getByRole('alert')).toContainText('Session unavailable');
 await expect(page.getByRole('link',{name:'Open project'})).toBeVisible();
});
