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

    // The 30,000-note stress fixture deliberately has no open comments.
    // Verify passive comment ink against the seeded open note in demo=1 below,
    // rather than pretending the empty stress result contains a comment.
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

for(const theme of ['graph','graph-night'] as const)
 for(const width of [360,390] as const)
  test(`FIX #593 seeded open-note ink: demo ${theme} ${width}px`,async({page})=>{
   await page.setViewportSize({width,height:844});
   await page.goto(`/lemma/?demo=1&theme=${theme}#/cards`);
   await expect(page.locator('[data-card-row]').first()).toBeVisible();
   await page.getByRole('group',{name:'Card filters'})
    .getByRole('button',{name:'Has notes'}).click();
   const withNotes=page.locator('[data-card-row]')
    .filter({has:page.locator('[data-card-open-comments]')}).first();
   await expect(withNotes).toBeVisible();
   const noteColor=await withNotes.locator('[data-card-open-comments]').evaluate(element=>{
    const inkProbe=document.createElement('span');
    const accentProbe=document.createElement('span');
    inkProbe.style.color='var(--ink-2)';
    accentProbe.style.color='var(--accent)';
    document.body.append(inkProbe,accentProbe);
    const result={actual:getComputedStyle(element).color,
     ink:getComputedStyle(inkProbe).color,accent:getComputedStyle(accentProbe).color};
    inkProbe.remove();accentProbe.remove();
    return result;
   });
   expect(noteColor.ink).not.toBe(noteColor.accent);
   expect(noteColor.actual).toBe(noteColor.ink);
   expect(noteColor.actual).not.toBe(noteColor.accent);
   const clear=page.getByRole('button',{name:'Clear filters'});
   await expect(clear).toBeVisible();
   expect(await clear.evaluate(el=>getComputedStyle(el).color)).toBe(noteColor.ink);
   await clear.click();
   await expect(page.locator('[data-card-row]').first()).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
   await page.screenshot({
    path:`test-results/screens/fix-593/open-note-${theme}-${width}.png`,
    fullPage:true,
   });
  });
