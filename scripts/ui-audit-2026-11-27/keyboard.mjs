// Keyboard audit: the tutor's on-screen keyboard (every layer and key state) and the Pad's maths keyboard, plus the
// hardware-keyboard states (Tab focus ring on every stop, shortcuts) on every screen the catalogue lists.
//   node scripts/ui-audit-2026-11-27/keyboard.mjs <device|a,b|phones|tablets|all> [tutor|pad|hardware ...]
// Reports always include per-state measurements; evidence.mjs chooses the saved images.
import {launchBrowser,newCtx,openHash,SCRATCH,DEVICES,pickDevices,applyInsets} from './lib.mjs';
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {wantsImage,imageMode} from './evidence.mjs';
import {startTrace} from './trace.mjs';
import {applies,openScene} from './scene.mjs';
import {scenes} from './catalog.mjs';
import {focusCycle} from './focus.mjs';
import {spawnSync} from 'node:child_process';
const [,,devArg,...parts]=process.argv;
const devList=pickDevices(devArg);
if(devList.length>1){for(const d of devList){const r=spawnSync(process.execPath,[process.argv[1],d,...parts],{stdio:'inherit'});if(r.status!==0)process.exitCode=1;}process.exit(process.exitCode??0);}
const dev=devList[0],want=n=>!parts.length||parts.includes(n);
const dir=`${SCRATCH}/keyboard/${dev}`;mkdirSync(dir,{recursive:true});
const jsonFile=`${SCRATCH}/keyboard/${dev}.json`;
// Running one part (tutor | pad | hardware) merges into the device's earlier report instead of replacing it.
const prior=parts.length&&existsSync(jsonFile)?JSON.parse(readFileSync(jsonFile,'utf8')):null;
const report=prior?{...prior,missing:prior.missing.filter(m=>!parts.some(x=>m.startsWith(x+': ')))}:{device:dev,viewport:DEVICES[dev].viewport,states:{},missing:[]};
const b=await launchBrowser();
const tracing=new WeakSet();

async function newPage(){
 const ctx=await newCtx(b,dev);const p=await ctx.newPage();await applyInsets(ctx,p,dev);return {ctx,p};
}
/** Screenshot the page and the keyboard, and measure the keyboard. */
async function shot(p,name,kbSel){
 if(tracing.has(p)){(report.transitions??={})[name]=await p.evaluate(()=>window.__endAuditTrace?.());await p.evaluate(startTrace);}
 if(imageMode==='all')await p.screenshot({path:`${dir}/${name}.png`,animations:'disabled'});
 const kb=kbSel?p.locator(kbSel).first():null;
 let facts=null;
 if(kb&&await kb.isVisible().catch(()=>false)){
  const r=await kb.boundingBox();
  if(r&&wantsImage(dev,'keyboard',name))await kb.screenshot({path:`${dir}/${name}.kb.png`,scale:imageMode==='compact'?'css':'device',animations:'disabled'});
  facts=await p.evaluate(sel=>{
   const k=document.querySelector(sel);if(!k)return null;const kr=k.getBoundingClientRect();
   const keys=[...k.querySelectorAll('.k, .cats button')].filter(e=>e.getBoundingClientRect().width>0);
   const sizes=keys.map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height]});
   const minW=Math.min(...sizes.map(s=>s[0])),minH=Math.min(...sizes.map(s=>s[1]));
   const fonts=keys.map(e=>parseFloat(getComputedStyle(e).fontSize));
   const field=document.querySelector('[role=textbox][aria-label="Your answer"],textarea:focus,[contenteditable=true]');const fr=field?.getBoundingClientRect();
   return {rect:[kr.x,kr.y,kr.width,kr.height].map(Math.round),layout:k.querySelector('.rows')?.getAttribute('data-layout')??'gboard',view:k.querySelector('.rows')?.getAttribute('data-view')??null,
    keys:keys.length,minKey:[Math.round(minW),Math.round(minH)],minFont:Math.min(...fonts),coversViewportPct:Math.round(kr.height/innerHeight*100),
    field:fr?{y:Math.round(fr.y),bottom:Math.round(fr.bottom),visibleAboveKeyboard:fr.bottom<=kr.top+1&&fr.top>=0}:null,
    pressed:[...k.querySelectorAll('[aria-pressed=true]')].map(e=>e.getAttribute('aria-label')||e.textContent.trim()).slice(0,6)};
  },kbSel).catch(()=>null);
 }
 report.states[name]=facts??{keyboardVisible:false};
}
let part='tutor';
async function measureKeys(p){await p.evaluate(startTrace);tracing.add(p);}
async function step(name,fn){try{await fn();}catch(e){report.missing.push(part+': '+name+': '+String(e.message).split('\n')[0].slice(0,110));}}

