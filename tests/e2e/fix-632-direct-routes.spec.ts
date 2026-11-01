import {test,expect} from '@playwright/test';
import {QA3_ROUTES,QA3_ROUTE_READINESS} from '../../scripts/qa3-report';

// FIX #632 replaces the old eager-only source guard with a stronger browser
// contract. Every screen must work when its chunk is first requested by a
// cold direct navigation, including the 30,000-card extreme demo fixture.
// This catches the 33 historical lazy-route failures without hiding them
// behind a prior Today/Paths warm-up. Existing strict ST-0 4x budgets remain.
for(const route of QA3_ROUTES){
 test('FIX #632 cold direct route hydrates real extreme content: '+route,async({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width:360,height:740});
  await page.route('https://fonts.googleapis.com/**',request=>request.fulfill({body:''}));
  await page.route('https://fonts.gstatic.com/**',request=>request.fulfill({body:''}));
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  const readiness=QA3_ROUTE_READINESS[route];
  await page.goto('/lemma/?demo=extreme&theme=graph-night#'+route,{
   waitUntil:'domcontentloaded',timeout:90_000,
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme','graph-night',{timeout:90_000});
  await expect(page.getByRole('heading',{name:readiness.heading,exact:true,level:1}))
   .toBeVisible({timeout:90_000});
  await expect(page.locator(readiness.landmark).first(),
   'Direct navigation must show real data/controls, not a route skeleton')
   .toBeVisible({timeout:90_000});
  if(route==='/cards'){
   await expect(page.locator('[data-card-row]').first()).toHaveAttribute(
    'href','#/cards/30000',{timeout:90_000});
   await expect(page.locator('[aria-live="polite"]').filter({hasText:'50 loaded'}))
    .toBeVisible({timeout:90_000});
  }
  if(route!=='/kit')await expect(page.locator('.animate-pulse.bg-fill-2'))
   .toHaveCount(0,{timeout:90_000});
  await expect(page.getByText(/This (card|proposal) could not be loaded\./))
   .toHaveCount(0,{timeout:90_000});
  await expect(page.getByText('Session unavailable.')).toHaveCount(0,{timeout:90_000});
  expect(await page.evaluate(()=>location.hash.slice(1))).toBe(route);
  expect(errors).toEqual([]);
 });
}
