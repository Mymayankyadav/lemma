import {test,expect} from '@playwright/test';
test('UI-2 illustrations, charts and empty states are visible and reduced motion is static',async({page})=>{
 const errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/lemma/?demo=1#/kit');
 const art=page.getByRole('region',{name:'Illustrations and empty states'});
 const charts=page.getByRole('region',{name:'Analytical charts'});
 await expect(art).toBeVisible();
 await expect(charts).toBeVisible();
 for(const name of ['Compass illustration','Study card illustration','Book pages illustration','Connected tutor illustration','Disconnected tutor illustration','Completed review illustration'])
  await expect(art.getByRole('img',{name}).first()).toBeVisible();
 for(const name of ['Recall over time','Reviews by day','Answer confidence calibration','Time by subject','Checkpoints by week','Card interval growth'])
  await expect(charts.getByRole('img',{name:new RegExp(name)})).toBeVisible();
 for(const title of ['No projects','Nothing due','Offline','All clear'])
  await expect(art.getByRole('heading',{name:title})).toBeVisible();
 const active=await page.evaluate(()=>document.getAnimations().filter(animation=>animation.playState==='running'&&animation.effect?.getTiming().iterations===Infinity).length);
 expect(active).toBe(0);
 expect(errors).toEqual([]);
 await page.screenshot({path:'test-results/screens/ui2.png',fullPage:true});
});
