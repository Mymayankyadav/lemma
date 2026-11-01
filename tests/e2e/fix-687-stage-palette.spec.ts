import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

// AUDIT #687: passive stage progress and the secondary finished-row
// Show/Hide control must use graphite, never the red-pencil accent.
// All eight S/X mobile variants retain the original stage controls.
test.describe.configure({retries:0});
for(const profile of ['stress','extreme'] as const)
for(const theme of ['graph','graph-night'] as const)
for(const width of [360,390] as const){
 test('FIX #687 passive Project stage ink '+profile+' '+theme+' '+width,async({page})=>{
  test.setTimeout(90_000);
  await page.setViewportSize({width,height:width===360?740:844});
  await page.goto('/lemma/?demo='+profile+'&theme='+theme+'#/p/real-analysis',{waitUntil:'domcontentloaded'});
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  const stages=page.getByRole('region',{name:'Stages'});
  await expect(stages).toBeVisible();
  const progress=stages.getByRole('img',{name:/percent complete/}).first().locator('span');
  await expect(progress).toBeVisible();
  const summary=stages.locator('[data-done-summary]').first();
  await expect(summary).toBeVisible();
  const show=summary.locator('span').last();
  const palette=await page.evaluate(({progressEl,showEl})=>{
   const progress=document.querySelector(progressEl) as HTMLElement;
   const show=document.querySelector(showEl) as HTMLElement;
   const probe=document.createElement('span');
   probe.style.backgroundColor='var(--ink-2)';
   probe.style.color='var(--ink-2)';
   document.body.appendChild(probe);
   const inkBackground=getComputedStyle(probe).backgroundColor;
   const inkText=getComputedStyle(probe).color;
   probe.style.backgroundColor='var(--accent)';
   probe.style.color='var(--accent)';
   const accentBackground=getComputedStyle(probe).backgroundColor;
   const accentText=getComputedStyle(probe).color;
   probe.remove();
   return {fill:getComputedStyle(progress).backgroundColor,show:getComputedStyle(show).color,
    inkBackground,inkText,accentBackground,accentText};
  },{progressEl:'[data-stage-card] [role="img"][aria-label$="percent complete"] > span',
     showEl:'[data-stage-card] [data-done-summary] > span:last-child'});
  expect(palette.fill,'passive progress fill uses ink-2').toBe(palette.inkBackground);
  expect(palette.show,'secondary Show/Hide uses ink-2').toBe(palette.inkText);
  expect(palette.fill).not.toBe(palette.accentBackground);
  expect(palette.show).not.toBe(palette.accentText);
  const percent=page.getByRole('region',{name:'Goal and distance'}).locator('[data-count-role]').first();
  const percentColor=await percent.evaluate(el=>getComputedStyle(el).color);
  expect(percentColor,'passive overall percentage uses graphite').toBe(palette.inkText);
  await summary.click();
  const done=stages.locator('[data-cp-row][aria-label$=", done"]').first();
  await expect(done).toBeVisible();
  const doneMark=done.locator('span[aria-hidden="true"]').first();
  const doneColor=await doneMark.evaluate(el=>getComputedStyle(el).backgroundColor);
  expect(doneColor,'completed checkpoint mark uses graphite').toBe(palette.inkBackground);
  expect(doneColor).not.toBe(palette.accentBackground);
  const toggle=stages.locator('[data-stage-card] > button').first();
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.locator('*').count()).toBeLessThan(1500);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  mkdirSync('test-results/screens/fix-687',{recursive:true});
  await page.screenshot({path:'test-results/screens/fix-687/stage-ink-'+profile+'-'+theme+'-'+width+'.png',animations:'disabled'});
 });
}
