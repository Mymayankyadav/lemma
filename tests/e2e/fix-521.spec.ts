import {test,expect} from '@playwright/test';

for(const profile of ['stress','extreme'] as const)
 for(const theme of ['graph','graph-night'] as const)
  for(const width of [390,360] as const)
   test(`FIX #521 Continue row clips long text: ${profile} ${theme} ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:740});
    await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/`);
    await expect(page.getByRole('region',{name:'Continue'})).toBeVisible();
    const row=page.getByRole('region',{name:'Resume where you stopped'});
    await expect(row).toBeVisible();
    const title=row.locator('[data-resume-title]');
    const meta=row.locator('[data-resume-meta]');
    await expect(title).toBeVisible();
    await expect(meta).toBeVisible();
    expect((await title.getAttribute('title'))?.length).toBeGreaterThan(0);
    expect((await meta.getAttribute('title'))?.length).toBeGreaterThan(0);
    await meta.locator('.lemma-tex-inline').evaluate(el=>{
      el.textContent='A very long mathematical checkpoint title that cannot be allowed to wrap or escape the paper card at phone width';
    });
    const layout=await row.evaluate(el=>{
      const rect=el.getBoundingClientRect();
      return {height:rect.height,width:rect.width,viewport:innerWidth,
        lines:[...el.querySelectorAll('[data-resume-title],[data-resume-meta]')].map(node=>{
          const style=getComputedStyle(node);
          return {height:node.getBoundingClientRect().height,lineHeight:parseFloat(style.lineHeight),
            overflow:style.overflowX,whiteSpace:style.whiteSpace};
        })};
    });
    expect(layout.height).toBeGreaterThanOrEqual(64);
    expect(layout.lines).toHaveLength(2);
    for(const line of layout.lines){
      expect(line.whiteSpace).toBe('nowrap');
      expect(line.overflow).toBe('hidden');
      expect(line.height).toBeLessThanOrEqual(line.lineHeight+2);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
    await expect(row.getByRole('button',{name:'Copy resume prompt'}).locator('svg')).toBeVisible();
    await page.screenshot({path:`test-results/screens/fix-521-${profile}-${theme}-${width}.png`,fullPage:true});
   });
