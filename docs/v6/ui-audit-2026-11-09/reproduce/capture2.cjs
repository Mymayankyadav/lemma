const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const {newCtx,settle,BASE}=require('./lib.cjs');const measure=require('./measure2.cjs');const steps=require('./steps.cjs');
const theme=process.argv[2]||'night';const only=(process.argv[3]||'').split(',').filter(Boolean);
const W=+(process.argv[4]||390),H=+(process.argv[5]||844),label=process.argv[6]||'phone';
const outDir=path.join('out',label,theme);fs.mkdirSync(outDir,{recursive:true});
(async()=>{
 const b=await chromium.launch();const ctx=await newCtx(b,{theme,w:W,h:H,scale:2});
 let p=await ctx.newPage();const log=[];
 const results=fs.existsSync(path.join(outDir,'results.json'))?JSON.parse(fs.readFileSync(path.join(outDir,'results.json'))):{};
 let i=0;
 for(const [id,route,title,act,opt={}] of steps){
  i++;const num=String(i).padStart(3,'0');
  if(only.length&&!only.includes(id))continue;
  const errs=[];const onErr=e=>errs.push('pageerror: '+e.message.slice(0,160));const onCon=m=>{if(m.type()==='error')errs.push('console: '+m.text().slice(0,160))};
  p.on('pageerror',onErr);p.on('console',onCon);
  try{
   if(route!==null){
    const url=opt.live?BASE+'?demo=0&mode='+theme+'#'+route:BASE+'?demo='+(process.env.DEMO_PROFILE||'1')+'&mode='+theme+'#'+route;
    await p.goto('about:blank');await p.goto(url);await settle(p,700);
   }
   if(act)await act(p);
   await settle(p,700);
  }catch(e){errs.push('STEP FAILED: '+e.message.split('\n')[0].slice(0,200))}
  const files=[];
  try{
   if(!opt.fromHere)await p.evaluate(()=>scrollTo(0,0)).catch(()=>{});
   const f=`${num}-${id}.png`;await p.screenshot({path:path.join(outDir,f),animations:'disabled'});files.push(f);
   const m=await p.evaluate(measure);
   if(opt.scroll){const max=opt.maxPages||5;let y=await p.evaluate(()=>scrollY);for(let k=2;k<=max;k++){
     const moved=await p.evaluate(step=>{const before=scrollY;scrollBy(0,step);return scrollY-before},H-180);if(moved<40)break;await p.waitForTimeout(250);
     const g=`${num}-${id}-${k}.png`;await p.screenshot({path:path.join(outDir,g),animations:'disabled'});files.push(g)}}
   if(opt.dialogScroll){for(let k=2;k<=4;k++){const moved=await p.evaluate(step=>{const d=[...document.querySelectorAll('dialog[open]')].pop();if(!d)return 0;const sc=[d,...d.querySelectorAll('*')].find(e=>e.scrollHeight>e.clientHeight+20&&/(auto|scroll)/.test(getComputedStyle(e).overflowY));if(!sc)return 0;const b=sc.scrollTop;sc.scrollTop+=step;return sc.scrollTop-b},H-200);if(moved<40)break;await p.waitForTimeout(250);
     const g=`${num}-${id}-${k}.png`;await p.screenshot({path:path.join(outDir,g),animations:'disabled'});files.push(g)}}
   results[id]={num,title,route,files,errs,...m};
  }catch(e){results[id]={num,title,route,files,errs:[...errs,'CAPTURE FAILED: '+e.message.slice(0,160)]}}
  p.off('pageerror',onErr);p.off('console',onCon);
  process.stdout.write(id+(errs.length?'(!)':'')+' ');
 }
 fs.writeFileSync(path.join(outDir,'results.json'),JSON.stringify(results,null,1));
 await b.close();console.log('\ndone');
})();
