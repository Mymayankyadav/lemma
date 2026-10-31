import {expect,test} from '@playwright/test';

// AUDIT #593: passive Cards-list metadata must not consume the v4 red-pencil
// accent. This is measured in both approved Graph worlds at both phone widths
// and with both 10×/100× data profiles, not inferred from utility class names.
for(const profile of ['stress','extreme'] as const)
 for(const theme of ['graph','graph-night'] as const)
  for(const width of [360,390] as const)
   test(`FIX #593 passive Cards row ink: ${profile} ${theme} ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/cards`);
    const row=page.locator('[data-card-row]').first();
    await expect(row).toBeVisible();

    const glyph=row.locator('[data-card-subject-glyph]');
    await expect(glyph).toBeVisible();
    const colors=await glyph.evaluate(element=>{
     // Use two simultaneous probes. Reusing one node for both variables can
     // read a stale computed color under Chromium's style recalculation.
     const inkProbe=document.createElement('span');
     const accentProbe=document.createElement('span');
     inkProbe.style.color='var(--ink-2)';
     accentProbe.style.color='var(--accent)';
     document.body.append(inkProbe,accentProbe);
     const ink=getComputedStyle(inkProbe).color;
     const accent=getComputedStyle(accentProbe).color;
     inkProbe.remove();accentProbe.remove();
     return {actual:getComputedStyle(element).color,ink,accent,
      size:parseFloat(getComputedStyle(element).fontSize)};
    });
    expect(colors.ink).not.toBe(colors.accent);
    expect(colors.actual).toBe(colors.ink);
    expect(colors.actual).not.toBe(colors.accent);
    expect(colors.size).toBeGreaterThanOrEqual(16);

    // Notes are passive metadata even when the user filters for them.
    await page.getByRole('group',{name:'Card filters'})
     .getByRole('button',{name:'Has notes'}).click();
    const withNotes=page.locator('[data-card-row]')
     .filter({has:page.locator('[data-card-open-comments]')}).first();
    await expect(withNotes).toBeVisible();
    const noteColor=await withNotes.locator('[data-card-open-comments]')
     .evaluate(element=>getComputedStyle(element).color);
    expect(noteColor).toBe(colors.ink);
    expect(noteColor).not.toBe(colors.accent);

    // Clear filters is a secondary action, not the screen's red primary.
    const clear=page.getByRole('button',{name:'Clear filters'});
    await expect(clear).toBeVisible();
    expect(await clear.evaluate(el=>getComputedStyle(el).color)).toBe(colors.ink);

    const layout=await page.evaluate(()=>{
     const rows=[...document.querySelectorAll<HTMLElement>('[data-card-row]')];
     return {overflow:document.documentElement.scrollWidth-innerWidth,
      minRowHeight:Math.min(...rows.map(row=>row.getBoundingClientRect().height))};
    });
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(layout.minRowHeight).toBeGreaterThanOrEqual(44);
    await page.screenshot({
     path:`test-results/screens/fix-593/${profile}-${theme}-${width}.png`,
     fullPage:true,
    });
   });
