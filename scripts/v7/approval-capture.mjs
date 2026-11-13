import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {catalog,FLAGS,PROFILES} from './approval-catalog.mjs';
import {nativeFixture} from './approval-native.mjs';

const output=resolve(process.env.CAPTURE_OUT??'../lemma-r3-approval');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??undefined});
const probe=process.env.CAPTURE_PROBE==='1',retry=process.env.CAPTURE_RETRY?.split(',');
const jobs=[];
for(const scene of catalog)for(const profile of scene.profiles??['phone','desktop'])for(const theme of probe?['day']:['day','night']){
 if(probe&&profile!=='phone')continue;
 const key=profile+'/'+theme+'/'+scene.name;
 if(retry&&!retry.includes(key))continue;
 jobs.push({scene,profile,theme,key});
}
const records=[],workers=Number(process.env.CAPTURE_WORKERS??4),report=process.env.CAPTURE_REPORT??(probe?'probe':'full');
let cursor=0;
async function worker(){while(cursor<jobs.length){
 const {scene,profile,theme,key}=jobs[cursor++],viewport=PROFILES[profile],context=await browser.newContext({viewport,deviceScaleFactor:1,locale:'en-IN',timezoneId:'Asia/Kolkata',colorScheme:theme==='day'?'light':'dark',reducedMotion:'reduce',serviceWorkers:'block'});
 const page=await context.newPage();page.setDefaultTimeout(5000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const record={key,scene:scene.name,route:scene.hash,profile,theme,viewport,flags:FLAGS,files:[],errors};
 const folder=resolve(output,profile,theme);await mkdir(folder,{recursive:true});
 try{
  if(profile==='android')await page.addInitScript(nativeFixture);
  if(scene.nativeWelcome)await page.addInitScript(()=>localStorage.removeItem('lemma.android.welcomeSeen'));
  if(scene.text)await page.addInitScript(scale=>document.addEventListener('DOMContentLoaded',()=>{document.documentElement.style.fontSize=scale+'%';}),scene.text);
  await page.clock.setFixedTime(new Date('2026-11-09T13:43:00+05:30'));
  await page.goto('http://localhost:4173/lemma/?demo=1&flags='+FLAGS.join(',')+'#'+scene.hash);
  await page.waitForLoadState('networkidle',{timeout:20000});await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>document.querySelector('main')&&document.querySelector('main').textContent.length>20,null,{timeout:10000});
  await page.waitForFunction(()=>!Array.from(document.querySelectorAll('main [role="status"]')).some(node=>/^(Loading|Opening|Arranging)/.test((node.textContent??'').trim())),null,{timeout:10000});
  if(scene.name.startsWith('atlas')&&!scene.hash.includes('view=list'))await page.locator('.v7-atlas-sky').waitFor();
  const offline=page.getByRole('button',{name:'Dismiss notification',exact:true});
  if(await offline.count())await offline.first().click({timeout:700}).catch(()=>{});
  await scene.prepare?.(page);
  await page.waitForLoadState('networkidle',{timeout:20000});await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(180);
  record.url=page.url();record.title=await page.title();
  const enabled=new Set(new URL(record.url).searchParams.get('flags')?.split(','));
  if(FLAGS.some(flag=>!enabled.has(flag)))throw Error('A navigation lost appearance flags');
  record.layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,height:document.documentElement.scrollHeight,headings:[...document.querySelectorAll('h1')].map(node=>node.textContent),dialogs:[...document.querySelectorAll('dialog[open],[role="dialog"]')].filter(node=>node.getBoundingClientRect().width).map(node=>node.getAttribute('aria-label')??node.textContent?.slice(0,80))}));
  const file=profile+'/'+theme+'/'+scene.name+'.png';await page.screenshot({path:resolve(output,file),animations:'disabled',timeout:20000});record.files.push(file);
  if(record.layout.height>viewport.height+120&&record.layout.height<18000){const full=profile+'/'+theme+'/'+scene.name+'--full.png';await page.screenshot({path:resolve(output,full),fullPage:true,animations:'disabled',timeout:20000});record.files.push(full);}
  const bodies=page.locator('dialog[open] .v7-sheet-body');
  for(let i=0;i<await bodies.count();i++){
   const body=bodies.nth(i),size=await body.evaluate(node=>({height:node.clientHeight,scroll:node.scrollHeight}));
   if(size.scroll<=size.height+24)continue;
   for(let step=1;step<=Math.min(3,Math.ceil(size.scroll/Math.max(1,size.height))-1);step++){
    await body.evaluate((node,top)=>{node.scrollTop=top;},step*size.height*.85);
    const part=profile+'/'+theme+'/'+scene.name+'--dialog-'+step+'.png';await page.screenshot({path:resolve(output,part),animations:'disabled'});record.files.push(part);
   }
  }
  record.ok=record.layout.overflow<=1&&errors.length===0;
 }catch(error){
  record.ok=false;record.failure=String(error).slice(0,1500);
  await writeFile(resolve(folder,scene.name+'--failure.txt'),await page.locator('body').innerText().catch(()=>''));
  await page.screenshot({path:resolve(folder,scene.name+'--failure.png')}).catch(()=>{});
 }
 records.push(record);await writeFile(resolve(output,'results-'+report+'.json'),JSON.stringify(records,null,2)+'\n');
 console.log(JSON.stringify({key,ok:record.ok,files:record.files.length,failure:record.failure,overflow:record.layout?.overflow}));
 await context.close();
}}
try{await Promise.all(Array.from({length:workers},worker));}finally{await browser.close();}
await writeFile(resolve(output,'catalog.json'),JSON.stringify(catalog.map(({prepare,...rest})=>rest),null,2)+'\n');
console.log('Completed',records.length,'states;',records.filter(record=>!record.ok).length,'require attention.');
if(records.some(record=>!record.ok))process.exitCode=1;
