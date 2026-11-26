import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {expect, type CDPSession,type Page,type Request,type TestInfo} from '@playwright/test';

type Frame={timestamp:number;data:string};
type Snapshot={url:string;layers:string[];modal:number;focus:string;loading:string[]};
async function state(page:Page):Promise<Snapshot>{
  return page.evaluate(()=>{
    const active=document.activeElement as HTMLElement|null;
    return {url:location.hash,layers:Array.from(document.querySelectorAll<HTMLElement>('[data-layer-active]'),el=>el.dataset.surfaceRole??''),
      modal:document.querySelectorAll('dialog[open]').length, focus:active?.getAttribute('aria-label')||active?.tagName||'',
      loading:[...document.querySelectorAll<HTMLElement>('[data-loading-surface]')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').map(el=>el.dataset.loadingSurface!)};
  });
}
function family(a:Snapshot,b:Snapshot){
  if(a.url!==b.url)return 'navigation';
  if(b.modal>a.modal)return 'open modal';
  if(b.modal<a.modal)return 'dismiss modal';
  if(b.layers.length>a.layers.length)return 'open child';
  if(b.layers.length<a.layers.length)return 'dismiss child';
  return a.focus!==b.focus?'focus or content change':'content change';
}

/** Decode the captured images at quarter resolution; keep only adjacent greyscale buffers. */
async function compareFrames(page:Page,frames:Frame[]){
  return page.evaluate(async captures=>{
    let last:Uint8ClampedArray|undefined;
    const metrics:{at:number;changed:number;corner:number}[]=[];
    for(const capture of captures){
      const bytes=Uint8Array.from(atob(capture.data),c=>c.charCodeAt(0));
      const image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
      const canvas=document.createElement('canvas');
      canvas.width=image.width;canvas.height=image.height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
      ctx.drawImage(image,0,0);image.close();
      const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
      const gray=new Uint8ClampedArray(canvas.width*canvas.height);
      let changed=0,corner=0,cornerN=0;
      for(let i=0;i<gray.length;i++){
        const p=i*4;gray[i]=.2126*data[p]+.7152*data[p+1]+.0722*data[p+2];
        if(last&&Math.abs(gray[i]-last[i])>12)changed++;
        // Fixed patch outside a centred or bottom sheet; exclude system status bars.
        if(i%canvas.width<canvas.width*.04&&Math.floor(i/canvas.width)<canvas.height*.15){corner+=gray[i];cornerN++;}
      }
      metrics.push({at:capture.timestamp,changed:changed/gray.length,corner:corner/Math.max(1,cornerN)});
      last=gray;
    }
    return metrics;
  },frames);
}
type Row={chapter:string;action:string;family?:string;before?:Snapshot;after?:Snapshot;settleMs?:number;
  performance?:{layoutShift:number;longestTaskMs:number};inputAt?:number;frames?:Awaited<ReturnType<typeof compareFrames>>;changeRuns?:number;latencyMs?:number|null;error?:string};
export class MotionAudit {
  private rows:Row[]=[];
  private inflight=new Set<Request>();
  private failures:{url:string;error:string}[]=[];
  private navigations=0;
  private lastNetwork=Date.now();
  private cdp:CDPSession|null=null;
  constructor(private page:Page,private info:TestInfo){}
  private request=(request:Request)=>{this.inflight.add(request);this.lastNetwork=Date.now();};
  private finished=(request:Request)=>{this.inflight.delete(request);this.lastNetwork=Date.now();};
  private failed=(request:Request)=>{this.finished(request);this.failures.push({url:request.url(),error:request.failure()?.errorText??'request failed'});};
  async start(){
    this.page.on('request',this.request).on('requestfinished',this.finished).on('requestfailed',this.failed);
    this.page.on('domcontentloaded',this.navigation);
    this.page.on('response',this.response);
    const latency=Number(process.env.LEMMA_AUDIT_API_MS??0);
    if([250,750,2000].includes(latency)||process.env.LEMMA_AUDIT_API_ERROR==='1'){
      await this.page.route(/\/(?:rest|functions)\/v1\//,async route=>{
        if(latency>0)await new Promise(resolve=>setTimeout(resolve,latency));
        if(process.env.LEMMA_AUDIT_API_ERROR==='1')await route.fulfill({status:503,json:{message:'Audit connection interrupted'}});
        else await route.fallback();
      });
    }
    if(this.page.context().browser()?.browserType().name()==='chromium'){
      this.cdp=await this.page.context().newCDPSession(this.page);
      if(process.env.LEMMA_AUDIT_CPU==='4')await this.cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
      if(process.env.LEMMA_AUDIT_NETWORK==='4g'){
        await this.cdp.send('Network.enable');
        await this.cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1600000/8,uploadThroughput:750000/8});
      }
    }
    await this.page.addInitScript(()=>{
      const events:{event:string;name:string;at:number;duration:number;surface?:string}[]=[];
      const perf={layoutShift:0,longestTaskMs:0};
      Object.assign(window,{__surfaceEvents:events,__surfacePerf:perf});
      for(const type of ['longtask','layout-shift']){
        if(!PerformanceObserver.supportedEntryTypes.includes(type))continue;
        new PerformanceObserver(list=>{
          for(const entry of list.getEntries()){
            if(type==='longtask')perf.longestTaskMs=Math.max(perf.longestTaskMs,entry.duration);
            else {const shift=entry as PerformanceEntry & {hadRecentInput:boolean;value:number};if(!shift.hadRecentInput)perf.layoutShift+=shift.value;}
          }
        }).observe({type,buffered:false});
      }
      for(const name of ['animationstart','animationend','transitionstart','transitionend']){
        addEventListener(name,ev=>{
          const target=ev.target instanceof Element?ev.target:null;
          if(!target)return;
          const e=ev as AnimationEvent & TransitionEvent;
          const surface=target.closest<HTMLElement>('[data-surface-role],[data-layer-exit]')?.dataset;
          events.push({event:name,name:e.animationName||e.propertyName,at:performance.now(),duration:e.elapsedTime,surface:surface?.surfaceRole??(surface&&'layerExit'in surface?'exit':undefined)});
          if(events.length>1500)events.shift();
        },true);
      }
    });
  }
  private navigation=()=>{this.navigations++;};
  private response=(response:import('@playwright/test').Response)=>{
    if(response.status()>=400)this.failures.push({url:response.url(),error:'HTTP '+response.status()});
  };
  async settled(){
    const start=Date.now();
    while(Date.now()-start<3000){
      const busy=await this.page.evaluate(()=>document.getAnimations().some(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity)
        ||[...document.querySelectorAll<HTMLElement>('[data-loading-surface]')].some(el=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'));
      if(!busy&&!this.inflight.size&&Date.now()-this.lastNetwork>=300)return Date.now()-start;
      await new Promise(r=>setTimeout(r,40));
    }
    const blockers=await this.page.evaluate(()=>({
      animations:document.getAnimations()
        .filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity)
        .map(a=>a instanceof CSSAnimation?a.animationName:a instanceof CSSTransition?a.transitionProperty:a.id||'Web Animation'),
      loading:[...document.querySelectorAll<HTMLElement>('[data-loading-surface]')]
        .filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').map(el=>el.dataset.loadingSurface),
    }));
    const requests=Array.from(this.inflight,r=>new URL(r.url()).pathname);
    throw new Error('Surface did not settle in 3 s: '+JSON.stringify({...blockers,requests,networkQuietMs:Date.now()-this.lastNetwork}));
  }
  async step(chapter:string,action:string,perform:()=>Promise<unknown>,verify:()=>Promise<unknown>,record=true){
    const row:Row={chapter,action},frames:Frame[]=[];
    const client=record?this.cdp:null;
    const onFrame=(event:{sessionId:number;data:string;metadata:{timestamp?:number}})=>{
      void client?.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});
      if(frames.length<96)frames.push({timestamp:Math.round((event.metadata.timestamp??Date.now()/1000)*1000),data:event.data});
    };
    try{
      row.before=await state(this.page);
      await this.page.evaluate(()=>{const perf=Reflect.get(window,'__surfacePerf');if(perf){perf.layoutShift=0;perf.longestTaskMs=0;}});
      if(client){
        client.on('Page.screencastFrame',onFrame);
        const size=this.page.viewportSize()!;
        const first=new Promise<void>(resolve=>client.once('Page.screencastFrame',()=>resolve()));
        await client.send('Page.startScreencast',{format:'png',maxWidth:Math.ceil(size.width/4),maxHeight:Math.ceil(size.height/4),everyNthFrame:1});
        await Promise.race([first,new Promise(r=>setTimeout(r,250))]);
      }
      row.inputAt=Date.now();
      await perform();await verify();
      row.settleMs=await this.settled();row.after=await state(this.page);
      row.family=family(row.before,row.after);
      row.performance=await this.page.evaluate(()=>Reflect.get(window,'__surfacePerf'));
      const lock=await this.page.evaluate(()=>document.body.style.overflow);
      if(row.after.modal)expect(lock).toBe('hidden');
      else expect(lock).not.toBe('hidden');
      if(row.after.layers.length){
        const blocked=await this.page.evaluate(()=>{
          const active=document.activeElement,layer=active?.closest('[data-layer-active]');
          if(!layer)return [];
          return Array.from(layer.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[role="option"],a[href]')).filter(el=>{
            const box=el.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
            const appearance=getComputedStyle(el);
            if(appearance.visibility!=='visible'||appearance.opacity==='0'||box.width<2||box.height<2||x<=0||x>=innerWidth||y<=0||y>=innerHeight||el.closest('[inert],[hidden]'))return false;
            for(let parent=el.parentElement;parent;parent=parent.parentElement){
              const style=getComputedStyle(parent);
              if(!/(auto|scroll|hidden|clip)/.test(style.overflow))continue;
              const clip=parent.getBoundingClientRect();
              if(x<clip.left||x>clip.right||y<clip.top||y>clip.bottom)return false;
              if(parent===layer)break;
            }
            const hit=document.elementFromPoint(x,y);
            return !el.contains(hit) && hit?.closest('label')?.control!==el;
          }).map(el=>el.getAttribute('aria-label')??el.textContent);
        });
        expect(blocked).toEqual([]);
      }
      if(row.after.layers.length)expect(row.after.focus).not.toBe('BODY');
    }catch(err){
      row.error=String(err);delete row.family;
      row.after=await state(this.page).catch(()=>undefined);
      throw err;
    }
    finally{
      if(client){
        await client.send('Page.stopScreencast').catch(()=>{});
        client.off('Page.screencastFrame',onFrame);
        if(frames.length){
          const name=chapter+'-'+String(this.rows.length+1)+'.frames.json.gz';
          const compressed=gzipSync(JSON.stringify(frames));
          await this.info.attach(name,{body:compressed,contentType:'application/gzip'});
          if(process.env.CI_JUNIT_DIR){
            const dir=join(process.env.CI_JUNIT_DIR,'motion-audit',this.info.testId+'-'+this.info.retry);
            await mkdir(dir,{recursive:true});await writeFile(join(dir,name),compressed);
          }
        }
        row.frames=await compareFrames(this.page,frames);
        const changed=row.frames.map((frame,i)=>frame.changed>.001?i:-1).filter(i=>i>=0);
        row.changeRuns=changed.filter((value,i)=>!i||value-changed[i-1]>2).length;
        row.latencyMs=changed.length?Math.max(0,row.frames[changed[0]].at-(row.inputAt??0)):null;
      }
      this.rows.push(row);
    }
    return row;
  }
  async finish(){
    this.page.off('request',this.request).off('requestfinished',this.finished).off('requestfailed',this.failed)
      .off('domcontentloaded',this.navigation).off('response',this.response);
    await this.cdp?.detach();
    const events=await this.page.evaluate(()=>(window as Window & {__surfaceEvents?:unknown}).__surfaceEvents??[]).catch(()=>[]);
    const seen=new Set<string>();
    const entries=this.rows.map(row=>{
      const key=[row.family,row.before?.url,row.after?.url,row.action].join('|');
      const repeat=!!row.family&&seen.has(key);if(row.family)seen.add(key);return {...row,repeat};
    });
    const csv=[['chapter','action','family','repeat','settle_ms','latency_ms','frames','change_runs','error'],
      ...entries.map(r=>[r.chapter,r.action,r.family,r.repeat,r.settleMs,r.latencyMs,r.frames?.length,r.changeRuns,r.error])]
      .map(line=>line.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
    const json=JSON.stringify({commit:process.env.GITHUB_SHA??null,viewport:this.page.viewportSize(),test:this.info.title,engine:this.page.context().browser()?.browserType().name(),version:this.page.context().browser()?.version(),cpu:process.env.LEMMA_AUDIT_CPU??'1',network:process.env.LEMMA_AUDIT_NETWORK??'default',
      documentLoads:this.navigations,assetFailures:this.failures,events,entries},null,2);
    for(const [name,body,type] of [['metrics.csv',csv,'text/csv'],['record.json',json,'application/json']]){
      await this.info.attach(name,{body,contentType:type});
      // The normal PR gate retains the JUnit directory even on a successful run.
      if(process.env.CI_JUNIT_DIR){
        const dir=join(process.env.CI_JUNIT_DIR,'motion-audit',this.info.testId+'-'+this.info.retry);
        await mkdir(dir,{recursive:true});await writeFile(join(dir,name),body);
      }
    }
  }
}
