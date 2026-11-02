/* v4 Graph day/night contact sheets; keep the screenshot runner usable while
 * the full route × profile × width × world acceptance gate is built.
 * THEMES=all node scripts/review-shots.mjs
 */
import {chromium} from 'playwright';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

const base=(process.env.BASE_URL||'http://localhost:4173/lemma/').replace(/\/$/,'')+'/';
const themeCss=readFileSync('src/styles/themes.css','utf8');
const known=[...themeCss.matchAll(/html\[data-theme="([^"]+)"\]/g)].map(m=>m[1]);
if(known.length!==2||!known.includes('graph')||!known.includes('graph-night'))throw new Error('Expected approved Graph day/night themes');
const request=process.env.THEMES||'all';
const chosen=request==='all'?known:request.split(',').map(t=>t.trim()).filter(Boolean);
if(!chosen.length||chosen.some(t=>!known.includes(t)))throw new Error('Unknown theme in THEMES='+request);
const density=process.env.DENSITY||'compact';
const effects=process.env.EFFECTS||'calm';
if(!['compact','cozy','comfortable'].includes(density))throw Error('Invalid DENSITY');
if(!['calm','rich'].includes(effects))throw Error('Invalid EFFECTS');
const screens=[
 ['home','#/'],['project','#/p/real-analysis'],['card-review','#/review/run'],
 ['insights','#/insights'],['settings','#/settings'],
];
const v4Headings={
 'today':'Home','paths':'Paths','new-project':'New project',
 'project-path':'Project','project-sessions':'Project','project-sources':'Project',
 'checkpoint':'Checkpoint','session':'Session record','proposals':'Approve',
 'plan-change':'Plan proposal','review':'Review','review-run':'Card review',
 'review-run-answer':'Card review','review-done':'Review complete',
 'cards':'Cards','card':'Card detail','atlas':'Atlas','atlas-selected':'Atlas',
 'atlas-details':'Atlas','atlas-all':'Atlas','insights':'Insights',
 'settings':'Settings','sign-in':'Sign in',
};
/** QA-4 Mini Route is one bar. Segment seams are borders, not data marks:
 * check each grouped segment's own width, not a fictitious gap at its seam.
 */
async function checkMiniRoutes(page,scene){
 const bars=page.locator('[data-mini-route]');
 await bars.first().waitFor({state:'visible'});
 const errors=await bars.evaluateAll(nodes=>nodes.filter(bar=>{
  const rect=bar.getBoundingClientRect(),style=getComputedStyle(bar);
  return rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden';
 }).flatMap((bar,index)=>{
  const track=bar.querySelector('[data-stage-bar]');
  if(!track)return ['bar '+index+' missing stage track'];
  const segments=[...track.querySelectorAll('[data-stage-segment]')];
  const width=track.getBoundingClientRect().width;
  const widths=segments.map(node=>node.getBoundingClientRect().width);
  const notch=bar.querySelectorAll('[data-route-notch]');
  const failures=[];
  // A project with no checkpoints has no segments and no current notch.
  // It must not be mistaken for a broken nonempty Route.
  if(/^0 of 0 checkpoints/.test(bar.getAttribute('aria-label')||'')){
   if(segments.length||notch.length)failures.push('empty bar '+index+' unexpectedly has marks');
   return failures;
  }
  if(!segments.length)failures.push('bar '+index+' has no segments');
  if(widths.some(value=>value<7.99))failures.push('bar '+index+' has a segment under 8px');
  if(widths.reduce((sum,value)=>sum+value,0)>width+1)failures.push('bar '+index+' exceeds one track');
  if(bar.querySelectorAll('[data-mini-tick]').length)failures.push('bar '+index+' contains checkpoint ticks');
  if(notch.length!==1)failures.push('bar '+index+' must show one current-position notch');
  if(notch.length===1){
   const rect=notch[0].getBoundingClientRect(),edge=track.getBoundingClientRect();
   if(Math.abs(rect.width-2)>0.5||Math.abs(rect.height-12)>0.5)failures.push('bar '+index+' notch is not 2×12px');
   const left=rect.left-edge.left,right=edge.right-rect.right;
   if(!((left>=7.99&&right>=7.99)||(left>=-0.1&&left<=0.1)||(right>=-0.1&&right<=0.1)))
    failures.push('bar '+index+' notch lacks 8px edge clearance');
  }
  return failures;
 }));
 if(errors.length)throw Error('QA-4 Mini Route geometry '+scene+': '+errors.join('; '));
}
// Isolate each screenshot matrix from previous session and service-worker
// state. This never retries a failed route; first-attempt assertions remain.
async function newCapturePhone(browser,width=390,height=844){
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:2,colorScheme:'dark'});
 if(process.env.V4_MATRIX==='1'){
  await page.addInitScript(()=>{try{localStorage.removeItem('lemma.atlas.v2')}catch{}});
 }
 return page;
}
mkdirSync('review-shots/sheets',{recursive:true});
const browser=await chromium.launch();
try {
 let phone=await newCapturePhone(browser);
 const sheet=await browser.newPage({viewport:{width:1950,height:888},deviceScaleFactor:2,colorScheme:'dark'});
 for(const theme of chosen){
  mkdirSync(join('review-shots',theme),{recursive:true});
  const pictures=[];
  for(const [name,route] of screens){
   const url=base+'?demo=1&theme='+encodeURIComponent(theme)+'&density='+encodeURIComponent(density)+'&effects='+encodeURIComponent(effects)+route;
   await phone.goto(url,{waitUntil:'networkidle'});
   await phone.waitForTimeout(350);
   const actual=await phone.locator('html').getAttribute('data-theme');
   if(actual!==theme)throw new Error('Theme did not apply: '+theme+' on '+name+' (got '+actual+')');
   const file=join('review-shots',theme,name+'.png');
   const png=await phone.screenshot({path:file,animations:'disabled'});
   pictures.push({name,data:png.toString('base64')});
   console.log('Captured',theme,name);
  }
  const cells=pictures.map(p=>'<figure style="margin:0;width:390px;flex:none"><figcaption style="height:44px;padding:12px 14px;font:600 16px system-ui;background:#19191D;color:#F5F5F5">'+p.name.replaceAll('-',' ')+'</figcaption><img style="display:block;width:390px;height:844px" src="data:image/png;base64,'+p.data+'"></figure>').join('');
  await sheet.setContent('<!doctype html><html><body style="display:flex;align-items:start;margin:0;width:1950px;background:#19191D">'+cells+'</body></html>',{waitUntil:'load'});
  await sheet.screenshot({path:join('review-shots','sheets',theme+'.png'),animations:'disabled',fullPage:true});
  console.log('Sheet',theme);
  // Optional complete v4 route/profile/width audit; use V4_MATRIX=1 for the
  // approved capture inventory, without changing legacy five-panel sheets.
  if(process.env.V4_MATRIX==='1'){
   const routes=JSON.parse(readFileSync(new URL('./v4-capture-inventory.json',import.meta.url),'utf8'));
   for(const demo of ['1','stress']){
    for(const [width,height] of [[360,780],[390,844]]){
     await phone.close();
     phone=await newCapturePhone(browser,width,height);
     const dir=join('review-shots','v4',theme,demo,width+'px');
     mkdirSync(dir,{recursive:true});
     for(const {name,route,action} of routes){
      // Review-run and Review-done require an initialized review session.
      // Deep-linking to those routes in a fresh browser yields an empty/redirect
      // state rather than the owner's actual card and completed-round screens.
      const reviewScene=['review-run','review-run-answer','review-done'].includes(name);
      const entry=reviewScene?'#/review':route;
      // Atlas interaction scenes share #/atlas. A same-URL goto can reuse
      // the existing document and leave the Details sheet covering "All".
      // A distinct harmless query key forces a fresh route mount per scene.
      const url=base+'?demo='+demo+'&theme='+encodeURIComponent(theme)+
       '&capture='+encodeURIComponent(name)+entry;
      await phone.goto(url,{waitUntil:'domcontentloaded'});
      await phone.locator('#main-content').waitFor({state:'visible'});
      if(reviewScene){
       await phone.getByRole('button',{name:'Start review'}).click();
       await phone.getByRole('heading',{name:'Card review',level:1}).waitFor({state:'visible'});
       if(name==='review-done'){
        await phone.getByRole('button',{name:'Sure',exact:true}).click();
        await phone.getByRole('button',{name:'Grade Good'}).click();
        await phone.getByRole('button',{name:'Close review'}).click();
        await phone.getByRole('heading',{name:'Review complete',level:1}).waitFor({state:'visible'});
       }
      }
      // Interaction variants are separate scenes, not copies of the idle route.
      if(action==='show-answer'){
       await phone.getByRole('button',{name:'Show answer'}).click();
      }else if(action==='atlas-select'||action==='atlas-details'){
       await phone.getByRole('button',{name:'Find an idea'}).click();
       await phone.getByRole('textbox',{name:'Find an idea'}).fill('Compactness');
       await phone.getByRole('button',{name:/^Compactness, /}).first().click();
       await phone.locator('[data-atlas-peek]').waitFor({state:'visible'});
       if(action==='atlas-details'){
        await phone.locator('[data-atlas-peek]').getByRole('button',{name:'Details'}).click();
        await phone.getByRole('dialog',{name:'Compactness'}).waitFor({state:'visible'});
       }
      }else if(action==='atlas-all'){
       await phone.getByRole('group',{name:'Fold to depth'}).getByRole('button',{name:'All'}).click();
       const confirmation=phone.getByRole('dialog',{name:'Unfold every idea?'});
       if(await confirmation.isVisible())await confirmation.getByRole('button',{name:'Unfold all'}).click();
      }
      const actual=await phone.locator('html').getAttribute('data-theme');
      if(actual!==theme)throw Error('Unexpected world for '+name+' '+demo);
      // A shell-only frame or an error redirect is not route evidence.
      // Require the exact destination heading, not merely any h1 left behind
      // by a HashRouter transition, then check the loaded route's key data.
      const heading=v4Headings[name];
      if(!heading)throw Error('No QA-4 route heading contract for '+name);
      await phone.getByRole('heading',{name:heading,level:1,exact:true}).waitFor({state:'visible'});
      // QA-4 #737: a heading alone is not data-backed Today evidence.
      // The demo Review forecast can still be inside Suspense after the h1
      // appears; wait for the seven actual bars instead of capturing its
      // transient "Loading seven-day forecast" placeholder. All-clear desks
      // have no due count and deliberately need no forecast bars.
      if(name==='today'){
       const review=phone.getByRole('region',{name:'Review',exact:true});
       const hasDue=(await review.locator('p').filter({hasText:/^\s*[\d,]+\s+due\s*$/}).count())>0;
       if(hasDue){
        await review.locator('[data-review-spark-bar]').first().waitFor({state:'visible'});
        const bars=await review.locator('[data-review-spark-bar]').count();
        if(bars!==7)throw Error('Today forecast must show seven settled bars');
       }
       if(await review.getByText(/Loading (seven-day )?forecast/i).count())
        throw Error('Loading forecast is not valid QA-4 Today evidence');
      }
      if(name==='paths')await checkMiniRoutes(phone,theme+'/'+demo+'/'+width);
      if(name==='review-run'||name==='review-run-answer')
       await phone.locator('[data-review-card-scroll]').waitFor({state:'visible'});
      if(name==='review-done')
       await phone.getByRole('region',{name:'Review statistics'}).waitFor({state:'visible'});
      if(name==='plan-change'){
       await phone.getByRole('region',{name:'Plan errata'}).waitFor({state:'visible'});
       await phone.getByRole('region',{name:'Ideas in this plan'}).waitFor({state:'visible'});
      }
      await phone.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await phone.screenshot({path:join(dir,name+'.png'),animations:'disabled'});
      if(['paths','project-path','project-sources','proposals','cards','atlas','insights','settings'].includes(name)){
       await phone.screenshot({path:join(dir,name+'-full.png'),animations:'disabled',fullPage:true});
      }
     }
     console.log('v4 route matrix captured',theme,demo,width);
    }
   }
  }
 }
} finally {await browser.close();}
