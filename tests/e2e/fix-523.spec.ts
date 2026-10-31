import {test,expect} from '@playwright/test';

for(const profile of ['stress','extreme'] as const)
 for(const theme of ['graph','graph-night'] as const)
  for(const width of [390,360] as const)
   test(`FIX #523 Cards list typesets stress maths: ${profile} ${theme} ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:740});
    await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/cards`);
    await page.getByLabel('Search cards').fill('longexpression');
    const row=page.getByRole('link',{name:/longexpression/}).first();
    await expect(row).toBeVisible();
    await expect(row.locator('.katex')).toBeVisible();
    await expect(row).not.toContainText('operatorname');
    await expect(page.getByRole('group',{name:'Card filters'}).locator('.lemma-tex-inline').first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
    await page.screenshot({path:`test-results/screens/fix-523-${profile}-${theme}-${width}.png`,fullPage:true});
   });
