import {test,expect} from '@playwright/test';
test('Today and Progress expose the shared Atlas model',async({page})=>{
 await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell,atlasV3#/');await expect(page.getByRole('region',{name:'Study model'})).toBeVisible();
 await page.goto('/lemma/?demo=1&flags=v7Shell,v6Shell,atlasV3#/insights?tab=learning');const panel=page.getByRole('region',{name:'Atlas model health'});await expect(panel.getByRole('heading',{name:'Track record'})).toBeVisible();await expect(panel.getByText('insufficient data').first()).toBeVisible();
});
