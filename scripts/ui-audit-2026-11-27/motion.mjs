import {launchBrowser,newCtx,openHash,address,SCRATCH,DEVICES,NOW,pickDevices,applyInsets,profile} from './lib.mjs';
import {control as target,step} from './scene.mjs';
import {startTrace,settle} from './trace.mjs';
import {summariseFrames} from './frames.mjs';
import {scenes} from './catalog.mjs';
import {wantsImage} from './evidence.mjs';
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const [,,devArg,...filters]=process.argv,devices=pickDevices(devArg);
if(devices.length>1){
 for(const d of devices){const r=spawnSync(process.execPath,[process.argv[1],d,...filters],{stdio:'inherit'});if(r.status!==0)process.exitCode=1;}
 process.exit(process.exitCode??0);
}
const dev=devices[0],out=SCRATCH+'/motion',file=out+'/'+dev+'.json';
mkdirSync(out,{recursive:true});
const results=filters.length&&existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};

// Timings use the browser's performance time origin and CDP frame timestamps (epoch milliseconds).
// An animated transition and a one-frame cut can both change pixels without producing a CSS event.
async function runCase(browser,name,{hash='/',demo='1',setup,act,wait=500,cold=false}){
 const ctx=await newCtx(browser,dev),page=await ctx.newPage();
 try{
  await applyInsets(ctx,page,dev);
  const cdp=await ctx.newCDPSession(page),frames=[],strip=wantsImage(dev,'motion',name);
  const size=DEVICES[dev].viewport;
  cdp.on('Page.screencastFrame',event=>{
   if(event.metadata.timestamp!=null)frames.push({t:event.metadata.timestamp*1000,data:event.data});
   void cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});
  });
  if(cold){await page.clock.setFixedTime(NOW);await page.addInitScript(startTrace);}
  else{await openHash(page,hash,{demo});await setup?.(page);await settle(page);await page.evaluate(startTrace);}
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:strip?86:65,maxWidth:strip?size.width:192,maxHeight:strip?size.height:Math.round(192*size.height/size.width),everyNthFrame:1});
  await page.waitForTimeout(85);
  if(cold){
   await page.goto(address(hash,demo),{waitUntil:'domcontentloaded'});await page.locator('#main-content').waitFor();
  }else await act(page);
  await page.waitForTimeout(wait);await settle(page);
  await cdp.send('Page.stopScreencast');
  const trace=await page.evaluate(()=>window.__endAuditTrace());
  const anchor=cold?await page.evaluate(()=>performance.timeOrigin):trace.epoch+(trace.inputMs??0);
  const {image,...visual}=await page.evaluate(summariseFrames,{frames,anchor,strip});
  if(!visual.frames)throw new Error('Chromium returned no compositor frames');
  if(image){
   mkdirSync(out+'/strips',{recursive:true});
   writeFileSync(out+'/strips/'+dev+'-'+name+'.png',Buffer.from(image,'base64'));
  }
  results[name]={name,dev,profile,hash,finalHash:await page.evaluate(()=>location.hash),...trace,visual};
  console.log(dev,name,visual.frames,'frames',trace.animations.length,'animations');
 }catch(e){results[name]={error:e.message.split('\n')[0]};console.error(dev,name,results[name].error);process.exitCode=1;}
 finally{await ctx.close();writeFileSync(file,JSON.stringify(results));}
}
const tap=(name,exact)=>p=>target(p,name,exact).click({timeout:5000});
const cases=[
 ['route-today-to-paths',{act:tap('Paths',true)}],
 ['route-warm-today-to-paths',{setup:async p=>{await tap('Paths',true)(p);await p.waitForTimeout(1200);await tap('Today',true)(p);await p.waitForTimeout(1200)},act:tap('Paths',true)}],
 ['route-warm-paths-to-calendar',{hash:'/projects',setup:async p=>{await tap('Calendar',true)(p);await p.waitForTimeout(1500);await tap('Paths',true)(p);await p.waitForTimeout(1200)},act:tap('Calendar',true)}],
 ['route-paths-to-review',{hash:'/projects',act:tap('Review')}],
 ['route-review-to-calendar',{hash:'/review',act:tap('Calendar',true)}],
 ['route-calendar-to-progress',{hash:`/calendar?view=day&date=2026-11-09`,act:tap('Progress',true)}],
 ['route-open-path-detail',{hash:'/projects',act:p=>p.getByRole('link',{name:/^Real Analysis/}).first().click()}],
 ['route-path-back',{hash:'/p/real-analysis',act:tap('Back')}],
 ['route-settings-open-appearance',{hash:'/settings',act:p=>p.getByRole('link',{name:/^Appearance/}).first().click()}],
 ['route-today-to-settings-gear',{act:tap('Settings')}],
 ['sheet-capture-open',{act:tap('Capture',true)}],
 ['sheet-capture-close',{setup:tap('Capture',true),act:tap('Close')}],
 ['sheet-capture-to-editor',{setup:async p=>{await tap('Capture',true)(p);await p.waitForTimeout(700)},act:tap('Add details')}],
 ['sheet-capture-switch-type',{setup:async p=>{await tap('Capture',true)(p);await p.waitForTimeout(700)},act:tap('Time block')}],
 ['sheet-search-open',{act:p=>step(p,'search')}],
 ['sheet-editor-due-picker',{hash:'/tasks?new=1',act:tap('Due:')}],
 ['sheet-quick-focus',{act:tap('Quick focus')}],
 ['popover-path-actions',{hash:'/p/real-analysis',act:tap('More path actions')}],
 ['popover-calendar-view',{hash:`/calendar?view=day&date=2026-11-09`,act:p=>step(p,'calendarChoices')}],
 ['popover-card-menu',{hash:'/projects',act:tap('More for Real Analysis')}],
 ['tabs-path-plan-to-sessions',{hash:'/p/real-analysis',act:tap('Sessions',true)}],
 ['tabs-path-to-cards',{hash:'/p/real-analysis',act:tap('Cards',true)}],
 ['seg-tasks-todo-to-doing',{hash:'/tasks',act:p=>step(p,'taskColumn:Doing')}],
 ['seg-paths-filter-paused',{hash:'/projects',act:tap('Paused')}],
 ['seg-calendar-day-to-week',{hash:`/calendar?view=day&date=2026-11-09`,setup:null,act:async p=>{await step(p,'calendarChoices');await p.waitForTimeout(300);await tap('Week',true)(p)}}],
 ['seg-progress-range-30d',{hash:'/insights',act:tap('30 days')}],
 ['expand-today-daily-targets',{act:tap('Daily targets')}],
 ['expand-path-stage',{hash:'/p/real-analysis',act:tap('MAJOR THEOREMS')}],
 ['toggle-task-complete',{hash:'/tasks',act:p=>p.getByRole('checkbox',{name:/Complete Work on eigenvectors/}).first().click()}],
 ['toggle-review-switch',{hash:'/review',act:p=>p.getByRole('switch').first().click()}],
 ['review-show-answer',{hash:'/review',setup:async p=>{await tap('Start review')(p);await p.waitForTimeout(900)},act:tap('Show answer')}],
 ['review-grade-next',{hash:'/review',setup:async p=>{await tap('Start review')(p);await p.waitForTimeout(900);await tap('Show answer')(p);await p.waitForTimeout(700)},act:p=>p.getByRole('group',{name:'Grade answer'}).getByRole('button').nth(2).click()}],
 ['focus-start-now',{act:tap('Start now')}],
 ['calendar-day-chip',{hash:`/calendar?view=day&date=2026-11-09`,act:tap('Wednesday, November 11')}],
 ['calendar-open-block',{hash:`/calendar?view=day&date=2026-11-09`,act:tap('Solve analysis problems, Planned')}],
 ['atlas-open',{hash:'/projects',act:tap('Atlas',true),wait:1800}],
 ['atlas-concept-peek',{hash:'/atlas',setup:p=>p.waitForTimeout(1500),act:async p=>{await tap('Search concepts')(p);await p.waitForTimeout(350);await p.locator('input').first().fill('compact');await p.waitForTimeout(350);await tap('Compactness')(p)}}],
 ['press-primary-button',{hash:'/review',act:async p=>{const b=p.getByRole('button',{name:/^Start review/}).first();await b.scrollIntoViewIfNeeded();await p.waitForTimeout(200);const r=await b.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.waitForTimeout(450);await p.mouse.move(2,2);await p.mouse.up();}}],
 ['press-secondary-button',{act:async p=>{const b=p.getByRole('link',{name:'Continue studying'}).first();await b.scrollIntoViewIfNeeded();await p.waitForTimeout(200);const r=await b.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.waitForTimeout(450);await p.mouse.move(2,2);await p.mouse.up();}}],
 ['press-nav-tab',{act:async p=>{const b=p.getByRole('link',{name:'Calendar'}).first();const r=await b.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.waitForTimeout(450);await p.mouse.move(2,2);await p.mouse.up();}}],
 ['press-card-link',{hash:'/projects',act:async p=>{const b=p.getByRole('link',{name:/^Real Analysis/}).first();await b.scrollIntoViewIfNeeded();const r=await b.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+Math.min(30,r.height/2));await p.mouse.down();await p.waitForTimeout(450);await p.mouse.move(2,2);await p.mouse.up();}}],
 ['press-task-row-menu',{hash:'/tasks',act:async p=>{const b=p.getByRole('button',{name:/More actions for Work on eigenvectors/}).first();const r=await b.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.waitForTimeout(450);await p.mouse.move(2,2);await p.mouse.up();}}],
];

