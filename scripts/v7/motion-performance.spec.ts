import {expect,test,type Locator} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {at,DATE,NOW} from '../../tests/e2e/v7-scenes';
import {enableSurfaceBeta} from '../../tests/e2e/helpers/surface-preview';

type Feedback={selector:string;style?:boolean};
type ProbeOptions={event:'pointerdown'|'click'|'keydown'|'wheel';feedback:Feedback;completed?:string;finished?:string};
type TraceEvent={name:string;ph:string;ts:number;pid:number;tid:number};
type InteractionTiming=PerformanceEventTiming&{interactionId?:number};
type InteractionSample=Pick<InteractionTiming,'name'|'startTime'|'processingStart'|'processingEnd'|'duration'|'interactionId'>;
type LayoutShift=PerformanceEntry&{value:number;hadRecentInput:boolean;sources:{node:Node|null}[]};

async function point(target:Locator){
 await expect(target).toBeEnabled({timeout:12_000});
 await target.scrollIntoViewIfNeeded();
 const box=await target.boundingBox();
 if(!box)throw new Error('Performance target has no bounds');
 return {x:box.x+box.width/2,y:box.y+box.height/2};
}

// This probe stays on the page thread. Automation round trips, image decoding
// and network quiet time do not count toward its input or frame measurements.
function armProbe({event,feedback,completed,finished}:ProbeOptions){
 const target=document.querySelector(feedback.selector);
 if(feedback.style&&!target||!feedback.style&&target)throw new Error('Unexpected initial feedback state for '+feedback.selector);
 function style(node:Element){
  const css=getComputedStyle(node);
  return [css.transform,css.backgroundColor,css.backgroundImage].join('|');
 }
 const before=feedback.style&&target?style(target):null;
 const timings:InteractionTiming[]=[];
 const shifts:LayoutShift[]=[];
 const eventTimings=(entries:PerformanceEntryList)=>entries.filter((entry):entry is InteractionTiming=>entry.entryType==='event');
 const timing=new PerformanceObserver(list=>timings.push(...eventTimings(list.getEntries())));
 const layout=new PerformanceObserver(list=>shifts.push(...list.getEntries() as typeof shifts));
 timing.observe({type:'event',durationThreshold:16} as PerformanceObserverInit);
 layout.observe({type:'layout-shift'});
 const reading=new Promise<{
  firstFeedbackMs:number|null;completionMs:number|null;transitionMs:number;frameGapsMs:number[];
  eventTiming:InteractionSample[];
  cls:number;layoutShifts:{ms:number;value:number;hadRecentInput:boolean;sources:string[]}[];timedOut:boolean;
 }>(resolve=>{
  let previous:number|null=null;
  let baseline=requestAnimationFrame(function rememberFrame(frame){
   previous=frame;
   baseline=requestAnimationFrame(rememberFrame);
  });
  addEventListener(event,input=>{
   cancelAnimationFrame(baseline);
   performance.mark('lemma-motion/input',{startTime:input.timeStamp});
   const frames:number[]=[];
   let first:number|null=null,completion:number|null=null,stable=0;
   previous??=input.timeStamp;
   function sample(frame:number){
    const now=performance.now(),node=document.querySelector(feedback.selector);
    if(previous!==null)frames.push(frame-previous);
    previous=frame;
    if(first===null&&node&&(!feedback.style||style(node)!==before))first=now;
    if(completion===null&&(completed?document.querySelector(completed):first!==null))completion=now;
    const ready=completion!==null&&first!==null&&(!finished||!!document.querySelector(finished))&&!document.getAnimations().some(animation=>
     animation.playState==='running'&&Number.isFinite(animation.effect?.getComputedTiming().endTime));
    stable=ready?stable+1:0;
    const timedOut=now-input.timeStamp>=3000;
    if(stable<3&&!timedOut){requestAnimationFrame(sample);return;}
    performance.mark('lemma-motion/settled');
    // Leave one task for the browser to deliver the paint entries from the last frame.
    setTimeout(()=>{
     timings.push(...eventTimings(timing.takeRecords()));
     shifts.push(...layout.takeRecords() as typeof shifts);
     timing.disconnect();layout.disconnect();
     const eligible=shifts.filter(entry=>entry.startTime>=input.timeStamp);
     let cls=0,start:number|null=null,last=0,windowSum=0;
     for(const entry of eligible.filter(shift=>!shift.hadRecentInput)){
      if(start===null||entry.startTime-last>1000||entry.startTime-start>5000){start=entry.startTime;windowSum=0;}
      last=entry.startTime;
      windowSum+=entry.value;
      cls=Math.max(cls,windowSum);
     }
     resolve({
      firstFeedbackMs:first===null?null:first-input.timeStamp,
      completionMs:completion===null?null:completion-input.timeStamp,transitionMs:now-input.timeStamp,
      frameGapsMs:frames,
      eventTiming:timings.filter(entry=>entry.startTime>=input.timeStamp).map(entry=>({
       name:entry.name,startTime:entry.startTime,processingStart:entry.processingStart,
       processingEnd:entry.processingEnd,duration:entry.duration,interactionId:entry.interactionId,
      })),
      cls,layoutShifts:eligible.map(entry=>({ms:entry.startTime-input.timeStamp,value:entry.value,
       hadRecentInput:entry.hadRecentInput,sources:entry.sources.map(({node})=>node instanceof Element?node.localName+'.'+[...node.classList].join('.'):'')})),timedOut,
     });
    },0);
   }
   requestAnimationFrame(sample);
  },{capture:true,once:true});
 });
 return {reading};
}

