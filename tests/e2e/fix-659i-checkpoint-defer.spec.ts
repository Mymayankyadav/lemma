import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

test('FIX-659i Project Route stays usable before supplemental checkpoint detail resolves',async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
 await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
 await page.goto('/lemma/?demo=1&theme=graph#/p/real-analysis');
 await expect(page.getByRole('region',{name:'Project timeline'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Stages'})).toBeVisible();
 const current=page.getByRole('article',{name:'Current checkpoint CP4'});
 await expect(current).toBeVisible();
 await expect(current.getByRole('button',{name:'Resume'})).toBeVisible();
 const details=current.getByRole('link',{name:'Details for CP4'});
 await expect(details).toBeVisible();
 // The independent checkpoint query must still hydrate the original objective,
 // source pages and sessions after the Route is painted.
 await expect(current).toContainText('Prove compact sets in a Hausdorff space are closed.');
 await expect(current).toContainText('p. 36-40');
 await expect(current).toContainText('sessions');
 mkdirSync('test-results/screens/fix-659i',{recursive:true});
 await page.screenshot({path:'test-results/screens/fix-659i/project-detail-after-paint.png',fullPage:true,animations:'disabled'});
 await details.click();
 await expect(page.getByRole('dialog',{name:'Compactness'})).toBeVisible();
});