// Input-specific paths that a control click cannot replay.
const tutor='/p/real-analysis/cp/CP4/tutor';
const composer=async p=>{await tap('Write a question')(p);await p.getByRole('textbox',{name:'Your answer'}).focus();};
const answer=async p=>{await tap('Start review')(p);await tap('Show answer')(p);};
const exam='/p/linear-algebra?tab=exam&examSitting=demo-exam-project-linear';
const drag=async(p,el,dx,dy)=>{
 await el.scrollIntoViewIfNeeded();const r=await el.boundingBox();
 const x=r.x+Math.min(32,r.width/2),y=r.y+Math.min(24,r.height/2);
 if(DEVICES[dev].touch){
  const c=await p.context().newCDPSession(p);
  try{
   await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   for(let i=1;i<=12;i++)await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/12,y:y+dy*i/12}]});
   await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }finally{await c.detach();}
  return;
 }
 await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+dx,y+dy,{steps:12});await p.mouse.up();
};
cases.push(
 ['cold-load-today',{cold:true}],
 ['capture-discard-back',{setup:async p=>{await tap('Capture',true)(p);await step(p,'fill:An unfinished task');},act:p=>p.keyboard.press('Escape')}],
 ['capture-type-context-menu',{act:async p=>{await target(p,'Capture',true).focus();await p.keyboard.press('ContextMenu');}}],
 ['sheet-dismiss-drag',{setup:tap('Capture',true),act:async p=>{const dialog=p.locator('dialog[open]');const box=await dialog.boundingBox();if(box.y+box.height<p.viewportSize().height-1)await p.keyboard.press('Escape');else await drag(p,dialog.locator('.v7-grabber,.v7-sheet-header').filter({visible:true}).first(),0,box.height*.65);await dialog.waitFor({state:'hidden'});}}],
 ['workspace-history-back',{setup:async p=>{await tap('Start now')(p);await p.waitForURL(/#\/focus(?:\?|$)/);},act:p=>p.goBack()}],
 ['review-grade-swipe',{hash:'/review',setup:answer,act:p=>drag(p,p.locator('.v7-review-card').first(),230,0)}],
 ['tutor-keyboard-maths',{hash:tutor,setup:composer,act:tap('Maths symbols',true)}],
 ['tutor-keyboard-hide',{hash:tutor,setup:composer,act:tap('Hide keyboard',true)}],
 ['tutor-paper-fullscreen',{hash:tutor,setup:async p=>{await composer(p);await tap('Scratch',true)(p);},act:tap('Full screen',true)}],
 ['pad-keys-tab',{hash:'/pad?path=real-analysis&checkpoint=CP4',setup:tap('Use math keyboard'),act:tap('Calculus',true)}],
 ['exam-row-to-editor',{hash:exam,setup:tap('Write the matrix of a linear transformation'),act:tap('Edit row',true)}],
 ['day-closed',{hash:'/today/close',act:tap('Close the day')}],
);
cases.push(
 ['inbox-swipe-approve',{hash:'/proposals',act:p=>drag(p,p.locator('.v7-inbox-front').first(),175,0)}],
 ['inbox-swipe-spring-back',{hash:'/proposals',act:p=>drag(p,p.locator('.v7-inbox-front').first(),45,0)}],
 ['atlas-camera',{hash:'/atlas',act:tap('Go to Topology')}],
 ['atlas-camera-pan',{hash:'/atlas',act:p=>drag(p,p.locator('.v7-atlas-sky canvas').first(),80,40)}],
 ['review-undo-grade',{hash:'/review',setup:async p=>{await answer(p);await p.locator('button[data-grade="good"]').click();},act:tap('Undo last answer')}],
 ['tasks-reorder-key',{hash:'/tasks',setup:async p=>{
   for(const name of ['Audit first task','Audit second task']){
    await tap('Capture',true)(p);await p.getByRole('textbox',{name:'What do you want to add?'}).fill(name);
    await tap('Add task',true)(p);await p.locator('dialog[open]').waitFor({state:'hidden'});
   }
   await p.reload();await p.getByRole('region',{name:'No date',exact:true}).waitFor();
  },act:async p=>{const handles=p.getByRole('region',{name:'No date',exact:true}).getByRole('button',{name:/^(Reorder|Move) Audit /});
   await handles.first().focus();await p.keyboard.press('ArrowDown');}}],
 ['calendar-block-key-resize',{hash:'/calendar?view=day&date=2026-11-09',act:async p=>{await target(p,'Solve analysis problems, Planned').focus();await p.keyboard.press('Alt+Shift+ArrowDown');}}],
 ['tutor-key-long-press',{hash:tutor,setup:composer,act:async p=>{const key=p.locator('.kb .k[aria-label="e" i]').first();const r=await key.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.waitForTimeout(650);await p.mouse.up();}}],
);
// A warm hand-off to each catalogued address complements the cold entry trace in capture.mjs.
// Keep the target's actual query string; e.g. Calendar Week and Calendar Month own different surfaces.
const addresses=new Set();
for(const sc of scenes){
 if(sc.demo||sc.native||sc.account||sc.loading||sc.chunkError||addresses.has(sc.hash))continue;
 addresses.add(sc.hash);
 const from=sc.hash==='/'?'/projects':'/';
 cases.push(['warm-'+sc.id,{
  hash:sc.hash,
  setup:async p=>{await p.evaluate(hash=>{location.hash=hash;},from);await p.waitForFunction(hash=>location.hash.slice(1)===hash,from);await settle(p);},
  act:async p=>{await p.evaluate(hash=>{location.hash=hash;},sc.hash);await p.locator('main:visible').first().waitFor();},
 }]);
}
if(filters.some(f=>!cases.some(([id])=>id===f)))throw new Error('Unknown motion case');
const browser=await launchBrowser();
try{for(const [id,spec] of cases)if(!filters.length||filters.includes(id))await runCase(browser,id,spec);}
finally{await browser.close();}
