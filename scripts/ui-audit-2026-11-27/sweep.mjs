// Control sweep + route crawl: finds screens and states nobody listed.
//   node scripts/ui-audit-2026-11-27/sweep.mjs <device|a,b|phones|tablets|all> [scene-id ...] [--max=12] [--strict]
// For each page in catalog.mjs (one per distinct route + query, unless scene ids are given) it
//   1. lists every distinct interactive control (role + element + v7 class + name with digits folded),
//   2. clicks each one on a fresh copy of the page and records what happened:
//        route   the hash changed (the target is queued and crawled, see below),
//        overlay a dialog / menu / listbox / popover / toast appeared,
//        state   aria-expanded / pressed / checked / selected / current changed,
//        inline  the page grew, shrank or gained text (an expansion, a revealed form),
//        none    nothing visible changed (a dead control, or one that needs data the demo lacks),
//   3. screenshots every route / overlay / state / inline result, so a menu or confirm dialog nobody catalogued is captured,
//   4. crawls the routes it discovered (and every <a href="#/…"> on the page) that catalog.mjs does not contain.
// Controls are never confirmed (the script only clicks once and reloads), and the data is the demo fixture, so the
// sweep cannot change anything. With --strict the exit code is 1 when it found a route the catalogue lacks.
import {chromium,newCtx,openHash,SCRATCH,pickDevices,applyInsets} from './lib.mjs';
import {scenes} from './catalog.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2);
const flag=(n,d)=>args.find(a=>a.startsWith('--'+n+'='))?.split('=')[1]??d;
const strict=args.includes('--strict'),MAX=+flag('max',12);
const pos=args.filter(a=>!a.startsWith('--'));
const devList=pickDevices(pos[0]);
if(devList.length>1){let bad=0;for(const d of devList){const r=spawnSync(process.execPath,[process.argv[1],d,...args.slice(1)],{stdio:'inherit',env:process.env});bad|=r.status?1:0;}process.exit(bad);}
const dev=devList[0],ids=pos.slice(1);
const out=`${SCRATCH}/sweep/${dev}`;mkdirSync(out,{recursive:true});

/** A route's identity for "have we seen this screen": ids and numbers folded, query keys kept. */
const norm=h=>{const [path,q='']=h.replace(/^#/,'').split('?');
 const p=path.replace(/\/(proposal-\d+|[0-9a-f-]{20,}|\d+|CP\d+)(?=\/|$)/gi,'/:id').replace(/\/p\/[^/]+/,'/p/:slug').replace(/\/s\/[^/]+/,'/s/:slug');
 const keys=[...new URLSearchParams(q).keys()].filter(k=>!['date','run','id','edit','path','checkpoint'].includes(k)).sort();return p+(keys.length?'?'+keys.join('&'):'');};
const known=new Set(scenes.map(s=>norm(s.hash)));
const knownPaths=new Set([...known].map(k=>k.split('?')[0]));
const pages=ids.length?scenes.filter(s=>ids.includes(s.id)||ids.includes(s.group)):[...new Map(scenes.filter(s=>!s.steps&&!s.demo).map(s=>[s.hash,s])).values()];

const probe=()=>{
 const vis=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>6&&r.height>6&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('[inert],[aria-hidden=true],.v7-sr-only');};
 const els=[...document.querySelectorAll('button,a[href],[role=tab],[role=radio],[role=switch],[role=checkbox],[role=menuitem],[role=menuitemradio],[role=option],summary,input:not([type=hidden]),select,textarea,[role=button],[tabindex="0"]')].filter(vis);
 const seen=new Set(),list=[];
 for(const e of els){
  const name=(e.getAttribute('aria-label')||e.textContent||e.getAttribute('placeholder')||'').trim().replace(/\s+/g,' ').slice(0,60);
  const sig=[e.getAttribute('role')||e.tagName.toLowerCase(),[...e.classList].filter(c=>/^v7-|^k$/.test(c)).slice(0,2).join('.'),name.replace(/\d+/g,'#').slice(0,30)].join('|');
  if(seen.has(sig))continue;seen.add(sig);e.setAttribute('data-sweep',String(list.length));list.push({i:list.length,sig,name,kind:e.getAttribute('role')||e.tagName.toLowerCase(),
   href:e.getAttribute('href')});
 }
 return list;
};
const snapshot=()=>({hash:location.hash,text:document.body.innerText.length,height:document.documentElement.scrollHeight,
 overlays:document.querySelectorAll('[role=dialog],[role=menu],[role=listbox],[role=tooltip],[popover]:popover-open,.v7-toast,.v7-app-toast,[role=status]:not(:empty)').length,
 aria:[...document.querySelectorAll('[aria-expanded],[aria-pressed],[aria-checked],[aria-selected],[aria-current]')].map(e=>['aria-expanded','aria-pressed','aria-checked','aria-selected','aria-current'].map(a=>e.getAttribute(a)).join('')).join('|')});
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'control';

