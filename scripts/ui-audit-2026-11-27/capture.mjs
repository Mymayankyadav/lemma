import {chromium,newCtx,openHash,SCRATCH,DEVICES,pickDevices,applyInsets} from './lib.mjs';
import {measure} from './metrics.mjs';
import {scenes} from './catalog.mjs';
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
// node capture.mjs <device|a,b|phones|tablets|all> [scene-id | group ...]   (METRICS_ONLY=1 skips the images)
const [,,devArg,...filters]=process.argv;
const devList=pickDevices(devArg);if(devList.length>1){const {spawnSync}=await import('node:child_process');for(const d of devList)spawnSync(process.execPath,[process.argv[1],d,...filters],{stdio:'inherit',env:process.env});process.exit(0);}
const dev=devList[0];
const dir=`${SCRATCH}/shots/${dev}`;mkdirSync(dir,{recursive:true});mkdirSync(`${SCRATCH}/audit`,{recursive:true});
const jf=`${SCRATCH}/audit/${dev}.json`;
const results=existsSync(jf)&&(filters.length||process.env.METRICS_ONLY)?JSON.parse(readFileSync(jf,'utf8')):{};
const ROLES=['button','link','radio','tab','menuitem','menuitemradio','switch','option','checkbox'];
function target(p,name,exact){let l=null;for(const r of ROLES){const q=p.getByRole(r,{name,exact});l=l?l.or(q):q;}return l.first();}
async function run(p,step){
 const i=step.indexOf(':');const k=i<0?step:step.slice(0,i),v=i<0?'':step.slice(i+1);
 if(k==='click')await target(p,v,false).click({timeout:5000});
 else if(k==='clickx')await target(p,v,true).click({timeout:5000});
 else if(k==='fill')await p.locator('[role=dialog] textarea,[role=dialog] input[type=text],[role=dialog] input[type=search],[role=dialog] input:not([type]),textarea,input[type=search],input[type=text],input:not([type])').first().fill(v,{timeout:5000});
 else if(k==='focus')await p.locator(v).first().focus();
 else if(k==='wait')await p.waitForTimeout(+v);
 else if(k==='press')await p.keyboard.press(v);
 else if(k==='slowChunks')await p.route('**/assets/*.js',async r=>{await new Promise(res=>setTimeout(res,1500));await r.continue();});   // holds lazy route chunks so the loading skeleton shows
 else if(k==='offline')await p.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});dispatchEvent(new Event('offline'));});
 await p.waitForTimeout(450);
}
const b=await chromium.launch();
// `core`: one scene per distinct route + query, plus every creation drawer: a fast pass for extra device sizes (the full
// catalogue is the default). It can be combined with ids/groups: `capture.mjs ipad-p core 'Empty & stress'`.
const coreIds=new Set([...new Map(scenes.filter(s=>!s.steps&&!s.demo).map(s=>[s.hash,s.id])).values(),...scenes.filter(s=>s.group==='Capture & drawers').map(s=>s.id)]);
const named=filters.filter(f=>f!=='core');
const list=scenes.filter(s=>!filters.length||(filters.includes('core')&&coreIds.has(s.id))||named.some(f=>s.id===f||s.group===f));
for(const sc of list){
 const t0=Date.now();const ctx=await newCtx(b,dev);const p=await ctx.newPage();
 const rec={id:sc.id,group:sc.group,hash:sc.hash,stepsFailed:[]};
 const consoleErr=[];p.on('pageerror',e=>consoleErr.push(String(e).slice(0,160)));p.on('console',m=>{if(m.type()==='error')consoleErr.push(m.text().slice(0,160))});
 try{
  await applyInsets(ctx,p,dev);
  if(sc.loading){await p.clock.setFixedTime(new Date('2026-11-09T13:43:00+05:30'));await p.route('**/*.js',async r=>{await new Promise(res=>setTimeout(res,6000));await r.continue().catch(()=>{});});
   await p.goto((process.env.AUDIT_URL??'http://127.0.0.1:4177/lemma/?demo=1')+'#'+sc.hash,{waitUntil:'commit'});await p.waitForTimeout(sc.loading);}
  else await openHash(p,sc.hash,{demo:sc.demo??'1'});
  for(const s of sc.steps??[]){try{await run(p,s)}catch(e){rec.stepsFailed.push(s+' → '+String(e.message).split('\n')[0].slice(0,100));}}
  await p.waitForTimeout(600);
  rec.finalHash=await p.evaluate(()=>location.hash);
  rec.dialog=await p.evaluate(()=>{const d=document.querySelector('[role=dialog],[aria-modal=true],dialog[open],[role=listbox],[role=menu],[class*=sheet],[class*=scrim]');return d?(d.getAttribute('aria-label')||d.getAttribute('role')):null});
  if(!process.env.METRICS_ONLY)await p.screenshot({path:`${dir}/${sc.id}.png`,animations:'disabled'});
  rec.metrics=await p.evaluate(measure);
  const ds=await p.evaluate(()=>({h:document.documentElement.scrollHeight,H:innerHeight}));
  rec.docHeight=ds.h;
  if(ds.h>ds.H*1.08&&!rec.dialog){
   if(ds.h<=9000&&!process.env.METRICS_ONLY)await p.screenshot({path:`${dir}/${sc.id}.full.png`,fullPage:true,animations:'disabled'}).catch(()=>{});
   // end of page: is the last content hidden behind the fixed bar?
   await p.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await p.waitForTimeout(400);
   rec.endClear=await p.evaluate(()=>{
    const W=innerWidth,H=innerHeight;
    const fixed=[...document.querySelectorAll('body *')].filter(e=>{const s=getComputedStyle(e);const r=e.getBoundingClientRect();return s.position==='fixed'&&r.width>W*0.5&&r.height>30&&r.bottom>H-4&&r.top>H*0.5});
    const bar=fixed.sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0];
    const texts=[...document.querySelectorAll('main *')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>e.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0&&r.top<H);
    const lastBottom=Math.max(...texts.map(r=>r.bottom));
    return {bar:bar?Math.round(bar.getBoundingClientRect().top):null,lastContentBottom:Math.round(lastBottom),clearance:bar?Math.round(bar.getBoundingClientRect().top-lastBottom):null};});
   if(!process.env.METRICS_ONLY)await p.screenshot({path:`${dir}/${sc.id}.end.png`,animations:'disabled'});
  }
 }catch(e){rec.error=String(e.message).split('\n')[0].slice(0,200);}
 rec.consoleErrors=consoleErr.slice(0,3);rec.ms=Date.now()-t0;
 results[sc.id]=rec;
 console.log(dev.padEnd(8),sc.id.padEnd(28),rec.error?'ERROR '+rec.error:'ok',rec.stepsFailed.length?'· steps failed: '+rec.stepsFailed.length:'');
 await ctx.close();
 writeFileSync(jf,JSON.stringify(results));
}
await b.close();
