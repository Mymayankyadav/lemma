import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from '@playwright/test';
import {catalog,profiles,FLAGS,baseline} from './parity-catalog.mjs';

const output=resolve(process.env.LEMMA_PARITY_OUTPUT??'artifacts/ui-parity');
const address=process.env.LEMMA_PARITY_URL??'http://127.0.0.1:4182';
const selected=process.argv.slice(2),records=[];
const jobs=catalog.filter(scene=>!selected.length||selected.includes(scene.name)).flatMap(scene=>(scene.profiles??(process.env.LEMMA_PARITY_PROFILES??'phone').split(',')).flatMap(profile=>
 (process.env.LEMMA_PARITY_THEMES??'night').split(',').map(theme=>({scene,profile,theme}))));
if(selected.some(name=>!catalog.some(scene=>scene.name===name)))throw new Error('Unknown audit scene: '+selected.filter(name=>!catalog.some(scene=>scene.name===name)).join(', '));
const sourceCommit=process.env.LEMMA_PARITY_COMMIT??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const dirty=process.env.LEMMA_PARITY_DIRTY===undefined?Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()):process.env.LEMMA_PARITY_DIRTY==='1';
await mkdir(output,{recursive:true});
const browser=await chromium.launch();let cursor=0;
async function worker(){while(cursor<jobs.length){
 const {scene,profile,theme}=jobs[cursor++],size=profiles[profile];
 const page=await browser.newPage({baseURL:address,viewport:size,deviceScaleFactor:1,locale:'en-IN',timezoneId:'Asia/Kolkata',colorScheme:theme==='day'?'light':'dark',reducedMotion:'reduce'});
 const record={scene:scene.name,route:scene.hash,profile,theme,account:scene.demo??'populated',files:[],errors:[]};
 const folder=resolve(output,profile,theme);await mkdir(folder,{recursive:true});page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(20000);
 page.on('pageerror',error=>record.errors.push(error.message));
 try{
  if(scene.demo==='first-use')await page.addInitScript(()=>{
   for(const [key,value] of Object.entries({
    'lemma.v6.demo.study.v1':{schema:1,entries:[],blocks:[]},
    'lemma.v6.demo.tasks.v1':{schema:1,tasks:[]},
    'lemma.v6.demo.study-goals.v1':{schema:1,goals:[]},
    'lemma.v6.demo.parked-thoughts.v1':{schema:1,thoughts:[]},
    'lemma.v6.demo.practice-topics.v1':{schema:1,topics:[],events:[],history:[]},
   }))sessionStorage.setItem(key,JSON.stringify(value));
  });
  if(size.text)await page.addInitScript(scale=>document.addEventListener('DOMContentLoaded',()=>document.documentElement.style.fontSize=scale+'%'),size.text);
  await page.clock.setFixedTime(new Date('2026-11-09T13:43:00+05:30'));
  await page.goto('/lemma/?demo='+(scene.demo??'1')+'&flags='+FLAGS.join(',')+(scene.flags?','+scene.flags:'')+'#'+scene.hash);
  const atlas=scene.hash.startsWith('/atlas');
  if(atlas)await page.locator('.v7-atlas:not([aria-busy="true"])').waitFor();
  else await page.waitForLoadState('networkidle',{timeout:20000});
  await page.evaluate(()=>document.fonts.ready);
  await scene.prepare?.(page);
  if(atlas){
   await page.locator('.v7-atlas').waitFor();
   const map=page.locator('.v7-atlas[data-view="map"] .v7-atlas-map:not([data-covered])');
   // The map region exists while its worker is still arranging the sky.
   // Wait for the canvas even when the sky element has not mounted yet.
   if(await map.count())await map.locator('.v7-atlas-sky[data-drawn-extent]').waitFor();
  }else await page.waitForLoadState('networkidle',{timeout:20000});
  await page.getByRole('heading',{name:'Loading screen…',exact:true}).waitFor({state:'hidden',timeout:15000});
  await page.locator('.v7-skeleton').first().waitFor({state:'hidden',timeout:10000});
  await page.waitForFunction(()=>[...document.querySelectorAll('main')].some(node=>node.getBoundingClientRect().height>0&&node.textContent.trim().length>0));
  if(scene.reducedViewport)await page.setViewportSize({width:size.width,height:Math.min(480,size.height)});
  // JS-driven sheet animations and debounced local indexes do not necessarily
  // create network traffic. Wait for painted geometry, not just network idle.
  await page.waitForFunction(()=>{
   const nodes=[...document.querySelectorAll('main, dialog[open], dialog[open] h2, dialog[open] input, dialog[open] button')];
   const signature=JSON.stringify(nodes.map(node=>{
    const box=node.getBoundingClientRect();
    return [box.x,box.y,box.width,box.height].map(value=>Math.round(value*10)/10);
   }));
   const now=performance.now();
   const previous=window.__lemmaParityPaint;
   if(!previous||previous.signature!==signature){window.__lemmaParityPaint={signature,since:now};return false;}
   return now-previous.since>=350;
  },undefined,{polling:80,timeout:10000});
  await page.evaluate(()=>{delete window.__lemmaParityPaint;});
  record.url=page.url();
  record.buildEntries=await page.locator('script[type="module"][src]').evaluateAll(nodes=>nodes.map(node=>new URL(node.src).pathname));
  record.layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,headings:[...document.querySelectorAll('h1')].map(element=>element.textContent)}));
  const capture=async suffix=>{const file=profile+'/'+theme+'/'+scene.name+suffix+'.jpg';await page.screenshot({path:resolve(output,file),type:'jpeg',quality:86,animations:'disabled'});record.files.push(file);};
  await capture('');
  // Every scroll container, not just the document. Modal sheets, conversation,
  // month/agenda lists and nested source pages all have their own scroll position.
  const scrollable=await page.evaluate(()=>{
   const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);
   const elements=dialog?[dialog,...dialog.querySelectorAll('*')]:[document.scrollingElement,...document.querySelectorAll('main,main *')];
   return [...new Set(elements)].filter(element=>element&&element.clientHeight>100&&element.scrollHeight>element.clientHeight+48&&
    (element===document.scrollingElement||['auto','scroll'].includes(getComputedStyle(element).overflowY)))
    .filter(element=>{const box=element.getBoundingClientRect();return box.width>100&&box.bottom>0&&box.top<innerHeight;})
    .map((element,index)=>{element.setAttribute('data-parity-scroll',String(index));return {index,height:element.clientHeight,scroll:element.scrollHeight};});
  });
  for(const {index,height,scroll} of scrollable){
   const element=page.locator('[data-parity-scroll="'+index+'"]');
   const stops=Math.ceil((scroll-height)/Math.max(1,height*.8));
   for(let step=1;step<=stops;step++){
    await element.evaluate((node,top)=>{node.scrollTop=top;},Math.min(scroll-height,step*height*.8));
    await page.waitForTimeout(30);await capture('--scroll-'+index+'-'+step);
   }
   await element.evaluate(node=>{node.scrollTop=0;});
  }
  record.ok=record.layout.overflow<=1&&record.errors.length===0;
 }catch(error){record.ok=false;record.failure=String(error).slice(0,1500);await writeFile(resolve(folder,scene.name+'--failure.txt'),await page.locator('body').innerText().catch(()=>''));}
 records.push(record);console.log(JSON.stringify({scene:scene.name,profile,theme,ok:record.ok,frames:record.files.length,failure:record.failure,overflow:record.layout?.overflow}));
 await page.close();
}}
try{await Promise.all(Array.from({length:Number(process.env.LEMMA_PARITY_WORKERS??3)},worker));}finally{await browser.close();}
await writeFile(resolve(output,'manifest.json'),JSON.stringify({sourceCommit,dirty,baseline,capturedAt:new Date().toISOString(),profiles,records},null,2)+'\n');
console.log('Captured',records.reduce((sum,record)=>sum+record.files.length,0),'frames;',records.filter(record=>!record.ok).length,'states require attention.');
if(records.some(record=>!record.ok))process.exitCode=1;
