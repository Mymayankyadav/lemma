import {chromium,newCtx,openHash,SCRATCH,DEVICES,BASE,NOW,pickDevices,applyInsets} from './lib.mjs';
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
// node motion.mjs <device|a,b|phones|tablets|all> [case-id ...]  — run on an otherwise idle machine: timings are real.
const [,,devArg,...filters]=process.argv;
const devList=pickDevices(devArg);if(devList.length>1){for(const d of devList)spawnSync(process.execPath,[process.argv[1],d,...filters],{stdio:'inherit',env:process.env});process.exit(0);}
const dev=devList[0];
const out=`${SCRATCH}/motion/${dev}`;mkdirSync(out,{recursive:true});
const jf=`${SCRATCH}/motion/${dev}.json`;
const results=existsSync(jf)&&filters.length?JSON.parse(readFileSync(jf,'utf8')):{};
const ROLES=['button','link','radio','tab','menuitem','menuitemradio','switch','option','checkbox'];
const target=(p,name,exact=false)=>{let l=null;for(const r of ROLES){const q=p.getByRole(r,{name,exact});l=l?l.or(q):q;}return l.first();};

// In-page recorder -----------------------------------------------------------------
const recorder=()=>{
 const R=window.__mot={t0:null,frames:[],anims:[],events:[],cls:[],longFrames:[],seen:new WeakSet(),running:true};
 const sel=e=>{if(!e||!e.tagName)return'?';let s=e.tagName.toLowerCase();const c=[...e.classList].slice(0,2).join('.');return s+(c?'.'+c:'')};
 const rel=t=>t-R.t0;
 let last=performance.now();
 (function tick(now){
  if(!R.running)return;
  R.frames.push(now);
  for(const a of document.getAnimations()){
   if(R.seen.has(a))continue;R.seen.add(a);
   let ct;try{ct=a.effect.getComputedTiming()}catch{continue}
   const kind=a.constructor.name;
   const name=kind==='CSSTransition'?a.transitionProperty:kind==='CSSAnimation'?a.animationName:'waapi';
   let easing='';try{easing=a.effect.getTiming().easing}catch{}
   R.anims.push({kind,name,target:sel(a.effect?.target),dur:ct.duration,delay:ct.delay,iter:ct.iterations,easing,start:R.t0==null?null:rel(now)});
  }
  requestAnimationFrame(tick);
 })(performance.now());
 // arm on first input
 for(const ev of ['pointerdown','keydown','click']){
  addEventListener(ev,e=>{if(R.t0==null){R.t0=e.timeStamp;R.epoch0=performance.timeOrigin+e.timeStamp;R.firstEvent=ev}},{capture:true,once:false});
 }
 for(const ev of ['transitionrun','animationstart']){
  addEventListener(ev,e=>{if(R.t0!=null)R.events.push({type:ev,name:e.propertyName||e.animationName,target:sel(e.target),t:rel(e.timeStamp)})},true);
 }
 try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)R.cls.push({t:e.startTime,v:e.value})}).observe({type:'layout-shift',buffered:false})}catch{}
 try{new PerformanceObserver(l=>{for(const e of l.getEntries())R.longFrames.push({t:e.startTime,d:e.duration,block:e.blockingDuration})}).observe({type:'long-animation-frame',buffered:false})}catch{}
};

