import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

/** LOOK-7b: filter overflow must communicate hidden chips without cutting their labels. */
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test(`LOOK-7b directional Cards filter fade: ${profile} ${theme} ${width}px`,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height:844});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.goto(`/lemma/?demo=${profile}&theme=${theme}#/cards`,{waitUntil:'domcontentloaded'});
  const filters=page.getByRole('group',{name:'Card filters'});
  await expect(filters.getByRole('button',{name:'All',exact:true})).toBeVisible();
  await expect(filters).toHaveAttribute('data-filter-fade-right','true');
  await expect(filters).toHaveAttribute('data-filter-fade-left','false');
  const start=await filters.evaluate(el=>({
   clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,
   mask:getComputedStyle(el).maskImage,
   chips:[...el.querySelectorAll('button')].map(b=>({height:b.getBoundingClientRect().height,width:b.getBoundingClientRect().width})),
  }));
  expect(start.scrollWidth).toBeGreaterThan(start.clientWidth);
  expect(start.mask).toContain('linear-gradient');
  for(const chip of start.chips){
   expect(chip.height).toBeGreaterThanOrEqual(43.5);
   expect(chip.width).toBeGreaterThanOrEqual(43.5);
  }
  mkdirSync('test-results/screens/look-7b',{recursive:true});
  await page.screenshot({path:`test-results/screens/look-7b/${profile}-${theme}-${width}-start.png`});
  await filters.evaluate(el=>{el.scrollLeft=el.scrollWidth});
  await expect(filters).toHaveAttribute('data-filter-fade-left','true');
  await expect(filters).toHaveAttribute('data-filter-fade-right','false');
  await expect(filters.getByRole('button',{name:'Paused'})).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`test-results/screens/look-7b/${profile}-${theme}-${width}-end.png`});
  await filters.getByRole('button',{name:'Paused'}).click();
  await expect(filters.getByRole('button',{name:'Paused'})).toHaveAttribute('aria-pressed','true');
 });
}
