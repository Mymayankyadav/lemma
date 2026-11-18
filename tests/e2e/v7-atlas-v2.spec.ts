import {test,expect} from '@playwright/test';
const url=(path:string)=>'/lemma/?demo=1&flags=v7Shell,v6Shell,atlasV3#/'+path;
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

test('Atlas v3 filters narrow the list and are reversible',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(url('atlas?view=list'));
 const rows=page.locator('.v7-atlas-list ul button');await expect(rows.first()).toBeVisible();const all=await rows.count();
 const filters=page.getByRole('navigation',{name:'Atlas filters'});await expect(filters).toBeVisible();
 await filters.getByRole('button',{name:'Stale',exact:true}).click();await expect(filters.getByRole('button',{name:'Stale',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await rows.count()).toBeLessThan(all);                     // nothing in the demo is older than 30 days
 await filters.getByRole('button',{name:'All',exact:true}).click();expect(await rows.count()).toBe(all);
 await filters.getByLabel('Kind').selectOption('definition');expect(await rows.count()).toBeLessThanOrEqual(all);
 await filters.getByLabel('Kind').selectOption('any');expect(await rows.count()).toBe(all);
 for(const box of await filters.getByRole('button').all())expect((await box.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
});

test('Atlas v3 link proposals are decided one at a time or by kind',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(url('proposals'));
 const panel=page.getByRole('region',{name:'Link proposals'});await expect(panel).toBeVisible();
 const group=panel.getByRole('group',{name:'analogous links'});await expect(group).toBeVisible();
 await expect(group.getByRole('button',{name:'Approve all 1 analogous'})).toBeVisible();await expect(group.getByRole('button',{name:'Reject all 1 analogous'})).toBeVisible();
 for(const b of await group.getByRole('button').all())expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
 await group.getByRole('button',{name:'Approve all 1 analogous'}).click();
 await expect(panel).toBeHidden();                                   // the demo has one proposed link; a decided link leaves the list
});
