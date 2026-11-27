import {chromium,newCtx,openHash,SCRATCH,DEVICES,BASE,NOW} from './lib.mjs';
// node states.mjs [device] [scene-id ...]   hover/press/focus need a pointer: default is an iPad with a trackpad (ipad-l, touch off); `desktop` works too.
const stDev=DEVICES[process.argv[2]]?process.argv[2]:'ipad-l';const stArgs=process.argv.slice(DEVICES[process.argv[2]]?3:2);
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
const out=`${SCRATCH}/states`;mkdirSync(out,{recursive:true});
const scenes=[
 ['today','/',[]],['paths','/projects',[]],['path-plan','/p/real-analysis',[]],['calendar-day','/calendar?view=day&date=2026-11-09',[]],
 ['tasks','/tasks',[]],['review-hub','/review',[]],['settings-appearance','/settings?section=appearance',[]],['cards','/cards',[]],
 ['progress','/insights',[]],['capture-sheet','/',['click:Capture']],['atlas','/atlas',['wait:1500']],
];
const snap=e=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,color:s.color,border:s.borderTopColor+' '+s.borderTopWidth,shadow:s.boxShadow.slice(0,90),transform:s.transform,opacity:s.opacity,outline:s.outlineStyle==='none'?'none':s.outlineWidth+' '+s.outlineColor,deco:s.textDecorationLine,filter:s.filter,bgi:s.backgroundImage.slice(0,120),bgc:s.backgroundClip,cursor:s.cursor,td:s.transitionDuration,tp:s.transitionProperty.slice(0,40)}};
const pick=()=>{
 const vis=e=>{const r=e.getBoundingClientRect();return r.width>8&&r.height>8&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[inert],[aria-hidden=true]')};
 const els=[...document.querySelectorAll('button,a[href],[role=tab],[role=radio],[role=switch],[role=checkbox],input[type=checkbox],summary,[role=menuitem],[role=menuitemradio]')].filter(vis);
 const seen=new Map();const res=[];
 els.forEach((e,i)=>{const sig=e.tagName+'|'+(e.getAttribute('role')||'')+'|'+[...e.classList].filter(c=>c.startsWith('v7-')).slice(0,2).join('.');
  if((seen.get(sig)||0)>=1)return;seen.set(sig,1);e.setAttribute('data-probe',String(res.length));
  res.push({idx:res.length,sig,text:(e.getAttribute('aria-label')||e.textContent||'').trim().replace(/\s+/g,' ').slice(0,36)});});
 return res.slice(0,16);
};
const b=await chromium.launch();
const reportFile=`${SCRATCH}/states/report.json`;
const report=stArgs.length&&existsSync(reportFile)?JSON.parse(readFileSync(reportFile,'utf8')):{};   // a scene-filtered run merges into the existing report
async function crop(p,el,file,pad=14){
 const r=await el.boundingBox();if(!r)return;
 await p.screenshot({path:file,clip:{x:Math.max(0,r.x-pad),y:Math.max(0,r.y-pad),width:Math.min(r.width+pad*2,innerW),height:r.height+pad*2}}).catch(()=>{});
}
let innerW=DEVICES[stDev].viewport.width;
for(const [sid,hash,steps] of scenes){
 if(stArgs.length&&!stArgs.includes(sid))continue;   // node states.mjs [scene-id ...]
 // motion on: with reduced motion every transition duration computes to 0s
 const ctx=await newCtx(b,stDev,{touch:false,motion:true});const p=await ctx.newPage();
 try{
 await openHash(p,hash);
 for(const s of steps){const [k,v]=s.split(':');if(k==='click')await p.getByRole('button',{name:v,exact:true}).first().click();if(k==='wait')await p.waitForTimeout(+v);await p.waitForTimeout(500);}
 await p.mouse.move(2,300);await p.waitForTimeout(200);
 const list=await p.evaluate(pick);
 const rows=[];
 for(const it of list){
  try{
  const el=p.locator(`[data-probe="${it.idx}"]`);
  const base=`${out}/${sid}-${it.idx}`;
  const before=await el.evaluate(snap);const rect=await el.boundingBox();if(!rect)continue;
  await crop(p,el,base+'-rest.png');
  await p.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2,{steps:3});await p.waitForTimeout(380);
  const hover=await el.evaluate(snap);await crop(p,el,base+'-hover.png');
  await p.mouse.down();await p.waitForTimeout(320);
  const press=await el.evaluate(snap);await crop(p,el,base+'-press.png');
  await p.mouse.move(2,2,{steps:2});await p.mouse.up();await p.waitForTimeout(250);
  const diff=(a,b)=>Object.keys(a).filter(k=>!['td','tp','cursor'].includes(k)&&a[k]!==b[k]);
  rows.push({...it,rect:[Math.round(rect.width),Math.round(rect.height)],cursor:hover.cursor,hoverChanged:diff(before,hover),pressChanged:diff(hover,press),pressVsRest:diff(before,press),transitionMs:hover.td,transitionProps:hover.tp});
  // a click may have been triggered if the page navigated
  if(!(await p.evaluate(()=>location.hash)).includes(hash.split('?')[0].replace('/',''))&&hash!=='/'){break;}
  }catch(e){rows.push({...it,error:String(e.message).split('\n')[0].slice(0,100)});}
 }
 // keyboard focus pass
 await p.reload();await p.waitForLoadState('networkidle').catch(()=>{});   // Atlas cancels a worker request, which keeps networkidle pending
 await p.waitForTimeout(800);
 for(const s of steps){const [k,v]=s.split(':');if(k==='click')await p.getByRole('button',{name:v,exact:true}).first().click();if(k==='wait')await p.waitForTimeout(+v);await p.waitForTimeout(400);}
 const focus=[];
 for(let k=0;k<7;k++){
  await p.keyboard.press('Tab');await p.waitForTimeout(160);
  const f=await p.evaluate(()=>{const e=document.activeElement;if(!e||e===document.body)return null;const s=getComputedStyle(e);const r=e.getBoundingClientRect();
   return {tag:e.tagName.toLowerCase()+'.'+[...e.classList].slice(0,2).join('.'),text:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,28),outline:s.outlineStyle==='none'?'none':`${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`,offset:s.outlineOffset,shadow:s.boxShadow.slice(0,80),radius:s.borderTopLeftRadius,rect:[r.x,r.y,r.width,r.height]}});
  if(!f)continue;focus.push(f);
  const r=f.rect;await p.screenshot({path:`${out}/${sid}-focus${k}.png`,clip:{x:Math.max(0,r[0]-16),y:Math.max(0,r[1]-16),width:Math.min(r[2]+32,innerW),height:r[3]+32}}).catch(()=>{});
 }
 report[sid]={controls:rows,focus};
 console.log(sid,'controls',rows.length,'dead hover',rows.filter(r=>r.hoverChanged&&!r.hoverChanged.length).length,'focus stops',focus.length);
 }catch(e){report[sid]={error:String(e.message).split('\n')[0]};console.log(sid,'ERROR',report[sid].error);}
 finally{await ctx.close();writeFileSync(`${SCRATCH}/states/report.json`,JSON.stringify(report,null,1));}
}
// sticky hover on touch
{
 const ctx=await newCtx(b,'phone-p',{touch:true});const p=await ctx.newPage();await openHash(p,'/projects');
 const hoverMedia=await p.evaluate(()=>matchMedia('(hover:hover)').matches);
 const chip=p.getByRole('radio',{name:'Done'}).first();
 const before=await chip.evaluate(snap);
 await chip.tap();await p.waitForTimeout(400);
 const r1=await p.evaluate(()=>[...document.querySelectorAll(':hover')].slice(-1).map(e=>e.tagName+'.'+[...e.classList].slice(0,2).join('.')));
 await p.getByRole('radio',{name:'Active'}).first().tap();await p.waitForTimeout(300);
 const stuck=await chip.evaluate(e=>({hover:e.matches(':hover'),bg:getComputedStyle(e).backgroundColor}));
 report.stickyHover={hoverMedia,afterTapHoverChain:r1,previouslyTappedStillHover:stuck.hover};
 await ctx.close();
}
writeFileSync(`${SCRATCH}/states/report.json`,JSON.stringify(report,null,1));
await b.close();