// DrawFrame is recorded by Chromium's compositor. Keep separate frame streams
// on separate threads and count only gaps between frames within the input window.
function compositorFrames(events:TraceEvent[]){
 const input=events.find(entry=>entry.name==='lemma-motion/input')?.ts;
 const settled=events.find(entry=>entry.name==='lemma-motion/settled')?.ts;
 if(input===undefined||settled===undefined)return {draws:0,maxDrawGapMs:null};
 const streams=new Map<string,number[]>();
 for(const entry of events){
  if(entry.name!=='DrawFrame'||entry.ts<input||entry.ts>settled)continue;
  const key=entry.pid+'-'+entry.tid,stream=streams.get(key)??[];
  stream.push(entry.ts/1000);streams.set(key,stream);
 }
 const gaps=[...streams.values()].flatMap(stream=>{
  const times=[...new Set(stream)].sort((a,b)=>a-b);
  return times.slice(1).map((time,index)=>time-times[index]);
 });
 return {draws:[...streams.values()].reduce((sum,stream)=>sum+stream.length,0),
  maxDrawGapMs:gaps.length?Math.max(...gaps):null};
}

test.use({timezoneId:'Asia/Kolkata',serviceWorkers:'block',deviceScaleFactor:1});

test('warmed motion budgets at 4× Chromium CPU throttle',async({page,context},info)=>{
 test.setTimeout(100_000);
 await enableSurfaceBeta(page);
 // Freeze the demo's wall clock while keeping native rAF, Performance and timers.
 await page.addInitScript(date=>{
  const NativeDate=Date;
  window.Date=new Proxy(NativeDate,{
   apply:()=>new NativeDate(date).toString(),
   construct:(target,args,newTarget)=>Reflect.construct(target,args.length?args:[date],newTarget),
   get:(target,key,receiver)=>key==='now'?()=>date:Reflect.get(target,key,receiver),
  });
 },NOW.getTime());
 await page.setViewportSize({width:1280,height:640});
 await page.emulateMedia({colorScheme:'light',reducedMotion:'no-preference'});
 const session=await context.newCDPSession(page);
 const pending=new Set<import('@playwright/test').Request>();
 let changed=Date.now();
 const failures:string[]=[];
 page.on('request',request=>{pending.add(request);changed=Date.now();});
 page.on('requestfinished',request=>{pending.delete(request);changed=Date.now();});
 page.on('requestfailed',request=>{
  failures.push(request.failure()?.errorText+' '+new URL(request.url()).pathname);
  pending.delete(request);changed=Date.now();
 });
 async function networkQuiet(){
  const start=Date.now();
  while((pending.size||Date.now()-changed<300)&&Date.now()-start<3000)
   await new Promise(resolve=>setTimeout(resolve,25));
  return {ms:Date.now()-start,quiet:pending.size===0&&Date.now()-changed>=300};
 }
 const idle=async()=>page.waitForFunction(()=>!document.getAnimations().some(animation=>
  animation.playState==='running'&&Number.isFinite(animation.effect?.getComputedTiming().endTime)));
 const go=async(route:string)=>page.goto(at(route).replace('demo=1','demo=1&mode=day'));
 const main=(name:string)=>page.getByRole('main',{name,exact:true});
 const capture=page.getByRole('button',{name:'Capture',exact:true}).filter({visible:true}).first();
 const field=page.getByRole('textbox',{name:'What do you want to add?'});
 const dialog=page.locator('dialog.v7-sheet[open]');
 const tabs=page.getByRole('navigation',{name:'Main navigation'});
 const opener=page.getByRole('button',{name:/^(Start review, \d+ cards?|Resume)/}).first();
 const show=page.getByRole('button',{name:'Show answer'});
 const calendar=main('Calendar');
 const view=(name:string)=>page.getByRole('radio',{name,exact:true});
 const sky=page.locator('.v7-atlas-sky');
 let atlasZoom:string|null=null;
 const routeFeedback='[data-loading-surface="route-progress"],';
 const pathLink=()=>page.getByRole('link',{name:/Real Analysis/}).filter({visible:true}).first();
 const closeCapture=async(dirty=false)=>{
  await page.keyboard.press('Escape');
  if(dirty){
   await page.keyboard.press('Escape');
   await page.getByRole('button',{name:'Discard changes',exact:true}).click();
  }
  await expect(dialog).toHaveCount(0);await idle();
 };

 type Scenario=ProbeOptions&{
  name:string;setup:()=>Promise<Locator|null>;action?:()=>Promise<void>;
  check:()=>Promise<void>;reset?:()=>Promise<void>;feedbackBudget?:number;clsBudget?:number;
 };
 const cases:Scenario[]=[
  {name:'press',event:'pointerdown',feedback:{selector:'.v7-rv button.v7-primary',style:true},feedbackBudget:100,
   setup:async()=>{await go('/review');return opener;},
   action:()=>page.mouse.down(),check:async()=>expect(opener).toBeVisible(),
   reset:async()=>{await page.mouse.move(0,0);await page.mouse.up();}},
  {name:'sheet-enter',event:'click',feedback:{selector:'dialog.v7-sheet[open]'},completed:'.v7-capture-field:focus',feedbackBudget:100,
   setup:async()=>{await go('/');return capture;},check:async()=>expect(field).toBeFocused(),reset:()=>closeCapture()},
  {name:'sheet-step',event:'click',feedback:{selector:'dialog[open] button[aria-label="Back"]'},
   setup:async()=>{
    await go('/');await capture.click();await field.fill('Work through exercise tomorrow');
    await page.getByRole('radio',{name:'Task',exact:true}).click();
    return page.getByRole('button',{name:'Add details',exact:true});
   },check:async()=>expect(dialog.getByRole('button',{name:'Back',exact:true})).toBeVisible(),reset:()=>closeCapture(true)},
  {name:'sheet-exit',event:'click',feedback:{selector:'[data-layer-exit]'},
   completed:'body:not(:has([data-layer-exit],dialog[open]))',setup:async()=>{
    await go('/');await capture.click();
    return dialog.getByRole('button',{name:'Close',exact:true});
   },check:async()=>expect(dialog).toHaveCount(0)},
  {name:'route-tab',event:'click',feedback:{selector:'.v7-tab[data-tab-destination],'+routeFeedback+'.v7-paths'},
   completed:'.v7-paths',feedbackBudget:100,clsBudget:.05,
   setup:async()=>{await go('/');return tabs.getByRole('link',{name:'Paths',exact:true});},
   check:async()=>expect(page.getByRole('heading',{name:'Paths',exact:true,level:1})).toBeVisible()},
  {name:'route-push',event:'click',feedback:{selector:routeFeedback+'main[aria-label="Path"]'},
   completed:'main[aria-label="Path"] .v7-detail-title',feedbackBudget:100,clsBudget:.05,
   setup:async()=>{await go('/projects');return pathLink();},
   check:async()=>expect(page.getByRole('heading',{name:'Real Analysis',exact:true,level:1})).toBeVisible()},
  {name:'review-advance',event:'keydown',feedback:{selector:'.v7-review-pending,main[aria-label="Review round"][data-revealed="false"]'},
   completed:'.v7-review-front:focus',
   setup:async()=>{
    await go('/review');await opener.click();await show.click();return null;
   },action:()=>page.keyboard.press('3'),check:async()=>expect(page.getByRole('group',{name:'Question',exact:true})).toBeFocused()},
  {name:'calendar-view',event:'click',feedback:{selector:'main[data-calendar-view="week"]'},clsBudget:0,
   completed:'.v7-cal-pane:not([data-exiting]) [aria-label="Week time grid"]',
   finished:'.v7-cal:not(:has(.v7-cal-pane[data-exiting],.v7-cal-pane[aria-busy="true"]))',
   setup:async()=>{await go('/calendar?view=day&date='+DATE);return view('Week');},
   check:async()=>expect(view('Week')).toBeChecked()},
  {name:'calendar-header',event:'wheel',feedback:{selector:'.v7-cal .v7-hub-bar[data-collapsed="true"]'},clsBudget:0,
   setup:async()=>{
    await go('/calendar?view=month&date='+DATE);
    await page.evaluate(()=>scrollTo(0,0));await expect(calendar).toBeVisible();
    await page.mouse.move(480,350);return null;
   },action:()=>page.mouse.wheel(0,48),
   check:async()=>expect(calendar.locator('.v7-hub-bar')).toHaveAttribute('data-collapsed','true')},
  {name:'atlas-camera',event:'click',feedback:{selector:'.v7-atlas-sky[data-camera-moving]'},
   completed:'.v7-atlas-sky:not([data-camera-moving])',
   setup:async()=>{
    if(await sky.isVisible())await go('/');
    await go('/atlas?view=map&id=concept-compactness');
    await expect(sky).toHaveAttribute('data-selected','concept-compactness');
    await expect(sky).not.toHaveAttribute('data-camera-moving',/.+/);
    atlasZoom=await sky.getAttribute('data-zoom');
    return page.getByRole('button',{name:'Zoom in',exact:true});
   },check:async()=>expect(sky).not.toHaveAttribute('data-zoom',atlasZoom??'')},
 ];
 await go('/');
 await expect(capture).toBeVisible();
 const results:Record<string,unknown>[]=[];
 try{
  for(const scene of cases)await test.step(scene.name,async()=>{
   const exercise=async(target:Locator|null)=>{
    const cursor=target?await point(target):null;
    if(cursor)await page.mouse.move(cursor.x,cursor.y);
    return async()=>{
     if(scene.action)await scene.action();
     else if(cursor)await page.mouse.click(cursor.x,cursor.y);
    };
   };
   const warm=await exercise(await scene.setup());
   await warm();
   await scene.check();await idle();
   await scene.reset?.();
   const action=await exercise(await scene.setup());
   const decoding=await page.evaluate(async()=>{
    const start=performance.now();
    await document.fonts.ready;
    const images=await Promise.allSettled([...document.images].filter(image=>image.loading!=='lazy'||image.complete).map(image=>image.decode()));
    return {ms:performance.now()-start,images:images.length,failed:images.filter(image=>image.status==='rejected').length};
   });
   const beforeNetwork=await networkQuiet();await idle();
   expect.soft(beforeNetwork.quiet,scene.name+' warmed network quiet').toBe(true);
   await session.send('Emulation.setCPUThrottlingRate',{rate:4});
   const events:TraceEvent[]=[];
   const collect=({value}:{value:unknown[]})=>{events.push(...value as TraceEvent[]);};
   session.on('Tracing.dataCollected',collect);
   await session.send('Tracing.start',{
    categories:'devtools.timeline,disabled-by-default-devtools.timeline.frame,input,latencyInfo,blink.user_timing',
    transferMode:'ReportEvents',
   });
   // Evaluating the probe separately from the await guarantees it is armed before input dispatch.
   const options={event:scene.event,feedback:scene.feedback,completed:scene.completed,finished:scene.finished};
   const observation=await page.evaluateHandle(armProbe,options);
   await action();
   const readings=await observation.evaluate(probe=>probe.reading);
   await observation.dispose();
   const completed=new Promise<void>(resolve=>session.once('Tracing.tracingComplete',()=>resolve()));
   await session.send('Tracing.end');await completed;
   session.off('Tracing.dataCollected',collect);
   await session.send('Emulation.setCPUThrottlingRate',{rate:1});
   await scene.check();
   const afterNetwork=await networkQuiet();
   await scene.reset?.();
   const maxFrameMs=Math.max(0,...readings.frameGapsMs);
   const result={name:scene.name,setup:{decoding,network:beforeNetwork},afterNetwork,
    ...readings,maxFrameMs,...compositorFrames(events)};
   results.push(result);
   const traceFile=info.outputPath(scene.name+'.trace.json');
   await writeFile(traceFile,JSON.stringify({traceEvents:events}));
   await info.attach(scene.name+'.trace.json',{contentType:'application/json',path:traceFile});
   expect.soft(readings.firstFeedbackMs,scene.name+' feedback reached a rendering opportunity').not.toBeNull();
   expect.soft(readings.timedOut,scene.name+' fully settled').toBe(false);
   expect.soft(result.draws,scene.name+' contains compositor frames').toBeGreaterThan(0);
   expect.soft(maxFrameMs,scene.name+' longest frame at 4× CPU').toBeLessThanOrEqual(50);
   if(scene.feedbackBudget!==undefined)
    expect.soft(readings.firstFeedbackMs??Infinity,scene.name+' input to a rendering opportunity').toBeLessThanOrEqual(scene.feedbackBudget);
   if(scene.clsBudget!==undefined)
    expect.soft(readings.cls,scene.name+' CLS').toBeLessThanOrEqual(scene.clsBudget);
  });
 }finally{
  await info.attach('motion-performance.json',{contentType:'application/json',body:JSON.stringify({
   browser:page.context().browser()?.version(),cpuThrottle:4,viewport:page.viewportSize(),theme:'day',surfaceBeta:true,
   eventTimingThresholdMs:16,results,failures,
  },null,2)});
 }
});
