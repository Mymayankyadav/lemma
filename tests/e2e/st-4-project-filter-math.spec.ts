import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

for(const theme of ['graph','graph-night'] as const)
for(const [width,height] of [[360,740],[390,844]] as const){
 test(`ST-4 mathematical project filters ${theme} ${width}px`,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width,height});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto(`/lemma/?demo=1&theme=${theme}#/projects/new`,{waitUntil:'domcontentloaded'});
  await page.getByLabel('Name').fill('Algebra $\\mathbb{F}_p$');
  await page.getByRole('button',{name:'Create project'}).click();
  await expect(page).toHaveURL(/#\/p\//);
  const projectSlug=new URL(page.url()).hash.match(/^#\/p\/([^/?]+)/)?.[1];
  expect(projectSlug,'created mathematical project slug').toBeTruthy();
  // Hash navigation preserves the newly created in-memory demo project.
  await page.evaluate(()=>{location.hash='/cards'});
  await expect(page.getByRole('heading',{name:'Cards',exact:true})).toBeVisible();
  // The seeded plain Algebra project also matches the text; select the exact
  // newly created mathematical project rather than the first matching chip.
  const chip=page.getByRole('group',{name:'Card filters'}).locator('[data-project-slug="'+projectSlug+'"] button');
  await expect(chip).toBeVisible();
  await expect(chip.locator('.katex')).toHaveCount(1);
  const option=page.getByLabel('Filter project').locator('option[value="'+projectSlug+'"]');
  await expect(option).toHaveCount(1);
  expect(await option.textContent()).toContain('𝔽');
  expect(await option.textContent()).not.toContain('$');
  const metrics=await chip.evaluate(el=>({
   height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width,
   mathSizes:[...el.querySelectorAll('.katex')].map(k=>parseFloat(getComputedStyle(k).fontSize)),
   overflow:document.documentElement.scrollWidth-innerWidth,
  }));
  expect(metrics.height).toBeGreaterThanOrEqual(44);
  expect(metrics.width).toBeGreaterThanOrEqual(44);
  expect(metrics.mathSizes.every(size=>size>=16)).toBe(true);
  // Inline mathematical labels must not inherit card-only overflow scrollers.
  const inlineOverflow=await chip.locator('.katex').first().evaluate(el=>getComputedStyle(el).overflowX);
  expect(inlineOverflow).not.toBe('auto');
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  mkdirSync('test-results/screens/stress',{recursive:true});
  await page.screenshot({path:`test-results/screens/stress/st-4-math-project-${theme}-${width}.png`});
 });
}
