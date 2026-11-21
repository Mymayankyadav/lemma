import {test,expect} from '@playwright/test';
test('Settings Advanced exposes model health for Today and Progress',async({page})=>{
 const url='/lemma/?demo=1&flags=v7Shell,v6Shell,atlasV3#';
 await page.goto(url+'/');await expect(page.getByRole('main',{name:'Today',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Study model'})).toHaveCount(0);
 await page.goto(url+'/insights?tab=learning');await expect(page.getByRole('heading',{name:'Progress',level:1})).toBeVisible();
 await expect(page.getByRole('region',{name:'Atlas model health'})).toHaveCount(0);
 await page.goto(url+'/settings?section=advanced');
 await page.getByRole('button',{name:'Model health',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Track record',exact:true})).toBeVisible();
 await expect(page.getByText('Insufficient data to compare predictions with outcomes.',{exact:true})).toBeVisible();
});

for(const width of [360,390])test('A course conversion is reviewed in full at '+width+' px; a rule-breaking one cannot be approved',async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell,atlasV3#/proposals/atlas-demo-conversion');
 const review=page.getByRole('region',{name:'Course conversion'});await expect(review).toBeVisible();
 await expect(review.getByRole('heading',{name:'Course conversion'})).toBeVisible();
 await expect(review.getByText('Fix before approval')).toHaveCount(0);
 await expect(review.getByText('template:cards-in-close')).toBeVisible();      // the open cards CP moves into Close with its reason
 await expect(review.getByText('Compactness').first()).toBeVisible();
 await expect(page.getByRole('button',{name:'Approve',exact:true})).toBeEnabled();
 await page.addStyleTag({content:'html{font-size:20px!important}'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell,atlasV3#/proposals/atlas-demo-conversion-bad');
 const bad=page.getByRole('region',{name:'Course conversion'});await expect(bad.getByText('Fix before approval')).toBeVisible();
 await expect(bad.getByRole('alert')).toContainText('holdout');
 await expect(page.getByRole('button',{name:'Approve',exact:true})).toBeDisabled();
});

test('with atlasV3 off a conversion proposal still shows its whole review next to Approve',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell,-atlasV3#/proposals/atlas-demo-conversion');   // the off path (rollback); atlasV3 is on by default since N182
 const review=page.getByRole('region',{name:'Course conversion'});await expect(review).toBeVisible();await expect(review.getByText('template:cards-in-close')).toBeVisible();
 await expect(page.getByRole('button',{name:'Approve',exact:true})).toBeEnabled();
});
test('with atlasV3 off the Atlas map draws nothing of the model and asks for none',async({page})=>{
 const calls:string[]=[];page.on('request',r=>{if(/atlas-model|attempts|atlas_links/.test(r.url()))calls.push(r.url());});
 await page.setViewportSize({width:390,height:844});await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell,-atlasV3#/atlas?view=list');   // atlasV3 is on by default since N182
 await expect(page.locator('.v7-atlas-list ul button').first()).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Atlas filters'})).toHaveCount(0);
 await expect(page.getByRole('region',{name:'Atlas views'})).toHaveCount(0);
 expect(calls).toEqual([]);
});