if(want('tutor')){
 const {ctx,p}=await newPage();
 try{
  await openHash(p,'/p/real-analysis/cp/CP4/tutor');
  await measureKeys(p);
  await p.getByRole('button',{name:'Write a question',exact:true}).click({timeout:5000});
  const field=p.getByRole('textbox',{name:'Your answer',exact:true});await field.focus();
  const KB='.kb';const kb=p.getByRole('group',{name:'Answer keyboard',exact:true});
  const shown=await kb.waitFor({state:'visible',timeout:4000}).then(()=>true,()=>false);
  report.keyboardShown=shown;
  await shot(p,'00-composer-focused',KB);
  if(shown){
   const isIPad=await p.locator('.kb .rows[data-layout="ipad"]').count()>0;report.layout=isIPad?'ipad':'gboard';
   await step('abc rest',()=>shot(p,'01-abc',KB));
   const shiftLabel='Shift';
   await step('shift once',async()=>{await kb.getByRole('button',{name:shiftLabel,exact:true}).first().click({timeout:2500});await shot(p,'02-abc-shift-once',KB);});
   await step('caps locked',async()=>{
    if(isIPad){await kb.getByRole('button',{name:'Caps lock',exact:true}).click({timeout:2500});}
    else{const s=kb.getByRole('button',{name:/^(Shift|Caps lock on)$/}).first();await s.click({timeout:2500});await s.click({timeout:2500});}
    await shot(p,'03-abc-caps-locked',KB);});
   await step('caps off',async()=>{const c=kb.getByRole('button',{name:/^(Caps lock|Caps lock on)$/}).first();await c.click({timeout:2500}).catch(()=>{});
    await kb.getByRole('button',{name:/^Shift$/}).first().click({timeout:1500}).catch(()=>{});});
   await step('typed text + suggestion strip',async()=>{
    await field.focus();
    for(const ch of 'compa')await kb.locator(`.k[aria-label="${ch}" i]`).first().click({timeout:2000});
    await shot(p,'04-abc-typed-suggestions',KB);});
   await step('key press preview',async()=>{
    const k=kb.locator('.k[aria-label="a" i]').first();const r=await k.boundingBox();
    await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.waitForTimeout(140);await shot(p,'05-key-press-preview',KB);await p.mouse.up();});
   await step('long-press secondary characters',async()=>{
    const k=kb.locator('.k[aria-label="e" i]').first();const r=await k.boundingBox();
    await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.waitForTimeout(750);await shot(p,'06-key-long-press-secondary',KB);await p.mouse.up();});
   await step('backspace held',async()=>{
    const k=kb.getByRole('button',{name:/^(Delete|Backspace)$/}).first();const r=await k.boundingBox();
    await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.waitForTimeout(300);await shot(p,'07-backspace-held',KB);await p.mouse.up();});
   await step('numbers',async()=>{await kb.getByRole('button',{name:/^\.?\?123$/}).first().click({timeout:2500});await shot(p,'08-numbers',KB);});
   await step('more symbols',async()=>{await kb.getByRole('button',{name:/^(=\\<|#\+=)$/}).first().click({timeout:2500});await shot(p,'09-more-symbols',KB);});
   await step('back to letters',async()=>{await kb.getByRole('button',{name:/^(ABC|\.?\?123)$/}).first().click({timeout:2500}).catch(()=>{});await kb.getByRole('button',{name:'ABC',exact:true}).first().click({timeout:1000}).catch(()=>{});});
   await step('maths symbols',async()=>{
    await kb.getByRole('button',{name:'Maths symbols',exact:true}).first().click({timeout:2500});await shot(p,'10-maths',KB);
    const cats=await p.locator('.kb .cats button').allTextContents();report.mathCategories=cats;
    for(const [i,c] of cats.entries()){
     await step('maths category '+c,async()=>{await p.locator('.kb .cats button').nth(i).click({timeout:2000});await shot(p,`11-maths-${String(i).padStart(2,'0')}-${c.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}`,KB);
      if(c==='Phrases'){await kb.getByRole('button',{name:/phrase page/}).first().click({timeout:1500});await shot(p,`11-maths-${String(i).padStart(2,'0')}-phrases-page-2`,KB);}});}
   });
   await step('browse symbols',async()=>{await kb.getByRole('button',{name:'Browse symbols',exact:true}).first().click({timeout:2500});await shot(p,'12-browse-symbols',null);await p.keyboard.press('Escape');});
   await step('back to ABC from maths',async()=>{await kb.getByRole('button',{name:'ABC',exact:true}).first().click({timeout:1500}).catch(()=>{});});
   await step('keep keyboard open (pin)',async()=>{await p.getByRole('button',{name:/Keep keyboard open|Pinned/}).first().click({timeout:2500});await shot(p,'13-pinned',KB);await p.getByRole('button',{name:/Keep keyboard open|Pinned/}).first().click({timeout:1500}).catch(()=>{});});
   await step('key ink (draw over keys)',async()=>{
    const r=await p.locator('.kb .rows').first().boundingBox();const x=r.x+r.width*0.35,y=r.y+r.height*0.35;
    await p.mouse.move(x,y);await p.mouse.down();for(let i=0;i<=12;i++)await p.mouse.move(x+Math.sin(i/12*Math.PI*2)*40,y+i*8,{steps:2});await shot(p,'14-key-ink-drawing',KB);await p.mouse.up();await shot(p,'15-key-ink-result',KB);});
   await step('hide keyboard',async()=>{await kb.getByRole('button',{name:/^Hide keyboard$/}).first().click({timeout:2500});await shot(p,'16-hidden',KB);await field.click({timeout:2000});await shot(p,'17-shown-again',KB);});
   await step('device keyboard',async()=>{await p.getByRole('button',{name:'Use device keyboard',exact:true}).click({timeout:2500});await shot(p,'18-device-keyboard-mode',KB);await p.getByRole('button',{name:/Use Lemma keyboard/}).click({timeout:1500}).catch(()=>{});});
   await step('equation / ink tools',async()=>{const t=p.getByRole('button',{name:/equation|formula|handwriting|draw/i}).first();await t.click({timeout:1800});await shot(p,'19-equation-mode',KB);});
  }else report.missing.push('tutor keyboard did not appear on '+dev+' (native keyboard expected, e.g. desktop)');
 }catch(e){report.missing.push('tutor: '+String(e.message).split('\n')[0]);}
 await ctx.close();
}

if(want('pad')){
 part='pad';
 // Lemma Pad: the maths keyboard (section "Math keyboard") sits below the editor, so each state scrolls it into view.
 const {ctx,p}=await newPage();const PK='.pad-math-keyboard';
 const padShot=async name=>{await p.locator(PK).first().scrollIntoViewIfNeeded().catch(()=>{});await shot(p,name,PK);};
 try{
  await openHash(p,'/pad?path=real-analysis');await measureKeys(p);
  await step('pad checkpoint',async()=>{await p.getByRole('button',{name:/^Checkpoint:/}).first().click({timeout:3000});
   await p.getByRole('radio',{name:/CP4/}).or(p.getByRole('option',{name:/CP4/})).first().click({timeout:3000});await p.waitForTimeout(700);});
  await padShot('pad-00-editor');
  await step('pad focus',async()=>{await p.getByRole('textbox').first().click({timeout:2500});await padShot('pad-01-focused');});
  await step('pad math keyboard on',async()=>{await p.getByRole('button',{name:'Use math keyboard',exact:true}).click({timeout:2500});await padShot('pad-02-math-on');});
  for(const c of await p.getByRole('tablist',{name:'Math key groups'}).getByRole('tab').allTextContents())
   await step('pad category '+c,async()=>{await p.getByRole('tab',{name:c,exact:true}).click({timeout:2000});await padShot(`pad-03-${c.toLowerCase()}`);});
  await step('pad template',async()=>{await p.getByRole('tab',{name:'Symbols',exact:true}).click();await p.getByRole('button',{name:'Fraction',exact:true}).first().click({timeout:2000});await padShot('pad-04-template-inserted');});
  await step('pad cursor/edit keys',async()=>{const k=p.getByRole('button',{name:'Backspace',exact:true});const r=await k.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.waitForTimeout(260);await padShot('pad-05-backspace-held');await p.mouse.up();});
  await step('pad hide math keyboard',async()=>{await p.getByRole('button',{name:'Hide math keyboard',exact:true}).click({timeout:2000});await shot(p,'pad-06-hidden',null);});
  await step('pad ink tools',async()=>{await p.getByRole('button',{name:'Draw',exact:true}).click({timeout:2000});await shot(p,'pad-07-draw-mode',null);await p.getByRole('button',{name:'Scroll',exact:true}).click({timeout:1500}).catch(()=>{});});
 }catch(e){report.missing.push('pad: '+String(e.message).split('\n')[0]);}
 await ctx.close();
}

if(want('hardware')){
 // Hardware keyboard: Tab through every stop of each screen and record the focus ring; then shortcuts.
 report.hardware={};
 const ids=process.env.AUDIT_SCENES?.split(',').filter(Boolean)??[];
 for(const sc of scenes.filter(s=>applies(s,dev)&&!s.loading&&(!ids.length||ids.includes(s.id)))){
  const {ctx,p}=await newPage();
  try{
   await openScene(p,sc);
   const rows=await focusCycle(p);
   report.hardware[sc.id]={stops:rows.length,noVisibleRing:rows.filter(r=>!r.ring&&!r.shadow).map(r=>r.name),
    offscreen:rows.filter(r=>!r.visible).length,distinctRings:[...new Set(rows.map(r=>r.ring+'|'+r.gap))]};
  }catch(e){report.hardware[sc.id]={error:e.message.split('\n')[0]};report.missing.push('hardware: '+sc.id+': '+e.message.split('\n')[0]);}
  finally{await ctx.close();}
 }
 // shortcuts: Ctrl/⌘ K search, Escape closes a sheet, arrow keys inside a radiogroup, Enter on a focused chip
 const {ctx,p}=await newPage();report.shortcuts={};
 try{
  await openHash(p,'/');
  await p.keyboard.press('Control+k');await p.waitForTimeout(500);
  // Search is a dialog on narrow layouts and the rail's field on wide ones: either way the search combobox takes focus.
  report.shortcuts['Ctrl+K focuses Search']=await p.evaluate(()=>document.activeElement?.getAttribute('role')==='combobox');
  await shot(p,'hw-shortcut-search',null);await p.keyboard.press('Escape');await p.waitForTimeout(400);report.shortcuts['Escape leaves Search']=await p.evaluate(()=>document.activeElement?.getAttribute('role')!=='combobox');
  await p.getByRole('button',{name:'Capture',exact:true}).first().click({timeout:3000});await p.waitForTimeout(500);await p.keyboard.press('Escape');await p.waitForTimeout(400);
  report.shortcuts['Escape closes Capture']=await p.locator('[role=dialog]').count()===0;
  await openHash(p,'/projects');const radio=p.getByRole('radio',{name:/^Active/}).first();await radio.focus();const before=await p.evaluate(()=>document.activeElement.textContent.trim());await p.keyboard.press('ArrowRight');await p.waitForTimeout(250);
  report.shortcuts['ArrowRight moves between the Paths filter radios']=await p.evaluate(b=>document.activeElement.textContent.trim()!==b,before);
  await shot(p,'hw-shortcut-filter-arrow',null);
 }catch(e){report.missing.push('shortcuts: '+String(e.message).split('\n')[0]);}
 await ctx.close();
}
writeFileSync(`${SCRATCH}/keyboard/${dev}.json`,JSON.stringify(report,null,1));
console.log(dev.padEnd(12),'states',Object.keys(report.states).length,'missing',report.missing.length,report.layout?'layout '+report.layout:'');
await b.close();
if(report.missing.length)process.exitCode=1;
