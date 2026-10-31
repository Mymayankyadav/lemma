import {expect,type Page} from '@playwright/test';

/** A heading, a long skeleton caption, or the first shell paint is NOT a
 * meaningful route render. Each marker below exists only after the route's
 * real S/X data (or, for data-free screens, its usable controls) is mounted.
 * Keep this separate from the cold-navigation clock in stress-cpu.spec.ts.
 */
export async function assertRouteLoaded(
 page:Page,route:string,profile:'stress'|'extreme',timeout=12_000,
):Promise<void>{
 const marker:Record<string,string>={
  '/':'section[aria-label="From your tutor"]',
  '/projects':'[data-project-row]',
  '/projects/new':'#project-title',
  '/p/real-analysis':'button[aria-label^="Switch project from"]',
  '/p/real-analysis/cp/CP4':'section[aria-label="Checkpoint steps"]',
  '/s/real-analysis/7':'section[aria-label="Reasoning"]',
  '/proposals':'section[aria-label="Proposal groups"]',
  '/proposals/proposal-6':'section[aria-label="Plan errata"]',
  '/review':'h2:has-text("Decks")',
  '/review/run':'[data-review-card-scroll]',
  '/review/done':'section[aria-label="Review statistics"]',
  '/cards':'[data-card-row]',
  '/cards/31':'article[aria-label="Card front and answer"]',
  '/atlas':'[data-atlas-row]',
  '/insights':'h2:has-text("Reviews by")',
  '/settings':'h2:has-text("Teaching style")',
  '/sign-in':'button:has-text("Continue with Google")',
  '/kit':'h2:has-text("Surfaces")',
 };
 const selector=marker[route];
 if(!selector)throw Error('Unknown cold CPU route '+route);
 await expect(page.locator(selector).first(),
  'Cold CPU evidence requires real route data/controls, not the shell').toBeVisible({timeout});
 if(route==='/cards'){
  // First page of the actual 5,000/30,000-card S/X fixture, not 4 skeletons.
  await expect(page.locator('[data-card-row]').first()).toHaveAttribute(
   'href','#/cards/'+(profile==='extreme'?'30000':'5000'),{timeout});
  await expect(page.locator('[aria-live="polite"]').filter({hasText:'50 loaded'}))
   .toBeVisible({timeout});
  expect(await page.locator('[data-card-row]').count()).toBeLessThanOrEqual(50);
 }
 if(route==='/proposals/proposal-6'){
  await expect(page.getByRole('heading',{name:'Plan change',exact:true,level:2}))
   .toBeVisible({timeout});
  await expect(page.getByRole('region',{name:'Ideas in this plan'})).toBeVisible({timeout});
 }
 if(route==='/s/real-analysis/7'){
  await expect(page.getByText(/events 1[–-]/).first()).toBeVisible({timeout});
 }
 // An app-level error or delayed skeleton is not a successful loaded route.
 if(route!=='/kit')await expect(page.locator('.animate-pulse.bg-fill-2')).toHaveCount(0,{timeout});
 await expect(page.getByText(/This (card|proposal) could not be loaded\./))
  .toHaveCount(0,{timeout});
 await expect(page.getByText('Session unavailable.')).toHaveCount(0,{timeout});
}
