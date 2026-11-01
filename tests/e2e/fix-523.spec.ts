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
    await expect(page.locator('[data-card-virtual-list]')).toBeVisible();
    expect(await page.locator('[data-card-row]').count()).toBeLessThanOrEqual(50);
    await expect(row.locator('.katex')).toBeVisible();
    await expect(row.getByRole('math')).toContainText('longexpression');
    await expect(row.locator('.katex-html')).not.toContainText('operatorname');
    // The full 100x formula must remain horizontally recoverable inside the row,
    // with a visible fade indicating more content; no mid-formula hard clipping.
    const preview=row.locator('[data-card-front]');
    expect(await preview.evaluate(el=>el.scrollWidth>el.clientWidth+8)).toBe(true);
    expect(await preview.evaluate(el=>getComputedStyle(el).maskImage)).toContain('linear-gradient');
    await preview.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
    expect(await preview.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
    await preview.evaluate(el=>{el.scrollLeft=0;});
    // Ordinary stress project names should stay readable without paying the
    // Markdown/KaTeX renderer cost. Mathematical card content above must still
    // render as real KaTeX; the focused unit regression covers math project titles.
    const projectChip=page.getByRole('group',{name:'Card filters'}).locator('[data-project-slug="stress-project-11"]');
    await expect(projectChip).toContainText('Mathematics project 12');
    await expect(projectChip.locator('.text-base')).toBeVisible();
    await expect(projectChip.locator('.lemma-tex-inline')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
    await page.screenshot({path:`test-results/screens/fix-523-${profile}-${theme}-${width}.png`,fullPage:true});
   });


// Regression for AUDIT BLOCK: backslash-delimited formulas must have the same
// recoverable horizontal preview as dollar-delimited formulas. Create the card
// through the public UI rather than changing the shared stress fixture.
for(const profile of ['stress','extreme'] as const)
 for(const theme of ['graph','graph-night'] as const)
  for(const width of [360,390] as const)
   test('FIX #523 backslash maths scrolls: '+profile+' '+theme+' '+width+'px',async({page})=>{
    await page.setViewportSize({width,height:740});
    await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/cards');
    await page.getByRole('button',{name:'New card'}).click();
    const expression='\\operatorname{backslashprobe'+'verylongexpression'.repeat(12)+'}';
    const front=width===360?'\\('+expression+'\\)':'\\['+expression+'\\]';
    await page.getByRole('textbox',{name:'Front'}).fill(front);
    await page.getByRole('textbox',{name:'Back'}).fill('Explain this expression');
    await page.locator('select[required]').selectOption({index:1});
    await page.getByRole('button',{name:'Create card'}).click();
    await expect(page).toHaveURL(/#\/cards\/\d+/);
    await page.evaluate(()=>{location.hash='#/cards';});
    await page.getByLabel('Search cards').fill('backslashprobe');
    const row=page.locator('[data-card-row]').first();
    await expect(row).toBeVisible();
    await expect(row.locator('.katex')).toBeVisible();
    const preview=row.locator('[data-card-front]');
    expect(await preview.evaluate(el=>el.scrollWidth>el.clientWidth+8)).toBe(true);
    expect(await preview.evaluate(el=>getComputedStyle(el).maskImage)).toContain('linear-gradient');
    await preview.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
    expect(await preview.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
    await page.screenshot({path:'test-results/screens/fix-523-backslash-'+profile+'-'+theme+'-'+width+'.png',fullPage:true});
   });
