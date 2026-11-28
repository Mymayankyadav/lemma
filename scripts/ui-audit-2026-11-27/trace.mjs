import {summariseFrames} from './frames.mjs';

// This function runs in the page. Sample compositor animations as well as short CSS events
// that can start and finish between two animation frames. Infinite animations are inventoried once.
export function startTrace() {
  window.__endAuditTrace?.();
  const start=performance.now(), origin=performance.timeOrigin;
  const baseline=new WeakSet(document.getAnimations());
  const seen=new WeakSet(), animations=[], events=[], observers=[], gaps=[];
  const controller=new AbortController();
  let frame, last=start, input, shift=0, longestTask=0;
  const target=el=>el?.localName+(el?.classList?.length?'.'+[...el.classList].slice(0,2).join('.'):'');
  function sample(now) {
    gaps.push(now-last);last=now;
    for(const animation of document.getAnimations()) {
      if(seen.has(animation)||!animation.effect)continue;
      seen.add(animation);
      const timing=animation.effect.getTiming(), keyframes=animation.effect.getKeyframes?.()??[];
      animations.push({ongoingAtStart:baseline.has(animation),at:Math.round(now-start),target:target(animation.effect.target),kind:animation.constructor.name,
        name:animation.transitionProperty??animation.animationName??'WAAPI',duration:timing.duration,
        delay:timing.delay,iterations:Number.isFinite(timing.iterations)?timing.iterations:'infinite',
        easing:timing.easing,properties:[...new Set(keyframes.flatMap(k=>Object.keys(k)))].filter(k=>!['offset','computedOffset','composite','easing'].includes(k))});
    }
    frame=requestAnimationFrame(sample);
  }
  frame=requestAnimationFrame(sample);
  for(const type of ['pointerdown','keydown','input','click','popstate','hashchange','transitionrun','transitionend','transitioncancel','animationstart','animationend','animationcancel']) {
    addEventListener(type,e=>{
      const at=Math.round(e.timeStamp-start);
      if(input===undefined&&['pointerdown','keydown','input','click'].includes(type))input=at;
      events.push({type,at,target:target(e.target),name:e.propertyName??e.animationName});
    },{capture:true,signal:controller.signal});
  }
  for(const type of ['layout-shift','long-animation-frame']) {
    if(!PerformanceObserver.supportedEntryTypes.includes(type))continue;
    const observer=new PerformanceObserver(list=>{for(const e of list.getEntries()){
      if(type==='layout-shift'&&!e.hadRecentInput)shift+=e.value;
      if(type==='long-animation-frame')longestTask=Math.max(longestTask,e.duration);
    }});
    observer.observe({type});observers.push(observer);
  }
  window.__endAuditTrace=()=>{
    cancelAnimationFrame(frame);controller.abort();for(const o of observers)o.disconnect();
    delete window.__endAuditTrace;
    return {epoch:start+origin,inputMs:input??null,elapsedMs:Math.round(performance.now()-start),
      frames:gaps.length,maxGapMs:gaps.reduce((m,v)=>Math.max(m,v),0),dropped:gaps.filter(g=>g>25).length,
      layoutShift:shift,longestFrameMs:longestTask,animations,events,
      stillRunning:document.getAnimations().filter(a=>a.playState==='running').map(a=>a.animationName??a.transitionProperty??'WAAPI')};
  };
}
export async function settle(page) {
  // Wait for finite UI transitions, including lazy content that starts animating after the click.
  await page.waitForTimeout(180);
  await page.evaluate(async()=>{
    const finite=document.getAnimations().filter(a=>a.playState==='running'&&Number.isFinite(a.effect?.getComputedTiming().endTime));
    await Promise.race([Promise.allSettled(finite.map(a=>a.finished)),new Promise(r=>setTimeout(r,2500))]);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  });
}
export async function traceAction(page, perform, pixels=false) {
  const frames=[],cdp=pixels?await page.context().newCDPSession(page):null;
  try{
    if(cdp){
      cdp.on('Page.screencastFrame',event=>{
        if(event.metadata.timestamp!=null)frames.push({t:event.metadata.timestamp*1000,data:event.data});
        void cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});
      });
      const {width,height}=page.viewportSize();
      await cdp.send('Page.startScreencast',{format:'jpeg',quality:65,maxWidth:160,maxHeight:Math.round(160*height/width),everyNthFrame:1});
      await page.waitForTimeout(70);
    }
    await page.evaluate(startTrace);
    await perform();
    await settle(page);
    const trace=await page.evaluate(()=>window.__endAuditTrace());
    if(cdp){
      await cdp.send('Page.stopScreencast');
      trace.visual=await page.evaluate(summariseFrames,{frames,anchor:trace.epoch+(trace.inputMs??0),strip:false});
    }
    return trace;
  }finally{await cdp?.detach();}
}
