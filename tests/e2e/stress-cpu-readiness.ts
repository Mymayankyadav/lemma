import {expect,type Page} from '@playwright/test';

/** A heading, a long skeleton caption, or the first shell paint is NOT a
 * meaningful route render. Each marker below exists only after the route's
 * real S/X data (or, for data-free screens, its usable controls) is mounted.
 * Keep this separate from the cold-navigation clock in stress-cpu.spec.ts.
 */
export type ReadinessPhase={name:string;elapsedMs:number};

export async function assertRouteLoaded(
 page:Page,route:string,profile:'stress'|'extreme',timeout=12_000,
 phases?:ReadinessPhase[],
):Promise<void>{
 // Diagnostics only: measure real loaded-state waits, without changing any
 // selector, timeout, skeleton guard, or the caller's strict wall-clock gate.
 const measured=async(name:string,check:()=>Promise<unknown>)=>{
  const started=Date.now();
  try{await check();}finally{phases?.push({name,elapsedMs:Date.now()-started});}
 };
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
  // S/X profiles use demo mode, where the live-only OAuth button is
  // intentionally absent. Require the route's actual explanatory content,
  // not just a heading or a blank shell.
  '/sign-in':'text=Sign-in is available in live mode.',
  '/kit':'h2:has-text("Surfaces")',
 };
 const selector=marker[route];
 if(!selector)throw Error('Unknown cold CPU route '+route);
 await measured('route-marker',()=>expect(page.locator(selector).first(),
  'Cold CPU evidence requires real route data/controls, not the shell').toBeVisible({timeout}));
 if(route==='/cards'){
  // First page of the actual 5,000/30,000-card S/X fixture, not 4 skeletons.
  await measured('cards-first-row',()=>expect(page.locator('[data-card-row]').first()).toHaveAttribute(
   'href','#/cards/'+(profile==='extreme'?'30000':'5000'),{timeout}));
  await measured('cards-loaded-count',()=>expect(page.locator('[aria-live="polite"]').filter({hasText:'50 loaded'}))
   .toBeVisible({timeout}));
  await measured('cards-row-cap',async()=>{
   expect(await page.locator('[data-card-row]').count()).toBeLessThanOrEqual(50);
  });
 }
 if(route==='/proposals/proposal-6'){
  await measured('plan-heading',()=>expect(page.getByRole('heading',{name:'Plan change',exact:true,level:2}))
   .toBeVisible({timeout}));
  await measured('plan-ideas-region',()=>expect(page.getByRole('region',{name:'Ideas in this plan'})).toBeVisible({timeout}));
 }
 if(route==='/s/real-analysis/7'){
  await measured('session-events',()=>expect(page.getByText(/events 1[–-]/).first()).toBeVisible({timeout}));
 }
 // An app-level error or delayed skeleton is not a successful loaded route.
 if(route!=='/kit')await measured('no-skeleton',()=>
  expect(page.locator('.animate-pulse.bg-fill-2')).toHaveCount(0,{timeout}));
 await measured('no-card-proposal-error',()=>expect(page.getByText(/This (card|proposal) could not be loaded\./))
  .toHaveCount(0,{timeout}));
 await measured('no-session-error',()=>expect(page.getByText('Session unavailable.')).toHaveCount(0,{timeout}));
}
