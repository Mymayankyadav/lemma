import {chromium,newCtx,openHash,SCRATCH} from './lib.mjs';
import {measure} from './metrics.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=`${SCRATCH}/palette`;mkdirSync(out,{recursive:true});
// Variant A: palette tokens only. Variant B: A + the structural fixes (no programmatic heading ring, quieter paper grid, lifted dock).
const TOKENS=`
html[data-v7][data-theme="graph-night"]{
 --lemma-paper:#161615 !important;
 --v7-role-surface-sunken:#0E0E0D;
 --v7-role-surface-page:#161615;
 --v7-role-surface-raised:#292927;
 --v7-role-surface-overlay:#292927;
 --v7-role-surface-muted:#292927;
 --v7-role-surface-lifted:#363633;
 --v7-role-surface-muted-hover:#363633;
 --v7-role-state-hover:#363633;
 --v7-role-state-lifted-hover:#42423E;
 --v7-role-border-subtle:#51514D;
 --v7-role-border-default:#8E8C84;
 --v7-role-border-strong:#C9C7BD;
 --v7-role-text-secondary:#D2D0C6;
 --v7-role-text-tertiary:#ABA9A0;
 --v7-role-selection-subtle:#3A2A31;
 --v7-role-selection-hover:#4B343D;
 --v7-role-selection-fg:#F2B8CB;
 --v7-role-state-pressed:#3F3035;
 --accent-subtle:#3A2A31;
 --v7-shadow-2:inset 0 1px rgb(255 255 255 / 6%),0 10px 28px rgb(0 0 0 / 70%);
}`;
const FIXES=`
html[data-v7] :is(h1,main)[tabindex="-1"]:focus,html[data-v7] :is(h1,main)[tabindex="-1"]:focus-visible{outline:none !important;box-shadow:none !important}
html[data-v7][data-theme="graph-night"] body{--v7-default-grid:linear-gradient(to right,color-mix(in srgb,var(--v7-role-border-subtle) 38%,transparent) 1px,transparent 1px),linear-gradient(to bottom,color-mix(in srgb,var(--v7-role-border-subtle) 38%,transparent) 1px,transparent 1px)}
html[data-v7][data-theme="graph-night"] .v7-dock{background:var(--v7-role-surface-lifted);border-color:var(--v7-role-border-default)}
`;
const scenes=[['today','/',[]],['paths','/projects',[]],['calendar-day','/calendar?view=day&date=2026-11-09',[]],['calendar-week','/calendar?view=week&date=2026-11-09',[]],
 ['review-hub','/review',[]],['review-answer','/review',['click:Start review','wait:800','click:Show answer']],['settings-appearance','/settings?section=appearance',[]],['progress','/insights',[]],
 ['path-plan','/p/real-analysis',[]],['capture-sheet','/',['click:Capture','fill:Read Rudin chapter 4']],['tasks','/tasks',[]],['cards','/cards',[]]];
// node palette.mjs [--dev=phone-p,ipad-l] [--scenes=today,paths]
const arg=n=>process.argv.find(a=>a.startsWith('--'+n+'='))?.split('=')[1].split(',');
const b=await chromium.launch();const rows={};
for(const dev of arg('dev')??['phone-p','ipad-l']){
 for(const [id,hash,steps] of scenes){
  if(arg('scenes')&&!arg('scenes').includes(id))continue;
  for(const variant of ['before','A','B']){
   const ctx=await newCtx(b,dev);const p=await ctx.newPage();
   try{
    if(dev==='phone-p'){const c=await ctx.newCDPSession(p);await c.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:47,bottom:34,left:0,right:0}}).catch(()=>{});}
    await openHash(p,hash);
    if(variant!=='before'){await p.addStyleTag({content:TOKENS+(variant==='B'?FIXES:'')});await p.waitForTimeout(300);}
    for(const s of steps){const i=s.indexOf(':');const k=s.slice(0,i),v=s.slice(i+1);
     if(k==='click')await p.getByRole('button',{name:v}).first().click({timeout:4000}).catch(()=>{});
     if(k==='fill')await p.locator('textarea').first().fill(v).catch(()=>{});
     if(k==='wait')await p.waitForTimeout(+v);await p.waitForTimeout(400);}
    await p.waitForTimeout(500);
    await p.screenshot({path:`${out}/${dev}-${id}-${variant}.png`,animations:'disabled'});
    const m=await p.evaluate(measure);
    (rows[`${dev}|${id}`]??={})[variant]={textMedian:m.text.median,textFail:m.text.fail,textMin:m.text.minRatio,surface:m.layers.medianSurface,border:m.layers.medianBorder,weak:m.layers.weakSeparation,pageBg:m.pageBg,pink:m.pinkEdgeCount,
      worst:m.text.worst.slice(0,3).map(w=>`${w.fg} on ${w.bg} ${w.ratio}`)};
   }catch(e){console.log('ERR',dev,id,variant,String(e.message).split('\n')[0]);}
   await ctx.close();
  }
  console.log(dev,id,'done');
 }
}
writeFileSync(`${out}/summary.json`,JSON.stringify(rows,null,1));
await b.close();
