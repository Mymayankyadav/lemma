import {test,expect} from '@playwright/test';

for(const profile of ['stress','extreme'] as const)
 for(const theme of ['graph','graph-night'] as const)
  for(const width of [390,360] as const)
   test(`FIX #523 Cards list typesets stress maths: ${profile} ${theme} ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:740});
    await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/cards`);
    await page.getByLabel('Search cards').fill('longexpression');
    // KaTeX exposes a separate accessible math node: the link's name is CP6 Due,
    // not the literal TeX command. Target the known stress card without hiding maths.
    const row=page.locator('a[href="#/cards/6"]');
    await expect(row).toBeVisible();
    await expect(row.locator('.katex')).toBeVisible();
    await expect(row.getByRole('math')).toContainText('longexpression');
    await expect(row.locator('.katex-html')).not.toContainText('operatorname');
    await expect(page.getByRole('group',{name:'Card filters'}).locator('.lemma-tex-inline').first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
    await page.screenshot({path:`test-results/screens/fix-523-${profile}-${theme}-${width}.png`,fullPage:true});
   });
