import {test,expect,type Page} from '@playwright/test';

// N20 integration: Today, Calendar Day and Progress Day must read one demo snapshot.
const visit=(page:Page,hash:string)=>page.goto('./?demo=1&flags=v6Shell#'+hash);
async function displayedMinutes(page:Page):Promise<number>{
 const el=page.locator('output[aria-label="Logged today"]');
 await expect(el).toBeVisible();
 const value=Number((await el.innerText()).replace(/\s*min$/,'').trim());
 expect(Number.isFinite(value)).toBe(true);
 return value;
}

test('N20 saved Focus appears in Today, Calendar Day and Progress Day with the same minutes',async({page})=>{
 test.setTimeout(90_000);
 await page.setViewportSize({width:390,height:844});
 await visit(page,'/');
 const original=await displayedMinutes(page);
 const intent='N20 cross-screen proof';
 await page.getByRole('textbox',{name:'Focus intention'}).fill(intent);
 await page.getByRole('button',{name:'Start focus'}).click();
 const dialog=page.getByRole('dialog',{name:'Focus'});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Finish'}).click();
 await dialog.getByRole('spinbutton',{name:'Minutes to save'}).fill('6');
 await dialog.getByRole('button',{name:'Save'}).click();
 await expect(dialog).toBeHidden();
 await expect.poll(()=>displayedMinutes(page)).toBeCloseTo(original+6,3);

 await visit(page,'/calendar?view=day');
 await expect(page.getByRole('region',{name:'Day schedule'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Day schedule'}).getByText(intent,{exact:true}).first()).toBeVisible();
 await expect(page.getByRole('region',{name:'Day capacity'})).toContainText('Logged');

 await visit(page,'/insights?range=day');
 const total=page.getByRole('region',{name:'Total logged time'});
 await expect(total).toBeVisible();
 await expect(total.locator('strong')).toHaveText(Math.round(original+6)+' min');
 await page.reload();
 await expect(total.locator('strong')).toHaveText(Math.round(original+6)+' min');
});

test('N20 discarded Focus never contributes to Calendar or Progress totals',async({page})=>{
 test.setTimeout(90_000);
 await page.setViewportSize({width:390,height:844});
 await visit(page,'/');
 const before=await displayedMinutes(page);
 const intent='N20 discarded proof';
 await page.getByRole('textbox',{name:'Focus intention'}).fill(intent);
 await page.getByRole('button',{name:'Start focus'}).click();
 const dialog=page.getByRole('dialog',{name:'Focus'});
 await dialog.getByRole('button',{name:'Finish'}).click();
 await dialog.getByRole('spinbutton',{name:'Minutes to save'}).fill('15');
 await dialog.getByRole('button',{name:'Discard'}).click();
 await expect(dialog).toBeHidden();
 await expect.poll(()=>displayedMinutes(page)).toBeCloseTo(before,3);
 await visit(page,'/calendar?view=day');
 await expect(page.getByRole('region',{name:'Day schedule'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Day schedule'}).getByText(intent,{exact:true})).toHaveCount(0);
 await visit(page,'/insights?range=day');
 await expect(page.getByRole('region',{name:'Total logged time'}).locator('strong'))
  .toHaveText(Math.round(before)+' min');
});
