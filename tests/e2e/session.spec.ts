import {test,expect} from '@playwright/test';
test('session record shows the tutor reasoning, cards, unresolved mistakes and source citation',async({page})=>{
 const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/lemma/?demo=1#/s/real-analysis/7');
 await expect(page.getByRole('heading',{name:'Session 7'})).toBeVisible();
 await expect(page.getByText('42 min',{exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Reasoning'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Reasoning'}).getByRole('listitem')).toHaveCount(4);
 await expect(page.getByRole('heading',{name:'Cards',exact:true})).toBeVisible();
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

for(const world of ['euclid','euclid-night'] as const){
 test(`UI-5f session is a numbered proof with marginal misconceptions in ${world}`,async({page})=>{
  await page.setViewportSize({width:360,height:740});
  await page.goto(`/lemma/?demo=1&theme=${world}&effects=calm#/s/real-analysis/7`);
  const proof=page.getByRole('region',{name:'Reasoning'}).getByRole('listitem');
  await expect(proof).toHaveCount(4);
  for(let i=0;i<4;i++)
   await expect(proof.nth(i).locator('span[aria-hidden="true"]').first()).toHaveText(String(i+1));
  await expect(page.getByRole('heading',{name:'Things to revisit'})).toBeVisible();
  await expect(page.locator('[data-euclid-session]')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
  await page.screenshot({path:`test-results/screens/review/ui5f-session-${world}.png`,fullPage:true});
 });
}
