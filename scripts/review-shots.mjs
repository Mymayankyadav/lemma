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
mkdirSync('review-shots/sheets',{recursive:true});
const browser=await chromium.launch();
try {
 const phone=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:'dark'});
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
     await phone.setViewportSize({width,height});
     const dir=join('review-shots','v4',theme,demo,width+'px');
     mkdirSync(dir,{recursive:true});
     for(const {name,route,action} of routes){
      const url=base+'?demo='+demo+'&theme='+encodeURIComponent(theme)+route;
      await phone.goto(url,{waitUntil:'domcontentloaded'});
      await phone.locator('#main-content').waitFor({state:'visible'});
      await phone.waitForTimeout(400);
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
