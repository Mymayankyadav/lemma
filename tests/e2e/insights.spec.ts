import {test,expect} from '@playwright/test';
test('Insights renders study statistics and updates when the period changes',async({page})=>{
 const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/lemma/?demo=1#/insights');
 await expect(page.getByRole('heading',{name:'Insights'})).toBeVisible();
 await expect(page.getByRole('group',{name:'Time range'})).toBeVisible();
 await expect(page.getByText('18h 40m')).toBeVisible();
 await expect(page.getByText('26',{exact:true})).toBeVisible();
 await expect(page.getByText('412',{exact:true})).toBeVisible();
 await expect(page.getByText('91%',{exact:true})).toBeVisible();
 await expect(page.getByText('94%',{exact:true})).toBeVisible();
 for(const name of ['Recall','Reviews by day','When you said','Time by subject','Checkpoints','Typical session','Most revisited'])
  await expect(page.getByRole('heading',{name}).or(page.getByText(name,{exact:true})).first()).toBeVisible();
 for(const name of ['Recall over time','Reviews by day','Answer confidence calibration','Time by subject','Checkpoints by week'])
  await expect(page.getByRole('img',{name:new RegExp(name)})).toBeVisible();
 await page.getByRole('button',{name:'7 days'}).click();
 await expect(page.getByText('18h 40m')).toHaveCount(0);
 await page.getByRole('button',{name:'90 days'}).click();
 await expect(page.getByRole('heading',{name:'Reviews by week'})).toBeVisible();
 expect(errors).toEqual([]);
 await page.screenshot({path:'test-results/screens/insights.png',fullPage:true});
});
