// Pointer rest, hover, press and keyboard focus on each distinct control style in each prepared scene.
import {mkdirSync,writeFileSync} from 'node:fs';
import {applyInsets,DEVICES,launchBrowser,newCtx,openHash,SCRATCH} from './lib.mjs';
import {scenes} from './catalog.mjs';
import {applies,openScene} from './scene.mjs';
import {settle,traceAction} from './trace.mjs';
import {wantsImage} from './evidence.mjs';
const dev=process.argv[2]??'ipad-l',ids=process.argv.slice(3);
if(!DEVICES[dev])throw new Error('Unknown device '+dev);
const selected=scenes.filter(sc=>applies(sc,dev)&&!sc.loading&&(!ids.length||ids.includes(sc.id)));
if(!selected.length)throw new Error('No scenes match '+ids);
const out=SCRATCH+'/states',dir=out+'/'+dev,report={};
mkdirSync(out,{recursive:true});
function pick(){
 const root=[...document.querySelectorAll('dialog[open],[role=dialog],[data-layer-active]')].filter(e=>e.checkVisibility()).at(-1)??document;
 const controls=root.querySelectorAll('button,a[href],input,select,textarea,summary,[role=button],[role=tab],[role=menuitem],[role=option],[tabindex="0"]');
 const types=new Set(),result=[];
 for(const e of controls){
  if(!e.checkVisibility({visibilityProperty:true})||!e.getClientRects().length||e.matches(':disabled')||e.closest('[inert],[aria-hidden=true]'))continue;
  const type=[e.localName,e.getAttribute('role'),e.className,e.getAttribute('type'),e.getAttribute('aria-selected'),e.getAttribute('aria-pressed')].join('|');
  if(types.has(type))continue;types.add(type);e.dataset.auditProbe=String(result.length);
  result.push({type,name:(e.getAttribute('aria-label')||e.innerText||'').trim().slice(0,80)});
 }
 return result;
}
function style(e){
 const s=getComputedStyle(e);
 return Object.fromEntries(['backgroundColor','backgroundImage','color','borderColor','boxShadow','transform','opacity','outline','outlineOffset','textDecorationLine','filter','transitionDuration','transitionProperty'].map(k=>[k,s[k]]));
}
const diff=(a,b)=>Object.keys(a).filter(k=>a[k]!==b[k]);
const browser=await launchBrowser();
try{
 for(const sc of selected){
  const ctx=await newCtx(browser,dev,{touch:false}),p=await ctx.newPage(),rows=[];
  try{
   await applyInsets(ctx,p,dev);await openScene(p,sc);await settle(p);
   const list=await p.evaluate(pick);
   // CDP pseudo states exercise the actual cascade without committing a click while probing the pressed style.
   const cdp=await ctx.newCDPSession(p);
   await cdp.send('DOM.enable');await cdp.send('CSS.enable');
   const {root}=await cdp.send('DOM.getDocument');
   for(const [i,entry] of list.entries()){
    const selector='[data-audit-probe="'+i+'"]',el=p.locator(selector);
    await el.scrollIntoViewIfNeeded();
    const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector});
    const sample=async(label,forcedPseudoClasses)=>{
     await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses});await settle(p);
     if(wantsImage(dev,'state',sc.id)){mkdirSync(dir,{recursive:true});await el.screenshot({path:dir+'/'+sc.id+'-'+i+'-'+label+'.png'});}
     return el.evaluate(style);
    };
    const rest=await sample('rest',[]),hover=await sample('hover',['hover']),press=await sample('press',['hover','active']),focus=await sample('focus',['focus','focus-visible']);
    await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});
    const r=await el.boundingBox();
    const realHoverMotion=r?await traceAction(p,()=>p.mouse.move(r.x+r.width/2,r.y+r.height/2,{steps:3})):null;
    await p.mouse.move(0,0);
    rows.push({...entry,realHoverMotion,hover:diff(rest,hover),press:diff(hover,press),focus:diff(rest,focus),outline:focus.outline,duration:hover.transitionDuration,properties:hover.transitionProperty});
   }
   report[sc.id]={controls:rows};
  }catch(e){report[sc.id]={controls:rows,error:e.message.split('\n')[0]};process.exitCode=1;}
  finally{await ctx.close();writeFileSync(out+'/'+dev+'.json',JSON.stringify(report));}
 }
 if(DEVICES[dev].touch&&(!ids.length||ids.includes('paths'))){
  const ctx=await newCtx(browser,dev),p=await ctx.newPage();
  try{
   await applyInsets(ctx,p,dev);await openHash(p,'/projects');
   const chip=p.getByRole('radio',{name:/^Done(?:\s|$)/});
   await chip.tap();const afterTap=await chip.evaluate(el=>el.matches(':hover'));
   await p.getByRole('radio',{name:/^Active(?:\s|$)/}).tap();
   report.stickyHover={afterTap,afterNextTap:await chip.evaluate(el=>el.matches(':hover'))};
  }catch(e){report.stickyHover={error:e.message.split('\n')[0]};process.exitCode=1;}
  finally{await ctx.close();writeFileSync(out+'/'+dev+'.json',JSON.stringify(report));}
 }
}finally{await browser.close();}
