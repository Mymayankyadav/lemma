/* Review phones at 390×844; create five-screen contact sheets without image dependencies.
 * THEMES=all DENSITY=compact EFFECTS=calm node scripts/review-shots.mjs
 */
import {chromium} from 'playwright';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

const base=(process.env.BASE_URL||'http://localhost:4173/lemma/').replace(/\/$/,'')+'/';
const themeCss=readFileSync('src/styles/themes.css','utf8');
const known=[...themeCss.matchAll(/html\[data-theme="([^"]+)"\]/g)].map(m=>m[1]);
if(known.length!==15)throw new Error('Expected all 15 generated themes');
const request=process.env.THEMES||'obsidian';
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
 }
} finally {await browser.close();}
