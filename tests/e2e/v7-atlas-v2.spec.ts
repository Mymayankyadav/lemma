import {test,expect} from '@playwright/test';
import {NOW} from './v7-scenes';
const url=(path:string)=>'/lemma/?demo=1&flags=v7Shell,v6Shell,atlasV3#/'+path;
for(const width of [360,390])test('Atlas v3 facets, views and settings at '+width+' px',async({page})=>{
 await page.addInitScript(()=>{
  const key='lemma.demo.atlas-v3';
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({
   atlas:{},kinds:{'concept-compactness':'theme'},links:{'atlas-demo-link':true},
  }));
 });
 await page.setViewportSize({width,height:844});await page.goto(url('atlas?view=list'));
 const layers=page.getByRole('button',{name:'Layers',exact:true}),sheet=page.getByRole('dialog',{name:'Layers',exact:true});
 await layers.click();await expect(sheet.getByRole('button',{name:'Bridges',exact:true})).toHaveCount(0);
 await sheet.getByRole('button',{name:'Themes',exact:true}).click();
 await expect(page.getByRole('region',{name:'Themes',exact:true}).getByRole('button',{name:'Compactness',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Back to map',exact:true}).click();
 await expect(page.getByRole('region',{name:'Atlas map',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'List',exact:true}).click();
 await page.locator('.v7-atlas-list ul button').first().click();
 await expect(page.getByRole('button',{name:'Show less',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Facets',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Copy probe prompt'})).toBeVisible();
 await page.goto(url('settings?section=advanced'));
 const tuning=page.getByRole('button',{name:'Atlas tuning',exact:true}),threshold=page.getByRole('spinbutton',{name:'Mastery threshold'});
 await tuning.click();await expect(threshold).toBeVisible();await threshold.fill('0.9');
 const save=page.getByRole('button',{name:'Save Atlas settings'});
 await save.click();await expect(save).toBeDisabled();
 await page.reload();await tuning.click();await expect(threshold).toHaveValue('0.9');
 await page.addStyleTag({content:'html{font-size:20px!important}'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});

test('Atlas v3 filters narrow the list and are reversible',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(url('atlas?view=list'));
 const rows=page.locator('.v7-atlas-list ul button');await expect(rows.first()).toBeVisible();const all=await rows.count();
 const layers=page.getByRole('button',{name:'Layers',exact:true}),filters=page.getByRole('dialog',{name:'Layers',exact:true});
 await layers.click();
 const stale=filters.getByRole('switch',{name:'Only stale concepts',exact:true});
 await stale.click();await expect(stale).toBeChecked();
 expect(await rows.count()).toBeLessThan(all);                     // nothing in the demo is older than 30 days
 await stale.click();await expect(stale).not.toBeChecked();expect(await rows.count()).toBe(all);
 const choose=async(option:string)=>{const kind=filters.getByRole('button',{name:option,exact:true});await kind.click();await expect(kind).toHaveAttribute('aria-pressed','true');};
 await choose('Definition');expect(await rows.count()).toBeLessThan(all);
 await choose('Any');expect(await rows.count()).toBe(all);
 for(const button of await filters.getByRole('button').all())
  expect((await button.boundingBox())!.height,await button.innerText()).toBeGreaterThanOrEqual(43.5);
});

test('Atlas v3 link proposals are decided one at a time or by kind',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(url('proposals'));
 const panel=page.getByRole('region',{name:'Suggested links'});await expect(panel).toBeVisible();
 await expect(panel.getByRole('listitem')).toHaveCount(1);
 for(const action of ['Approve link','Reject link'])await expect(panel.getByRole('button',{name:action,exact:true})).toBeVisible();
 await panel.getByRole('button',{name:'Review links by kind',exact:true}).click();
 const group=panel.getByRole('group',{name:'analogous links'});await expect(group).toBeVisible();
 await expect(group.getByRole('button',{name:'Approve all 1 analogous'})).toBeVisible();await expect(group.getByRole('button',{name:'Reject all 1 analogous'})).toBeVisible();
 for(const b of await group.getByRole('button').all())expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
 await group.getByRole('button',{name:'Approve all 1 analogous'}).click();
 await expect(panel).toBeHidden();                                   // the demo has one proposed link; a decided link leaves the list
});

test('Atlas v3 suggests study times on the Calendar and adds one only when chosen',async({page})=>{
 await page.clock.setFixedTime(NOW);
 await page.setViewportSize({width:390,height:844});await page.goto(url('calendar?view=week&date=2026-11-09'));
 const add=page.getByRole('button',{name:'Add suggested block Study time',exact:true}),saved=page.getByRole('button',{name:/^Study block, Planned study/});
 await expect(add.first()).toBeVisible();await expect(saved).toHaveCount(0);
 for(const b of await add.all())expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
 const count=await add.count();
 await add.first().click();await expect(saved).toHaveCount(1);
 await expect(add).toHaveCount(count-1);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(saved).toHaveCount(0);
 await expect(add).toHaveCount(count);
});

test('an approved link stays out of the Bridges layer until it has been used',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(url('proposals'));
 const proposals=page.getByRole('region',{name:'Suggested links'});
 await proposals.getByRole('button',{name:'Approve link',exact:true}).click();await expect(proposals).toHaveCount(0);
 await page.goto(url('atlas?view=list'));await page.getByRole('button',{name:'Layers',exact:true}).click();
 const layers=page.getByRole('dialog',{name:'Layers',exact:true});
 await expect(layers.getByRole('button',{name:'Constellations',exact:true})).toBeVisible();
 await expect(layers.getByRole('button',{name:'Bridges',exact:true})).toHaveCount(0);
 await expect(page.locator('.v7-atlas-bridge')).toHaveCount(0);
 await page.goto(url('atlas?view=bridges').replace('atlasV3#','atlasV3,uiRepairV1#'));
 await expect(page.getByRole('region',{name:'Atlas map',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'List',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Bridges',exact:true})).toHaveCount(0);
});
