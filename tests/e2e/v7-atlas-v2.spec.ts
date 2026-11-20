import {test,expect} from '@playwright/test';
const url=(path:string)=>'/lemma/?demo=1&flags=v7Shell,v6Shell,atlasV3#/'+path;
for(const width of [360,390])test('Atlas v3 facets, views and settings at '+width+' px',async({page})=>{
 await page.setViewportSize({width,height:844});await page.goto(url('atlas?view=list'));
 await page.getByRole('button',{name:'Themes',exact:true}).click();await expect(page.getByRole('heading',{name:'Themes',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Bridges',exact:true}).click();await expect(page.getByRole('heading',{name:'Bridges',exact:true})).toBeVisible();
 const views=page.getByRole('navigation',{name:'Atlas model views'});
 await views.getByRole('button',{name:'Map',exact:true}).click();
 await expect(page.getByRole('region',{name:'Atlas map',exact:true})).toBeVisible();
 await page.getByRole('radio',{name:'List',exact:true}).click();
 await page.locator('.v7-atlas-list ul button').first().click();
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
 // Kind is a v7 Picker (no native select): open it, choose in its sheet, and the button names the choice.
 const kind=filters.getByRole('button',{name:/^Kind: /}),choose=async(option:string)=>{await kind.click();await page.getByRole('radiogroup',{name:'Kind'}).getByRole('radio',{name:option,exact:true}).check();await expect(kind).toHaveAccessibleName('Kind: '+option);};
 await choose('definition');expect(await rows.count()).toBeLessThanOrEqual(all);
 await choose('Any');expect(await rows.count()).toBe(all);
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

test('Atlas v3 suggests study times on the Calendar and adds one only when chosen',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(url('calendar?view=day'));
 const panel=page.getByRole('region',{name:'Suggested study times'});await expect(panel).toBeVisible();
 await expect(panel.getByText('nothing is added until you do')).toBeVisible();
 const add=panel.getByRole('button',{name:'Add study block'});expect(await add.count()).toBeGreaterThan(0);
 await add.first().click();await expect(panel.getByRole('status').first()).toContainText('Added');
 await panel.getByRole('button',{name:'Undo'}).first().click();await expect(panel.getByRole('button',{name:'Add study block'}).first()).toBeVisible();
 for(const b of await panel.getByRole('button').all())expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
});

test('an approved link becomes a bridge whose uses and opportunities open on tap',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(url('proposals'));
 await page.getByRole('region',{name:'Link proposals'}).getByRole('button',{name:'Approve all 1 analogous'}).click();
 await page.goto(url('atlas?view=list'));await page.getByRole('button',{name:'Bridges',exact:true}).click();
 const bridge=page.locator('.v7-atlas-bridge').first();await expect(bridge).toBeVisible();await expect(bridge).toHaveAttribute('data-dashed','true');
 await expect(bridge.locator('summary')).toContainText('0 opportunities');
 await bridge.locator('summary').click();await expect(bridge).toContainText('No opportunities yet');
 expect((await bridge.locator('summary').boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
});
