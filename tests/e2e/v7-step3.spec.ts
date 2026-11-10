import {test,expect} from '@playwright/test';

for(const theme of ['graph','graph-night'] as const){
 test(`emblems and charts work in ${theme}`,async({page})=>{
  await page.goto(`/lemma/?demo=1&flags=v7Shell&theme=${theme}#/kit`);
  const art=page.getByRole('region',{name:'Mathematical emblems'});
  await expect(art.locator('svg.v7-emblem')).toHaveCount(5);
  expect((await art.locator('svg.v7-emblem').first().boundingBox())?.width).toBe(96);
  const paths=await art.locator('svg.v7-emblem path').count();
  expect(paths).toBeGreaterThan(20);
  await expect(art.locator('svg').first()).toHaveAttribute('aria-hidden','true');
  const chart=page.getByRole('region',{name:'Data graphics'}).getByRole('group',{name:'Study time'});
  const row=chart.getByRole('button',{name:/Mon: Analysis/});
  await row.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({hasText:'Analysis'}).first()).toBeVisible();
  const section=page.locator('section.v7-chart').filter({has:page.getByRole('heading',{name:'Study time'})});
  await section.getByRole('button',{name:'Show as table'}).click();
  await expect(section.getByRole('table')).toContainText('Analysis');
  await expect(section.getByRole('table')).toContainText('2 h');
  await section.getByRole('button',{name:'Show chart'}).click();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:`/tmp/lemma-v7-step3-${theme}-viewport.png`});
  await page.screenshot({path:`/tmp/lemma-v7-step3-${theme}.png`,fullPage:true});
 });
}
test('reduced motion disables emblem animation',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/lemma/?demo=1&flags=v7Shell#/kit');
 const emblem=page.locator('.v7-emblem').first();
 await expect(emblem).toBeVisible();
 expect(await emblem.locator('path').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});
