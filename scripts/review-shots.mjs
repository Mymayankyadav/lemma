/* N220 review build only (this file replaces scripts/review-shots.mjs on the review branch, never in the PR):
 * phone captures of the screens the Owner reported, in Night and Day, plus page errors and a few measurements.
 */
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

const base=(process.env.BASE_URL||'http://localhost:4173/lemma/').replace(/\/$/,'')+'/';
const NOW=new Date('2026-11-09T13:43:00+05:30'),DATE='2026-11-09';
const out='review-shots/n220';
const click=(name,options={})=>async page=>{await page.getByRole('button',{name,exact:true,...options}).first().click({timeout:6000});};
const scenes=[
 ['today','/'],
 ['calendar-day','/calendar?view=day&date='+DATE],
 ['calendar-week','/calendar?view=week&date='+DATE],
 ['calendar-month','/calendar?view=month&date='+DATE],
 ['calendar-agenda','/calendar?view=agenda&date='+DATE],
 ['calendar-view-menu','/calendar?view=day&date='+DATE,click('Calendar view: Day')],
 ['calendar-actions','/calendar?view=day&date='+DATE,click('Calendar actions')],
 ['calendar-block-sheet','/calendar?view=day&date='+DATE+'&new=block'],
 ['calendar-quick','/calendar?view=day&date='+DATE+'&quick=1'],
 ['calendar-planner','/calendar?view=day&date='+DATE+'&plan=1'],
 ['atlas','/atlas',async page=>{await page.locator('.v7-atlas-sky[data-layout]').waitFor({timeout:8000});await page.waitForTimeout(900);}],
 ['atlas-peek','/atlas?id=concept-compactness',async page=>{await page.locator('.v7-atlas-sky[data-layout]').waitFor({timeout:8000});await page.waitForTimeout(900);}],
 ['path','/p/real-analysis'],
 ['path-goal-open','/p/real-analysis',async page=>{await page.locator('.v7-path-goal-line').first().click();}],
 ['path-menu','/p/real-analysis',click('More path actions')],
 ['path-sources','/p/real-analysis',async page=>{await page.getByRole('tab',{name:'Sources',exact:true}).click();}],
 ['practice-record','/practice',async page=>{await page.getByRole('list',{name:'Practice topics'}).getByRole('button',{name:/^Practice /}).first().click({timeout:6000});}],
 ['progress','/insights',async page=>{await page.locator('section.v7-chart [data-chart-point]').first().click({timeout:6000});}],
 ['progress-learning','/insights?tab=learning'],
 ['capture','/',click('Capture')],
 ['settings','/settings'],
 ['settings-study','/settings?section=study',null,true],
 ['settings-study-advanced','/settings?section=study&advanced=1',null,true],
 ['settings-reminders','/settings?section=reminders',null,true],
 ['settings-data','/settings?section=data',null,true],
 ['settings-tutor','/settings?section=tutor',null,true],
 ['settings-planning','/settings?section=planning',null,true],
 ['settings-tip','/settings?section=data',async page=>{await page.getByRole('button',{name:'About Backup',exact:true}).click();}],
 ['tutor-keys','/p/real-analysis/cp/CP4/tutor',async page=>{
   await page.getByRole('button',{name:'Write a question',exact:true}).click({timeout:6000});
   await page.getByRole('textbox',{name:'Your answer',exact:true}).click();
 }],
 ['tutor-typing','/p/real-analysis/cp/CP4/tutor',async page=>{
   await page.getByRole('button',{name:'Write a question',exact:true}).click({timeout:6000});
   const answer=page.getByRole('textbox',{name:'Your answer',exact:true});
   await answer.click();
   const keys=page.getByRole('group',{name:'Answer keyboard',exact:true});
   for(const key of ['L','e','t','Space','x','Space','b','e','Space','c','o','n'])await keys.getByRole('button',{name:key==='L'?'l':key,exact:true}).click();
 }],
 ['tutor-math','/p/real-analysis/cp/CP4/tutor',async page=>{
   await page.getByRole('button',{name:'Write a question',exact:true}).click({timeout:6000});
   await page.getByRole('textbox',{name:'Your answer',exact:true}).click();
   await page.getByRole('group',{name:'Answer keyboard',exact:true}).getByRole('button',{name:'Maths symbols',exact:true}).click();
 }],
 ['tutor-actions','/p/real-analysis/cp/CP4/tutor',async page=>{
   await page.getByRole('button',{name:'Write a question',exact:true}).click({timeout:6000});
   await page.getByRole('button',{name:'Edit answer',exact:true}).click();
 }],
 ['review-answer','/review',async page=>{
   await page.getByRole('button',{name:/^(Start review|Start \d+ cards?|Resume)/}).first().click({timeout:6000});
   await page.waitForTimeout(500);
   await page.keyboard.press('Space');
 }],
];
const day=new Set(['calendar-day','calendar-block-sheet','path','progress','settings-study','tutor-keys','practice-record','atlas-peek']);
const log={errors:{},measures:{}};
const browser=await chromium.launch();
for(const scheme of ['dark','light']){
 const dir=join(out,scheme==='dark'?'night':'day');mkdirSync(dir,{recursive:true});
 for(const [name,hash,prepare,full] of scenes){
  if(scheme==='light'&&!day.has(name))continue;
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:scheme,reducedMotion:'reduce',locale:'en-IN',timezoneId:'Asia/Kolkata'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push('pageerror: '+error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push('console: '+message.text().slice(0,300));});
  try{
   await page.clock.setFixedTime(NOW);
   await page.goto(base+'?demo=1#'+hash,{waitUntil:'domcontentloaded'});
   await page.locator('html[data-v7]').waitFor({timeout:12000});
   await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{});
   await page.waitForTimeout(600);
   if(prepare)await prepare(page);
   await page.waitForTimeout(700);
   await page.evaluate(()=>document.fonts.ready);
   await page.screenshot({path:join(dir,name+'.png'),animations:'disabled',fullPage:!!full});
   if(scheme==='dark'){
    log.measures[name]=await page.evaluate(()=>{
     const box=selector=>{const node=document.querySelector(selector);if(!node)return null;const r=node.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];};
     return {scrollWidth:document.documentElement.scrollWidth,hubBar:box('.v7-hub-bar'),toolbar:box('.v7-cal-toolbar'),grid:box('[aria-label="Day time grid"]'),
      sheet:box('dialog[open]'),sheetTitle:box('dialog[open] .v7-sheet-title'),footer:box('dialog[open] .v7-sheet-footer'),keyboard:box('[data-v7-keyboard]'),
      space:box('[data-v7-keyboard] .k.space'),strip:box('[data-v7-keyboard] .strip'),compass:document.querySelectorAll('.v7-atlas-compass button').length,
      peek:box('.v7-atlas-sheet'),tooltip:box('.v7-chart-tooltip')};
    });
   }
  }catch(error){errors.push('capture: '+String(error).slice(0,400));await page.screenshot({path:join(dir,name+'-failed.png')}).catch(()=>{});}
  if(errors.length)log.errors[(scheme==='dark'?'night/':'day/')+name]=errors;
  console.log('Captured',scheme,name,errors.length?'with '+errors.length+' error(s)':'');
  await context.close();
 }
}
await browser.close();
writeFileSync(join(out,'log.json'),JSON.stringify(log,null,1));
