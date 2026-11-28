// Explore distinct rendered screens to a fixed point. Every branch replays its path in a new demo context.
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {BASE,SCRATCH,applyInsets,launchBrowser,newCtx,pickDevices,profile} from './lib.mjs';
import {uploadFixture} from './fixtures.mjs';
import {openScene,applies} from './scene.mjs';
import {scenes} from './catalog.mjs';
import {traceAction,settle,startTrace} from './trace.mjs';
import {wantsImage} from './evidence.mjs';

const dataParams=new Set(['date','id','run','edit','path','checkpoint','task','len','exam','examSitting','source','idea','question','block']);
export function routeKey(hash) {
  const [path,query='']=hash.replace(/^#/,'').split('?');
  const pattern=path.replace(/^(\/p|\/s)\/[^/]+/,'$1/:slug').replace(/\/cp\/[^/]+/,'/cp/:code')
    .replace(/^(\/cards|\/pad|\/proposals)\/[^/]+/,'$1/:id').replace(/^(\/s\/:slug)\/[^/]+/,'$1/:n');
  const params=new URLSearchParams(query);
  for(const key of dataParams)if(params.has(key))params.set(key,':value');
  params.sort();
  return pattern+(params.size?'?'+params:'');
}

// Serializable browser probe. A replay finds the same named element in the same group, even when another row moves.
function inspect() {
  const visible=e=>e.checkVisibility({visibilityProperty:true})&&e.getBoundingClientRect().width>0&&
    !e.closest('[inert],[aria-hidden=true],.v7-sr-only,[data-layer-exit]');
  const name=e=>(e.getAttribute('aria-label')||
    (e.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>document.getElementById(id)?.textContent).filter(Boolean).join(' ')||
    e.labels?.[0]?.innerText||e.getAttribute('placeholder')||e.innerText||e.getAttribute('title')||'').trim().replace(/\s+/g,' ');
  const layerSelector='dialog[open],[role=dialog],[role=menu],[role=listbox],[data-layer-active],[data-surface-role=step],[popover]:popover-open';
  const layers=[...document.querySelectorAll(layerSelector)].filter(visible);
  const top=layers.at(-1);
  const root=top??document;
  const role=e=>e.getAttribute('role')||e.localName;
  const label=e=>e.getAttribute('aria-label')||e.querySelector('h1,h2,h3')?.textContent||role(e);
  const descriptor=e=>[role(e),e.getAttribute('type'),[...e.classList].filter(c=>!['active','selected'].includes(c)).join('.')].join('.');
  const fold=s=>s.replace(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)\b/gi,'@').replace(/\d+/g,'#');
  const selector='a[href],button,summary,select,input:not([type=hidden]),textarea,[contenteditable=true],[role=button],[role=tab],[role=radio],[role=switch],[role=checkbox],[role=menuitem],[role=menuitemradio],[role=option],[tabindex="0"]';
  for(const old of document.querySelectorAll('[data-audit-control]'))old.removeAttribute('data-audit-control');
  const actions=[],shapes=new Set(),counts=new Map();
  let elementIndex=0;
  // Dates and changing counts are fixture data. Preserve numbered wizard steps even when Next keeps its label.
  const copy=[...new Set([...root.querySelectorAll('legend,p,[aria-current=step],[role=alert]')]
    .filter(e=>visible(e)&&!e.closest('.v7-app-toast,[role=timer],[contenteditable=true]')).map(e=>{
      const text=e.innerText?.trim()??'';
      return text?fold(text)+' '+(text.match(/\bstep\s+\d+/ig)??[]).join(' '):'';
    }).filter(Boolean))];
  const headings=[...root.querySelectorAll('h1,h2,[role=tabpanel],main[aria-label],form[aria-label]')].filter(visible).map(e=>fold(label(e)===role(e)?name(e):label(e)));
  for(const e of root.querySelectorAll(selector)){
    if(!visible(e)||e.matches(':disabled,[aria-disabled=true]'))continue;
    const owner=e.closest('section[aria-label],[role=group],[role=radiogroup],[role=tablist],form,nav');
    const text=name(e), href=e.getAttribute('href'), type=e.getAttribute('type')??'text';
    const stableHref=href?.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id');
    const base=[role(e),text,stableHref,owner?.getAttribute('aria-label')??'',descriptor(e)];
    const id=JSON.stringify(base), occurrence=counts.get(id)??0;counts.set(id,occurrence+1);
    const key=JSON.stringify([...base,occurrence]);
    const index=elementIndex++;e.dataset.auditControl=String(index);
    const push=(kind,value)=>actions.push({key,kind,value,index,name:text||role(e),href});
    // One material example for an editable field. Preserve the control's identity and the submitted state.
    if(e instanceof HTMLSelectElement){for(const option of e.options)if(!option.disabled&&option.value!==e.value)push('select',option.value);}
    else if(e.matches('textarea,[contenteditable=true],input:not([type=checkbox],[type=radio],[type=button],[type=submit],[type=reset],[type=file],[type=color],[type=range])')){
      if(!e.readOnly&&!(e.value??e.textContent))push('fill',({email:'audit@example.invalid',date:'2026-11-10',time:'10:30','datetime-local':'2026-11-10T10:30',number:e.min||'1',url:'https://example.invalid'})[type]??(type==='search'?'compact':'Study compact sets'));
      push('focus');
    } else if(type==='file'&&e.localName==='input')push('file',e.accept);
    else if(href&&(!e.href?.startsWith(location.origin+location.pathname)||!new URL(e.href).hash.startsWith('#/')))push('link');
    else push('click');
    const payload=e.matches('[data-typeahead-insert]')||e.closest('.sugg,.local-pad-preview');
    const selected=['aria-selected','aria-checked','aria-pressed','aria-expanded','aria-current'].filter(a=>e.hasAttribute(a)&&!['false','none'].includes(e.getAttribute(a)));
    // Do not enumerate all combinations of per-row checkboxes, counter values or calendar dates.
    shapes.add([descriptor(e),payload?'suggestion':fold(text).slice(0,80),selected.join(),e.matches('input,textarea')&&e.value?'filled':''].join('|'));
  }
  if(top)actions.push({kind:'escape',key:'escape',name:'Escape'});
  const main=document.querySelector('main:not([inert])');
  const modes=main?[...main.attributes].filter(a=>a.name.startsWith('data-')&&/view|mode|state|sheet|revealed|layout|status|step/.test(a.name)).map(a=>[a.name,a.value]):[];
  return {hash:location.hash,copy,theme:document.documentElement.dataset.theme,modes,layers:layers.map(e=>[role(e),fold(label(e))]),headings:[...new Set(headings)],
    shapes:[...shapes].sort(),actions};
}
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24);
function stateKey(view,seed){
  return digest([seed.demo??'1',seed.native??'',!!seed.account,!!seed.chunkError,routeKey(view.hash),view.modes,view.layers,view.headings,view.copy,view.shapes]);
}
async function activate(page,action,current){
  if(action.kind==='escape')return page.keyboard.press('Escape');
  const live=current.actions.find(a=>a.key===action.key&&a.kind===action.kind&&a.value===action.value);
  if(!live)throw new Error('Could not replay '+action.name);
  let loc=page.locator('[data-audit-control="'+live.index+'"]');
  if(await loc.evaluate(e=>e.matches('input[type=radio],input[type=checkbox]')&&e.labels?.length>0)){
    const label=await loc.evaluateHandle(e=>e.labels[0]);try{return await label.asElement().click();}finally{await label.dispose();}
  }
  if(action.kind==='file')return loc.setInputFiles(uploadFixture(action.value));
  if(action.kind==='select')return loc.selectOption(action.value);
  if(action.kind==='fill')return loc.fill(action.value);
  if(action.kind==='focus')return loc.focus();
  return await page.evaluate(()=>navigator.maxTouchPoints>0)?loc.tap({timeout:3500}):loc.click({timeout:3500});
}
export async function crawl(browser,dev,seeds,{maxControls=Infinity,maxStates=Infinity,onState=()=>{}}={}){
  const report={device:dev,profile,roots:{},states:{},edges:[],discovered:{},errors:[],deferred:0};
  const known=new Set(scenes.map(s=>routeKey(s.hash)));
  const queue=[],seen=new Set();
  async function replay(seed,path){
    const ctx=await newCtx(browser,dev);
    try{
      // All writes stay inside isolated local demo storage, including confirm and save flows.
      await ctx.route('**/*',route=>{
        const req=route.request(),url=new URL(req.url());
        const foreign=url.origin!==new URL(BASE).origin;
        if(!['GET','HEAD'].includes(req.method())||foreign||(req.isNavigationRequest()&&url.searchParams.get('demo')==='0'))return route.abort();
        return route.continue();
      });
      await ctx.addInitScript(startTrace);
      const page=await ctx.newPage(),uploads=[];
      page.on('filechooser',chooser=>{
        uploads.push((async()=>{
          const fixture=uploadFixture(await chooser.element().getAttribute('accept')??'');
          await chooser.setFiles(fixture??[]);
        })().catch(e=>e));
      });
      await applyInsets(ctx,page,dev);
      await openScene(page,seed);await settle(page);
      for(const action of path){
        await activate(page,action,await page.evaluate(inspect));await settle(page);
      }
      return {ctx,page,uploads,view:await page.evaluate(inspect)};
    }catch(e){await ctx.close();throw e;}
  }
  function enqueue(seed,path,view){
    const key=stateKey(view,seed);
    if(!seen.has(key)){
      seen.add(key);
      queue.push({seed,path,key});
      report.states[key]={scene:seed.id,via:path.map(a=>[a.kind,a.name,a.value]),hash:view.hash,layers:view.layers,controls:view.actions.length};
      if(!known.has(routeKey(view.hash)))report.discovered[routeKey(view.hash)]={hash:view.hash,from:seed.id};
    }
    return key;
  }
  const reason=e=>e.message.split('\n')[0];
  for(const seed of seeds){
    let session;
    try{session=await replay(seed,[]);report.roots[seed.id]=enqueue(seed,[],session.view);}
    catch(e){report.errors.push({scene:seed.id,error:reason(e)});}
    finally{await session?.ctx.close();}
  }
  let cursor=0;
  while(cursor<queue.length&&cursor<maxStates){
    const {seed,path,key}=queue[cursor++];
    let session;
    try{
      session=await replay(seed,path);
      if(stateKey(session.view,seed)!==key)throw new Error('Screen changed during replay');
      const actions=session.view.actions;
      report.deferred+=Math.max(0,actions.length-maxControls);
      for(const action of actions.slice(0,maxControls)){
        const edge={from:key,action:action.name,kind:action.kind,value:action.value};
        report.edges.push(edge);
        if(action.kind==='link'||(action.kind==='file'&&!uploadFixture(action.value))){edge.boundary=action.href??'system file chooser';continue;}
        try{
          session??=await replay(seed,path);
          if(stateKey(session.view,seed)!==key)throw new Error('Screen changed during replay');
          edge.motion=await traceAction(session.page,()=>activate(session.page,action,session.view),true);
          for(const pending of session.uploads.splice(0)){const error=await pending;if(error)throw error;}
          const next=await session.page.evaluate(inspect);
          // Only queue local demo screens. The address and active layer both distinguish consecutive dialogs.
          if(next.theme==='graph'){edge.boundary='Day appearance';continue;}
          edge.to=enqueue(seed,[...path,action],next);
          if(edge.to!==key&&wantsImage(dev,'sweep',edge.to)){
            const dir=SCRATCH+'/sweep/'+dev;mkdirSync(dir,{recursive:true});
            await session.page.screenshot({path:dir+'/'+edge.to+'.png',animations:'disabled'});
          }
        }catch(e){edge.error=reason(e);report.errors.push({scene:seed.id,from:key,action:action.name,error:edge.error});}
        finally{await session?.ctx.close();session=null;}
      }
    }catch(e){report.errors.push({scene:seed.id,from:key,error:reason(e)});}
    finally{await session?.ctx.close();}
    onState(report,cursor);
  }
  report.deferred+=queue.length-cursor;
  report.summary={visited:cursor,states:seen.size,edges:report.edges.length,errors:report.errors.length,
    deferred:report.deferred,complete:report.deferred===0&&report.errors.length===0};
  return report;
}
async function main(){
  const args=process.argv.slice(2),pos=args.filter(a=>!a.startsWith('--'));
  const devices=pickDevices(pos[0]);
  if(devices.length>1){
    for(const d of devices){const r=spawnSync(process.execPath,[process.argv[1],d,...args.slice(1)],{stdio:'inherit'});if(r.status!==0)process.exitCode=1;}
    return;
  }
  function limit(name){const arg=args.find(a=>a.startsWith('--'+name+'='));if(!arg)return Infinity;const n=Number(arg.split('=')[1]);if(!Number.isInteger(n)||n<1)throw new Error('Invalid '+name);return n;}
  const ids=pos.slice(1);const device=devices[0];
  const seeds=scenes.filter(s=>applies(s,device)&&!s.loading&&(!ids.length||ids.includes(s.id)||ids.includes(s.group)));
  if(!seeds.length)throw new Error('No sweep scenes selected');
  mkdirSync(SCRATCH+'/sweep',{recursive:true});
  const file=SCRATCH+'/sweep/'+device+'.json',browser=await launchBrowser();
  try{
    const result=await crawl(browser,device,seeds,{maxControls:limit('max'),maxStates:limit('max-states'),
      onState:(_,n)=>{if(n%25===0)console.log(device,n,'screens explored');}});
    writeFileSync(file,JSON.stringify(result));console.log(device,result.summary);
    if(!result.summary.complete||(args.includes('--strict')&&Object.keys(result.discovered).length))process.exitCode=1;
  }finally{await browser.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