const b=await chromium.launch();
const report={device:dev,max:MAX,pages:{},discovered:{},crawled:{}};
const toCrawl=new Map();
// a route is new when its path + query keys are not in the catalogue (a bare path that is catalogued with a query is not new)
const note=(h,from)=>{const k=norm(h);if(!known.has(k)&&!(k===k.split('?')[0]&&knownPaths.has(k))&&!toCrawl.has(k))toCrawl.set(k,{hash:h.replace(/^#/,''),from});};

for(const sc of pages){
 const ctx=await newCtx(b,dev);const p=await ctx.newPage();await applyInsets(ctx,p,dev);
 const rows=[];mkdirSync(`${out}/${sc.id}`,{recursive:true});
 p.on('popup',pp=>pp.close().catch(()=>{}));
 try{
  await openHash(p,sc.hash,{demo:sc.demo??'1'});
  const list=await p.evaluate(probe);
  for(const a of await p.evaluate(()=>[...document.querySelectorAll('a[href^="#/"]')].map(a=>a.getAttribute('href').slice(1))))note(a,sc.id);
  for(const c of list.slice(0,MAX)){
   const row={sig:c.sig,name:c.name,kind:c.kind};
   try{
    if(rows.length){await p.goto('about:blank');await openHash(p,sc.hash,{demo:sc.demo??'1'});await p.evaluate(probe);}   // a clean copy of the page for every control
    const before=await p.evaluate(snapshot);
    await p.locator(`[data-sweep="${c.i}"]`).first().scrollIntoViewIfNeeded({timeout:2500});
    await p.locator(`[data-sweep="${c.i}"]`).first().click({timeout:3000,noWaitAfter:true});
    await p.waitForTimeout(550);
    const after=await p.evaluate(snapshot);
    const effect=after.hash!==before.hash?'route':after.overlays>before.overlays?'overlay':after.aria!==before.aria?'state'
     :Math.abs(after.text-before.text)>40||Math.abs(after.height-before.height)>20?'inline':'none';
    row.effect=effect;
    if(effect==='route'){row.route=after.hash;note(after.hash,sc.id+' › '+c.name);}
    if(effect!=='none'&&!(effect==='route'&&known.has(norm(after.hash)))){row.shot=`${sc.id}/${String(c.i).padStart(2,'0')}-${slug(c.name||c.kind)}-${effect}.png`;await p.screenshot({path:`${out}/${row.shot}`,animations:'disabled'});}
   }catch(e){row.effect='error';row.error=String(e.message).split('\n')[0].slice(0,100);}
   rows.push(row);
  }
  report.pages[sc.id]={hash:sc.hash,controls:list.length,clicked:rows.length,skipped:Math.max(0,list.length-MAX),rows};
  console.log(dev.padEnd(12),sc.id.padEnd(26),'controls',String(list.length).padStart(3),'effects',JSON.stringify(rows.reduce((m,r)=>(m[r.effect]=(m[r.effect]||0)+1,m),{})));
 }catch(e){report.pages[sc.id]={error:String(e.message).split('\n')[0]};console.log(dev,sc.id,'ERROR',report.pages[sc.id].error);}
 await ctx.close();
 writeFileSync(`${out}.json`,JSON.stringify(report,null,1));
}

// Crawl: every route the sweep reached or linked that the catalogue lacks, two levels deep.
let depth=0;const done=new Set();
while(toCrawl.size&&depth<2){
 const batch=[...toCrawl.entries()].filter(([k])=>!done.has(k));toCrawl.clear();
 for(const [k,info] of batch){
  done.add(k);const ctx=await newCtx(b,dev);const p=await ctx.newPage();await applyInsets(ctx,p,dev);
  try{
   await openHash(p,info.hash);const file=`crawl/${slug(k)}.png`;mkdirSync(`${out}/crawl`,{recursive:true});
   await p.screenshot({path:`${out}/${file}`,animations:'disabled'});
   report.discovered[k]={hash:info.hash,from:info.from,shot:file,h1:await p.evaluate(()=>document.querySelector('h1')?.textContent?.trim()??null)};
   for(const a of await p.evaluate(()=>[...document.querySelectorAll('a[href^="#/"]')].map(a=>a.getAttribute('href').slice(1))))note(a,k);
  }catch(e){report.discovered[k]={hash:info.hash,from:info.from,error:String(e.message).split('\n')[0]};}
  await ctx.close();
 }
 depth++;
}
report.summary={pages:Object.keys(report.pages).length,
 controlsClicked:Object.values(report.pages).reduce((n,x)=>n+(x.clicked||0),0),
 byEffect:Object.values(report.pages).flatMap(x=>x.rows??[]).reduce((m,r)=>(m[r.effect]=(m[r.effect]||0)+1,m),{}),
 routesNotInCatalogue:Object.keys(report.discovered)};
writeFileSync(`${out}.json`,JSON.stringify(report,null,1));
console.log(dev,'sweep done',JSON.stringify(report.summary));
if(report.summary.routesNotInCatalogue.length)console.log('NOT IN CATALOGUE:',report.summary.routesNotInCatalogue.join(', '));
await b.close();
process.exit(strict&&report.summary.routesNotInCatalogue.length?1:0);
