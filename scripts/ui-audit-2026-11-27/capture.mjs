import {launchBrowser,newCtx,SCRATCH,pickDevices,applyInsets} from './lib.mjs';
import {openScene,applies} from './scene.mjs';
import {wantsImage,imageMode} from './evidence.mjs';
import {startTrace,traceAction,settle} from './trace.mjs';
import {measure} from './metrics.mjs';
import {scenes} from './catalog.mjs';
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
// node capture.mjs <device|a,b|phones|tablets|all> [scene-id | group ...]   (METRICS_ONLY=1 skips the images)
const [,,devArg,...filters]=process.argv;
const devList=pickDevices(devArg);if(devList.length>1){const {spawnSync}=await import('node:child_process');for(const d of devList){const r=spawnSync(process.execPath,[process.argv[1],d,...filters],{stdio:'inherit'});if(r.status!==0)process.exitCode=1;}process.exit(process.exitCode??0);}
const dev=devList[0];
const dir=`${SCRATCH}/shots/${dev}`;mkdirSync(dir,{recursive:true});mkdirSync(`${SCRATCH}/audit`,{recursive:true});
const jf=`${SCRATCH}/audit/${dev}.json`;
const results=existsSync(jf)&&(filters.length||process.env.METRICS_ONLY)?JSON.parse(readFileSync(jf,'utf8')):{};
const b=await launchBrowser();
// `core`: one scene per distinct route + query, plus every creation drawer: a fast pass for extra device sizes (the full
// catalogue is the default). It can be combined with ids/groups: `capture.mjs ipad-p core 'Empty & stress'`.
const coreIds=new Set([...new Map(scenes.filter(s=>!s.steps&&!s.demo).map(s=>[s.hash,s.id])).values(),...scenes.filter(s=>s.group==='Capture & drawers').map(s=>s.id)]);
const named=filters.filter(f=>f!=='core');
const list=scenes.filter(s=>!filters.length||(filters.includes('core')&&coreIds.has(s.id))||named.some(f=>s.id===f||s.group===f));
if(!list.length)throw new Error('No scenes match '+filters.join(', '));
let failures=0;
for(const sc of list.filter(sc=>applies(sc,dev))){
 const t0=Date.now();const ctx=await newCtx(b,dev);const p=await ctx.newPage();
 const rec={id:sc.id,group:sc.group,hash:sc.hash,stepsFailed:[]};
 const consoleErr=[];p.on('pageerror',e=>consoleErr.push(String(e).slice(0,160)));p.on('console',m=>{if(m.type()==='error')consoleErr.push(m.text().slice(0,160))});
 try{
  await applyInsets(ctx,p,dev);
  await ctx.addInitScript(startTrace);
  rec.transitions=[];
  await openScene(p,sc,async(instruction,perform)=>{
   rec.transitions.push({instruction,...await traceAction(p,perform,true)});
  },async()=>{if(!sc.loading)await settle(p);rec.entry=await p.evaluate(()=>window.__endAuditTrace());});
  if(!sc.loading)await settle(p);
  rec.finalHash=await p.evaluate(()=>location.hash);
  rec.surface=await p.evaluate(()=>({
    heading:document.querySelector('main h1')?.textContent?.trim(),theme:document.documentElement.dataset.theme,
    reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,beta:document.documentElement.hasAttribute('data-v7-beta'),
  }));
  if(!sc.loading&&!sc.chunkError&&await p.locator('main.lemma-route-error').isVisible())throw new Error('App rendered its route error');
  if(!sc.loading&&rec.surface.theme!=='graph-night')throw new Error('Expected Night, saw '+rec.surface.theme);
  rec.dialog=await p.evaluate(()=>{const d=[...document.querySelectorAll('dialog[open],[role=dialog],[role=listbox],[role=menu],[data-layer-active]')].filter(e=>e.checkVisibility()).at(-1);return d?(d.getAttribute('aria-label')||d.querySelector('h2')?.textContent||d.localName):null});
  if(wantsImage(dev,'screen',sc.id))await p.screenshot({path:`${dir}/${sc.id}.png`,scale:imageMode==='compact'?'css':'device',animations:'disabled'});
  rec.metrics=await p.evaluate(measure);
  const ds=await p.evaluate(()=>({h:document.documentElement.scrollHeight,H:innerHeight}));
  rec.docHeight=ds.h;
  if(ds.h>ds.H*1.08&&!rec.dialog){
   if(ds.h<=9000&&imageMode==='all')await p.screenshot({path:`${dir}/${sc.id}.full.png`,fullPage:true,animations:'disabled'}).catch(()=>{});
   // end of page: is the last content hidden behind the fixed bar?
   await p.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await p.waitForTimeout(400);
   rec.endClear=await p.evaluate(()=>{
    const W=innerWidth,H=innerHeight;
    const fixed=[...document.querySelectorAll('body *')].filter(e=>{const s=getComputedStyle(e);const r=e.getBoundingClientRect();return s.position==='fixed'&&r.width>W*0.5&&r.height>30&&r.bottom>H-4&&r.top>H*0.5});
    const bar=fixed.sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0];
    const texts=[...document.querySelectorAll('main *')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>e.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0&&r.top<H);
    const lastBottom=Math.max(...texts.map(r=>r.bottom));
    return {bar:bar?Math.round(bar.getBoundingClientRect().top):null,lastContentBottom:Math.round(lastBottom),clearance:bar?Math.round(bar.getBoundingClientRect().top-lastBottom):null};});
   if(imageMode==='all')await p.screenshot({path:`${dir}/${sc.id}.end.png`,animations:'disabled'});
  }
 }catch(e){failures++;rec.error=String(e.message).split('\n')[0].slice(0,200);}
 rec.consoleErrors=consoleErr.slice(0,3);rec.ms=Date.now()-t0;
 results[sc.id]=rec;
 console.log(dev.padEnd(8),sc.id.padEnd(28),rec.error?'ERROR '+rec.error:'ok',rec.stepsFailed.length?'· steps failed: '+rec.stepsFailed.length:'');
 await ctx.close();
 writeFileSync(jf,JSON.stringify(results));
}
await b.close();
if(failures)process.exitCode=1;