async function runCase(browser,dev,name,{hash='/',setup,act,wait=1100,demo='1',hold=0,pre}){
 const ctx=await newCtx(browser,dev,{motion:true});const p=await ctx.newPage();
 try{
  await applyInsets(ctx,p,dev);const c=await ctx.newCDPSession(p);
  await openHash(p,hash,{demo});
  if(setup)await setup(p);
  await p.waitForTimeout(500);
  await p.evaluate(recorder);
  const frames=[];
  c.on('Page.screencastFrame',f=>{frames.push({t:f.metadata.timestamp*1000,data:f.data});c.send('Page.screencastFrameAck',{sessionId:f.sessionId}).catch(()=>{});});
  const d=DEVICES[dev].viewport;
  await c.send('Page.startScreencast',{format:'jpeg',quality:70,everyNthFrame:1,maxWidth:d.width*1,maxHeight:d.height*1});
  await p.waitForTimeout(150);
  const flashPerf=await p.evaluate(async()=>{const d=document.createElement('div');d.style.cssText='position:fixed;inset:0;background:#fff;z-index:2147483647';document.body.append(d);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const t=performance.now();await new Promise(r=>setTimeout(r,160));d.remove();return t;});
  await p.waitForTimeout(250);
  await act(p);
  await p.waitForTimeout(wait);
  await c.send('Page.stopScreencast');
  const rec=await p.evaluate(()=>{const R=window.__mot;R.running=false;
   const f=R.frames.filter(t=>R.t0!=null&&t>=R.t0&&t<=R.t0+1100);
   const gaps=f.slice(1).map((t,i)=>t-f[i]);
   return {t0Perf:R.t0,firstEvent:R.firstEvent,anims:R.anims.filter(a=>a.start!=null),events:R.events,
    cls:R.cls.reduce((s,x)=>s+x.v,0),clsEvents:R.cls.length,longFrames:R.longFrames,
    rafFrames:f.length,rafMaxGap:gaps.length?Math.max(...gaps):0,rafMeanGap:gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:0,
    rafDropped:gaps.filter(g=>g>25).length};});
  const dir=`${out}/${name}`;mkdirSync(dir,{recursive:true});
  const meta=[];
  frames.forEach((f,i)=>{writeFileSync(`${dir}/f${String(i).padStart(3,'0')}.jpg`,Buffer.from(f.data,'base64'));meta.push({i,t:f.t});});
  writeFileSync(`${dir}/frames.json`,JSON.stringify({flashPerf,t0Perf:rec.t0Perf,frames:meta}));
  results[name]={name,dev,hash,frames:frames.length,...rec,animCount:rec.anims.length};
  console.log(dev.padEnd(8),name.padEnd(30),'frames',frames.length,'anims',rec.anims.length,'dropped',rec.rafDropped,'maxGap',rec.rafMaxGap.toFixed(0)+'ms');
 }catch(e){results[name]={name,dev,error:String(e.message).split('\n')[0]};console.log(dev,name,'ERROR',String(e.message).split('\n')[0].slice(0,120));}
 await ctx.close();writeFileSync(jf,JSON.stringify(results));
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
 ['sheet-search-open',{act:tap('Search')}],
 ['sheet-editor-due-picker',{hash:'/tasks?new=1',act:tap('Due:')}],
 ['sheet-quick-focus',{act:tap('Quick focus')}],
 ['popover-path-actions',{hash:'/p/real-analysis',act:tap('More path actions')}],
 ['popover-calendar-view',{hash:`/calendar?view=day&date=2026-11-09`,act:tap('Calendar view')}],
 ['popover-card-menu',{hash:'/projects',act:tap('More for Real Analysis')}],
 ['tabs-path-plan-to-sessions',{hash:'/p/real-analysis',act:tap('Sessions',true)}],
 ['tabs-path-to-cards',{hash:'/p/real-analysis',act:tap('Cards',true)}],
 ['seg-tasks-todo-to-doing',{hash:'/tasks',act:tap('Doing')}],
 ['seg-paths-filter-paused',{hash:'/projects',act:tap('Paused')}],
 ['seg-calendar-day-to-week',{hash:`/calendar?view=day&date=2026-11-09`,setup:null,act:async p=>{await tap('Calendar view')(p);await p.waitForTimeout(300);await tap('Week',true)(p)}}],
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
 ['press-card-link',{hash:'/projects',act:async p=>{const b=p.getByRole('link',{name:/^Real Analysis/}).first();const r=await b.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+Math.min(30,r.height/2));await p.mouse.down();await p.waitForTimeout(450);await p.mouse.move(2,2);await p.mouse.up();}}],
 ['press-task-row-menu',{hash:'/tasks',act:async p=>{const b=p.getByRole('button',{name:/More actions for Work on eigenvectors/}).first();const r=await b.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.waitForTimeout(450);await p.mouse.move(2,2);await p.mouse.up();}}],
];
const cold={'cold-load-today':async browser=>{
 const ctx=await newCtx(browser,dev,{motion:true});const p=await ctx.newPage();const c=await ctx.newCDPSession(p);
 const frames=[];c.on('Page.screencastFrame',f=>{frames.push({t:f.metadata.timestamp*1000,data:f.data});c.send('Page.screencastFrameAck',{sessionId:f.sessionId}).catch(()=>{});});
 await c.send('Page.startScreencast',{format:'jpeg',quality:70,everyNthFrame:1});
 const t0=Date.now();await p.goto(BASE+'#/');await p.waitForSelector('#main-content',{timeout:15000});await p.waitForTimeout(2500);
 await c.send('Page.stopScreencast');
 const dir=`${out}/cold-load-today`;mkdirSync(dir,{recursive:true});const meta=[];
 frames.forEach((f,i)=>{writeFileSync(`${dir}/f${String(i).padStart(3,'0')}.jpg`,Buffer.from(f.data,'base64'));meta.push({i,t:f.t});});
 writeFileSync(`${dir}/frames.json`,JSON.stringify({cold:true,frames:meta}));
 const nav=await p.evaluate(()=>({fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime,lcp:null,nav:performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd}));
 results['cold-load-today']={name:'cold-load-today',dev,frames:frames.length,...nav,anims:[],animCount:0,cold:true};
 console.log(dev,'cold-load-today frames',frames.length,'fcp',nav.fcp);await ctx.close();writeFileSync(jf,JSON.stringify(results));}};
const b=await chromium.launch();
for(const [name,spec] of cases){if(filters.length&&!filters.includes(name))continue;await runCase(b,dev,name,spec);}
for(const [n,fn] of Object.entries(cold)){if(filters.length&&!filters.includes(n))continue;await fn(b);}
await b.close();
