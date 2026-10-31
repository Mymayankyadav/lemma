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
    await expect(row.locator('.sr-only')).toContainText(/, step [0-9]+ of [0-9]+/);
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


// Render actual KaTeX in the tutor-authored checkpoint metadata. This catches
// the 12px caption / 1.21em KaTeX regression without relaxing the 64px row.
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [390,360] as const)
 test('FIX #521 Continue math >=16px: '+profile+' '+theme+' '+width,async({page})=>{
  await page.setViewportSize({width,height:740});
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/');
  const row=page.getByRole('region',{name:'Resume where you stopped'});
  await expect(row).toBeVisible({timeout:90_000});
  const meta=row.locator('[data-resume-meta]');
  await meta.evaluate(el=>{
   const renderer=(window as typeof window&{katex?:{renderToString:(source:string,options?:{throwOnError:boolean})=>string}}).katex;
   if(!renderer)throw new Error('KaTeX global not initialized');
   const target=el.querySelector('.lemma-tex-inline');
   if(!target)throw new Error('Missing checkpoint Tex wrapper');
   target.innerHTML=renderer.renderToString('\\pi_1(S^1)\\cong\\mathbb{Z}',{throwOnError:false});
  });
  const metrics=await row.evaluate(el=>{
   const meta=el.querySelector('[data-resume-meta]')!;
   const math=meta.querySelector('.katex')!;
   const rect=el.getBoundingClientRect();
   const copy=el.querySelector('button[aria-label="Copy resume prompt"]')!.getBoundingClientRect();
   return {fontSize:parseFloat(getComputedStyle(math).fontSize),
    height:rect.height,copyWidth:copy.width,copyHeight:copy.height,
    overflow:document.documentElement.scrollWidth-innerWidth,
    nowrap:getComputedStyle(meta).whiteSpace,
    mathText:math.textContent};
  });
  expect(metrics.fontSize,'KaTeX in checkpoint metadata').toBeGreaterThanOrEqual(16);
  expect(metrics.height,'Continue row remains compact').toBeLessThanOrEqual(68);
  expect(metrics.copyWidth).toBeGreaterThanOrEqual(44);
  expect(metrics.copyHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  expect(metrics.nowrap).toBe('nowrap');
  expect(metrics.mathText).toContain('π');
  await page.screenshot({path:'test-results/screens/fix-521-math-'+profile+'-'+theme+'-'+width+'.png'});
 });
