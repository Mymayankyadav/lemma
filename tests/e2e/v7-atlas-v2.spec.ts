import {test,expect} from '@playwright/test';
const url=(path:string)=>'/lemma/?demo=1&flags=v7Shell,v6Shell#/'+path;
for(const width of [360,390])test('Atlas v3 facets, views and settings at '+width+' px',async({page})=>{
 await page.setViewportSize({width,height:844});await page.goto(url('atlas?view=list'));
 await page.getByRole('button',{name:'Themes',exact:true}).click();await expect(page.getByRole('heading',{name:'Themes',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Bridges',exact:true}).click();await expect(page.getByRole('heading',{name:'Bridges',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Map',exact:true}).last().click();await page.locator('.v7-atlas-list ul button').first().click();
 await page.getByRole('button',{name:'Show neighbours and actions'}).click();await expect(page.getByRole('heading',{name:'Facets',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Copy probe prompt'})).toBeVisible();
 await page.goto(url('settings?section=planning'));const threshold=page.getByRole('spinbutton',{name:'Mastery threshold'});await expect(threshold).toBeVisible();await threshold.fill('0.9');await page.getByRole('button',{name:'Save Atlas settings'}).click();await expect(page.getByRole('button',{name:'Save Atlas settings'})).toBeEnabled();await page.reload();await expect(page.getByRole('spinbutton',{name:'Mastery threshold'})).toHaveValue('0.9');
 await page.addStyleTag({content:'html{font-size:20px!important}'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});
