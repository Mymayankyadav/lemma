import {expect,test,type Locator} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {at,DATE,NOW} from '../../tests/e2e/v7-scenes';
import {enableSurfaceBeta} from '../../tests/e2e/helpers/surface-preview';

type Feedback={selector:string;signal?:'press'|'scroll'};
type ProbeOptions={event:'pointerdown'|'click'|'keydown'|'wheel';feedback:Feedback;completed?:string;finished?:string;
 watch:string[];motion?:string;motionTail?:'--motion-quick'|'--motion-layout'};
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
function armProbe({event,feedback,completed,finished,watch,motion,motionTail}:ProbeOptions){
 const button=feedback.signal==='press'?document.querySelector(feedback.selector):null;
 if(feedback.signal==='press'&&!button||!feedback.signal&&document.querySelector(feedback.selector))
  throw new Error('Unexpected initial feedback state for '+feedback.selector);
 function pressedStyle(node:Element){
  const css=getComputedStyle(node);
  return [css.transform,css.backgroundColor,css.backgroundImage].join('|');
 }
 const before=button?pressedStyle(button):null;
 // Review and Capture use WAAPI, which does not bubble CSS animation events.
 // Their content check is explicit. Allow the configured enter/resize interval
 // after it becomes ready and sample through the tail without querying CSSOM.
 const tail=motionTail?getComputedStyle(document.documentElement).getPropertyValue(motionTail).trim():'';
 const tailMs=tail.endsWith('ms')?parseFloat(tail):tail.endsWith('s')?parseFloat(tail)*1000:0;
 const timings:InteractionTiming[]=[];
 const shifts:LayoutShift[]=[];
 const eventTimings=(entries:PerformanceEntryList)=>entries.filter((entry):entry is InteractionTiming=>entry.entryType==='event');
 const timing=new PerformanceObserver(list=>timings.push(...eventTimings(list.getEntries())));
 const layout=new PerformanceObserver(list=>shifts.push(...list.getEntries() as typeof shifts));
 timing.observe({type:'event',durationThreshold:16} as PerformanceObserverInit);
 layout.observe({type:'layout-shift'});
 const reading=new Promise<{
  feedbackSignalMs:number|null;firstFeedbackMs:number|null;completionMs:number|null;transitionMs:number;frameGapsMs:number[];
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
   const frames:number[]=[],listeners=new AbortController();
   const active=new Map<Element,Set<string>>();
   let signal:number|null=null,first:number|null=null,completion:number|null=null,stable=0;
   let finishedSeen=!finished;
   previous??=input.timeStamp;
   function acknowledge(){
    if(signal!==null)return;
    signal=performance.now();
    performance.mark('lemma-motion/feedback',{startTime:signal});
   }
   function observeConditions(){
    if(signal===null&&!feedback.signal&&document.querySelector(feedback.selector))acknowledge();
    if(signal!==null&&completion===null&&(completed?document.querySelector(completed):active.size===0)){
     completion=performance.now();
     performance.mark('lemma-motion/content',{startTime:completion});
    }
    const next=finished?!!document.querySelector(finished):true;
    if(next!==finishedSeen){finishedSeen=next;stable=0;}
   }
   const observer=new MutationObserver(()=>{
    for(const element of active.keys())if(!element.isConnected)active.delete(element);
    observeConditions();
   });
   observer.observe(document.documentElement,{subtree:true,childList:true,attributes:watch.length>0,attributeFilter:watch.length?watch:undefined});
   const capture={capture:true,passive:true,signal:listeners.signal};
   if(completed?.includes(':focus'))addEventListener('focusin',observeConditions,capture);
   if(feedback.signal==='scroll')addEventListener('scroll',scroll=>{
    if(scroll.target===document){acknowledge();observeConditions();}
   },capture);
   if(motion) for(const name of ['transitionrun','transitionend','transitioncancel','animationstart','animationend','animationcancel'])
    addEventListener(name,raw=>{
     const event=raw as TransitionEvent|AnimationEvent,target=event.target;
     if(!(target instanceof Element)||!target.matches(motion))return;
     const key=('propertyName' in event?event.propertyName:event.animationName)+' '+event.pseudoElement;
     const tracks=active.get(target)??new Set<string>();
     if(name==='transitionrun'||name==='animationstart'){
      tracks.add(key);active.set(target,tracks);
      if(target===button&&name==='transitionrun'&&'propertyName' in event&&['background-color','transform'].includes(event.propertyName))acknowledge();
     }else{
      tracks.delete(key);
      if(!tracks.size)active.delete(target);
     }
     stable=0;
     observeConditions();
    },capture);
   // No animation query in the frame loop. A press with instant style and no
   // transition event gets a single fallback comparison on its second frame.
   function sample(frame:number){
    const now=performance.now();
    if(previous!==null)frames.push(frame-previous);
    previous=frame;
    if(button&&signal===null&&frames.length===2&&pressedStyle(button)!==before){acknowledge();observeConditions();}
    if(first===null&&signal!==null)first=performance.now();
    const ready=completion!==null&&first!==null&&finishedSeen&&active.size===0&&now>=completion+tailMs;
    stable=ready?stable+1:0;
    const timedOut=now-input.timeStamp>=3000;
    if(stable<3&&!timedOut){requestAnimationFrame(sample);return;}
    performance.mark('lemma-motion/settled');
    observer.disconnect();listeners.abort();
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
      feedbackSignalMs:signal===null?null:signal-input.timeStamp,
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
 const feedback=events.find(entry=>entry.name==='lemma-motion/feedback')?.ts;
 const settled=events.find(entry=>entry.name==='lemma-motion/settled')?.ts;
 if(input===undefined||settled===undefined)return {draws:0,maxDrawGapMs:null,firstDrawMs:null,firstDrawAfterFeedbackMs:null};
 const streams=new Map<string,number[]>();
 let firstDraw=Infinity,firstFeedbackDraw=Infinity;
 for(const entry of events){
  if(entry.name!=='DrawFrame'||entry.ts<input||entry.ts>settled)continue;
  firstDraw=Math.min(firstDraw,entry.ts);
  if(feedback!==undefined&&entry.ts>=feedback)firstFeedbackDraw=Math.min(firstFeedbackDraw,entry.ts);
  const key=entry.pid+'-'+entry.tid,stream=streams.get(key)??[];
  stream.push(entry.ts/1000);streams.set(key,stream);
 }
 const gaps=[...streams.values()].flatMap(stream=>{
  const times=[...new Set(stream)].sort((a,b)=>a-b);
  return times.slice(1).map((time,index)=>time-times[index]);
 });
 return {draws:[...streams.values()].reduce((sum,stream)=>sum+stream.length,0),
  firstDrawMs:Number.isFinite(firstDraw)?(firstDraw-input)/1000:null,
  firstDrawAfterFeedbackMs:Number.isFinite(firstFeedbackDraw)?(firstFeedbackDraw-input)/1000:null,
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
 const idle=()=>page.evaluate(async()=>{
  const running=document.getAnimations().filter(animation=>animation.playState==='running'&&
   Number.isFinite(animation.effect?.getComputedTiming().endTime));
  await Promise.allSettled(running.map(animation=>animation.finished));
 });
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
 const pathLink=()=>page.locator('.v7-paths').getByRole('link',{name:'Real Analysis',exact:true}).filter({visible:true}).first();
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
 const pressTarget='.v7-rv button.v7-primary';
 const cases:Scenario[]=[
  {name:'press',event:'pointerdown',feedback:{selector:pressTarget,signal:'press'},motion:pressTarget,watch:[],feedbackBudget:100,
   setup:async()=>{await go('/review');return opener;},
   action:()=>page.mouse.down(),check:async()=>expect(page.locator(pressTarget+':active')).toBeVisible(),
   reset:async()=>{await page.mouse.move(0,0);await page.mouse.up();}},
  {name:'sheet-enter',event:'click',feedback:{selector:'dialog.v7-sheet[open]'},completed:'.v7-capture-field:focus',
   watch:['open'],motion:'.v7-sheet',feedbackBudget:100,
   setup:async()=>{await go('/');return capture;},check:async()=>expect(field).toBeFocused(),reset:()=>closeCapture()},
  {name:'sheet-step',event:'click',feedback:{selector:'dialog[open] button[aria-label="Back"]'},
   completed:'dialog[open] .v7-capture-step input[data-v7-autofocus]',
   watch:['open'],motion:'.v7-capture-step',motionTail:'--motion-layout',
   setup:async()=>{
    await go('/');await capture.click();await field.fill('Work through exercise tomorrow');
    await page.getByRole('radio',{name:'Task',exact:true}).click();
    return page.getByRole('button',{name:'Add details',exact:true});
   },check:async()=>{
    await expect(dialog.getByRole('button',{name:'Back',exact:true})).toBeVisible();
    await expect(dialog.getByRole('textbox',{name:'Title',exact:true})).toBeVisible();
   },reset:()=>closeCapture(true)},
  {name:'sheet-exit',event:'click',feedback:{selector:'[data-layer-exit]'},
   completed:'.v7-capture:focus',finished:'body:not(:has([data-layer-exit],dialog[open]))',
   watch:['open'],motion:'[data-layer-exit],.v7-exiting-panel',setup:async()=>{
    await go('/');await capture.click();
    return dialog.getByRole('button',{name:'Close',exact:true});
   },check:async()=>{await expect(dialog).toHaveCount(0);await expect(capture).toBeFocused();}},
  {name:'route-tab',event:'click',feedback:{selector:'.v7-tab[data-tab-destination],'+routeFeedback+'.v7-tab[href="#/projects"][aria-current="page"]'},
   completed:'.v7-paths-list .v7-paths-title',watch:['data-tab-destination','aria-current'],
   motion:'.v7-paths,.v7-tab-pill,.v7-route-departure',feedbackBudget:100,clsBudget:.05,
   setup:async()=>{await go('/');return tabs.getByRole('link',{name:'Paths',exact:true});},
   check:async()=>expect(page.getByRole('heading',{name:'Paths',exact:true,level:1})).toBeVisible()},
  {name:'route-push',event:'click',feedback:{selector:'a[data-route-destination],'+routeFeedback+'main[aria-label="Path"]'},
   completed:'.v7-path .v7-path-head h1',watch:['data-route-destination'],motion:'.v7-path,.v7-path > *, .v7-path .v7-detail-title,.v7-route-departure',
   feedbackBudget:100,clsBudget:.05,
   setup:async()=>{await go('/projects');return pathLink();},
   check:async()=>expect(page.getByRole('heading',{name:'Real Analysis',exact:true,level:1})).toBeVisible()},
  {name:'review-advance',event:'keydown',feedback:{selector:'.v7-review-grades button[data-pending],.v7-review-pending,main[aria-label="Review round"][data-revealed="false"]'},
   completed:'.v7-review-front:focus',watch:['data-pending','data-revealed'],motionTail:'--motion-quick',
   setup:async()=>{
    await go('/review');await opener.click();await show.click();return null;
   },action:()=>page.keyboard.press('3'),check:async()=>expect(page.getByRole('group',{name:'Question',exact:true})).toBeFocused()},
  {name:'calendar-view',event:'click',feedback:{selector:'.v7-cal-toolbar > [aria-label="Calendar view"] [role="radio"]:nth-child(2)[aria-checked="true"]'},clsBudget:0,
   completed:'.v7-cal-pane:not([data-exiting]) [aria-label="Week time grid"]',
   watch:['aria-checked','data-exiting','aria-busy'],motionTail:'--motion-quick',
   finished:'.v7-cal:not(:has(.v7-cal-pane[data-exiting],.v7-cal-pane[aria-busy="true"]))',
   setup:async()=>{await go('/calendar?view=day&date='+DATE);return view('Week');},
   check:async()=>expect(view('Week')).toBeChecked()},
  {name:'calendar-header',event:'wheel',feedback:{selector:'.v7-cal .v7-hub-bar',signal:'scroll'},
   completed:'.v7-cal .v7-hub-bar[data-collapsed="true"]',watch:['data-collapsed'],motion:'.v7-cal .v7-hub-title > span',clsBudget:0,
   setup:async()=>{
    await go('/calendar?view=month&date='+DATE);
    await page.evaluate(()=>scrollTo(0,0));await expect(calendar).toBeVisible();
    await page.mouse.move(480,350);return null;
   },action:()=>page.mouse.wheel(0,48),
   check:async()=>expect(calendar.locator('.v7-hub-bar')).toHaveAttribute('data-collapsed','true')},
  {name:'atlas-camera',event:'click',feedback:{selector:'.v7-atlas-sky[data-camera-moving]'},
   completed:'.v7-atlas-sky:not([data-camera-moving])',watch:['data-camera-moving'],
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
   const {event,feedback,completed:content,finished,watch,motion,motionTail}=scene;
   const options={event,feedback,completed:content,finished,watch,motion,motionTail};
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
   const budgets={maxFrameMs:50,firstFeedbackMs:scene.feedbackBudget,cls:scene.clsBudget};
   const result={name:scene.name,budgets,setup:{decoding,network:beforeNetwork},afterNetwork,
    ...readings,maxFrameMs,...compositorFrames(events)};
   results.push(result);
   const traceFile=info.outputPath(scene.name+'.trace.json');
   await writeFile(traceFile,JSON.stringify({traceEvents:events}));
   await info.attach(scene.name+'.trace.json',{contentType:'application/json',path:traceFile});
   expect.soft(readings.firstFeedbackMs,scene.name+' feedback reached a rendering opportunity').not.toBeNull();
   expect.soft(readings.completionMs,scene.name+' content completed').not.toBeNull();
   expect.soft(readings.timedOut,scene.name+' fully settled').toBe(false);
   expect.soft(result.draws,scene.name+' contains compositor frames').toBeGreaterThan(0);
   expect.soft(maxFrameMs,scene.name+' longest frame at 4× CPU').toBeLessThanOrEqual(budgets.maxFrameMs);
   if(scene.feedbackBudget!==undefined){
    expect.soft(readings.firstFeedbackMs??Infinity,scene.name+' input to a rendering opportunity').toBeLessThanOrEqual(scene.feedbackBudget);
    expect.soft(result.firstDrawAfterFeedbackMs??Infinity,scene.name+' input to a drawn frame with feedback').toBeLessThanOrEqual(scene.feedbackBudget);
   }
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
