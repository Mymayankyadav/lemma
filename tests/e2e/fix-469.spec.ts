import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX #469 tab labels and due badge respect 12px floor: '+theme+' '+width,async({page})=>{
  await page.setViewportSize({width,height:740});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.goto('/lemma/?demo=1&theme='+theme+'#/review');
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await expect(page.getByRole('heading',{name:'Review',level:1})).toBeVisible();
  const nav=page.getByRole('navigation',{name:'Main navigation'});
  const review=nav.getByRole('link',{name:'Review'});
  const label=review.getByText('Review',{exact:true});
  const badge=review.locator('span.absolute');
  await expect(label).toBeVisible();
  await expect(badge).toBeVisible();
  const metrics=await page.evaluate(()=>{
   const nav=document.querySelector('nav[aria-label="Main navigation"]')!;
   const link=nav.querySelector('a[aria-label="Review"]')!;
   const label=Array.from(link.querySelectorAll('span')).find(el=>el.textContent?.trim()==='Review')!;
   const badge=link.querySelector('span.absolute')!;
   const targets=Array.from(nav.querySelectorAll('a')).map(el=>{
    const rect=el.getBoundingClientRect();return {width:rect.width,height:rect.height};
   });
   return {labelSize:parseFloat(getComputedStyle(label).fontSize),badgeSize:parseFloat(getComputedStyle(badge).fontSize),targets,overflow:document.documentElement.scrollWidth-innerWidth};
  });
  expect(metrics.labelSize).toBeGreaterThanOrEqual(12);
  expect(metrics.badgeSize).toBeGreaterThanOrEqual(12);
  for(const rect of metrics.targets){expect(rect.width).toBeGreaterThanOrEqual(44);expect(rect.height).toBeGreaterThanOrEqual(44);}
  expect(metrics.overflow).toBeLessThanOrEqual(0);
  mkdirSync('test-results/screens/fix-469',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-469/'+theme+'-'+width+'.png'});
 });
}
