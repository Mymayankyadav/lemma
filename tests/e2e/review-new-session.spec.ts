import {test,expect} from '@playwright/test';

test('Q.E.D. checks new session cards instead of reusing an exhausted round',async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
 await page.goto('./?demo=1#/review');
 await page.getByRole('region',{name:'From sessions'}).getByRole('button').first().click();
 await expect(page).toHaveURL(/#\/review\/run\?session=/);

 // The fixed demo has due session reviews but no new session cards.
 for(let i=0;i<12&&!page.url().includes('/review/done');i++){
  await page.getByRole('button',{name:'Sure',exact:true}).click();
  await page.getByRole('button',{name:'Grade Good'}).click();
 }
 await expect(page).toHaveURL(/#\/review\/done$/);
 await page.getByRole('button',{name:'Review new cards from this session'}).click();
 await expect(page.getByRole('status').getByText('No new cards are due from this session.')).toBeVisible();
 await expect(page).toHaveURL(/#\/review\/done$/);
 await expect(page.getByRole('region',{name:'Review statistics'})).toBeVisible();
});
