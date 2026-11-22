import {expect,test} from '@playwright/test';
import {at,NOW} from './v7-scenes';

test.use({viewport:{width:390,height:844}});

for(const prior of ['active','paused'] as const)test(`Undo restores a deleted ${prior} card with its source and history`,async({page})=>{
 await page.clock.setFixedTime(NOW);
 await page.goto(at('/cards'));
 const search=page.getByRole('searchbox',{name:'Search cards'});
 const query='finite intersection of open neighborhoods';
 const listing=page.getByRole('list',{name:'Cards',exact:true}).getByRole('link',{name:new RegExp(query,'i')});
 await search.fill(query);
 await listing.click();
 await expect(page).toHaveURL(/#\/cards\/1$/);

 const card=page.getByRole('article',{name:'Card',exact:true});
 const source=card.getByText('rudin', {exact:false});
 const history=page.getByRole('region',{name:'History',exact:true});
 const more=page.getByRole('button',{name:'More card actions',exact:true});
 const menuitem=(name:string)=>page.getByRole('menuitem',{name,exact:true});
 await expect(card).toBeVisible();
 await expect(source).toBeVisible();
 const sourceText=await source.innerText();
 const historyText=await history.innerText();
 if(prior==='paused'){
  await more.click();
  await menuitem('Pause card').click();
  await expect(card.getByText('Paused',{exact:true})).toBeVisible();
 }

 await more.click();
 await menuitem('Delete card').click();
 await page.getByRole('dialog',{name:'Delete this card?'}).getByRole('button',{name:'Delete card',exact:true}).click();
 await expect(page).toHaveURL(/#\/cards$/);
 const toast=page.getByRole('status').filter({hasText:'Card deleted'});
 const undo=toast.getByRole('button',{name:'Undo',exact:true});
 await undo.focus();
 await search.fill(query);
 await expect(page.getByText(/No cards match these filters/)).toBeVisible();
 await undo.click();
 await expect(page).toHaveURL(/#\/cards$/);
 await expect(listing).toBeVisible();
 await listing.click();
 await expect(source).toHaveText(sourceText);
 await expect(history).toHaveText(historyText,{useInnerText:true});
 await more.click();
 await expect(menuitem(prior==='paused'?'Resume card':'Pause card')).toBeVisible();
});
