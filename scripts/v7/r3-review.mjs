// Reproducible review candidates, not approved goldens. Run after an override-enabled build and preview on :4173.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const output=resolve('docs/v7/review-r3');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const now=new Date('2026-11-09T13:43:00+05:30'),measurements=[];
const desktop=[['today','/'],['review','/review'],['path','/p/real-analysis'],['calendar','/calendar?view=day&date=2026-11-09'],['inbox','/proposals'],['progress','/insights']];
const phone=[['calendar','/calendar?view=day&date=2026-11-09'],['path','/p/real-analysis'],['tasks','/tasks'],['atlas','/atlas'],['search','/'],['welcome','/welcome']];
try{
 for(const colorScheme of ['light','dark'])for(const device of ['phone','desktop']){
  const viewport=device==='phone'?{width:390,height:844}:{width:1280,height:800};
  const shots=device==='phone'?phone:desktop;
  for(const [name,route] of shots)for(const state of device==='phone'&&['calendar','path'].includes(name)?['before','after']:['after']){
   const context=await browser.newContext({viewport,colorScheme,reducedMotion:'reduce',timezoneId:'Asia/Kolkata',locale:'en-IN',deviceScaleFactor:1,serviceWorkers:'block'});
   const page=await context.newPage();await page.clock.setFixedTime(now);
   const flags=['v7Shell','v6Shell',...(state==='after'?['v7Room']:[]),...(device==='desktop'?['v7Margin','v7Spread']:[])];
   await page.goto('http://localhost:4173/lemma/?demo=1&flags='+flags.join(',')+'#'+route);
   await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);
   await page.waitForFunction(()=>!Array.from(document.querySelectorAll('main [role="status"]')).some(node=>/Loading|Arranging/.test(node.textContent??'')),undefined,{timeout:15000});
   if(name==='atlas')await page.locator('.v7-atlas-sky').waitFor();
   if(name==='calendar')await page.locator('.v7-cal-suggested[data-kind="suggested"]').first().waitFor({timeout:15000});
   if(name==='search'){
    for(const recent of ['/p/real-analysis','/s/real-analysis/7','/cards/1']){
     await page.goto('http://localhost:4173/lemma/?demo=1&flags='+flags.join(',')+'#'+recent);
     await page.waitForLoadState('networkidle');await page.locator('main h1').first().waitFor();
    }
    await page.keyboard.press('Control+k');await page.getByRole('region',{name:'Jump back in'}).waitFor();
   }
   if(name==='review'&&device==='desktop'){
    await page.getByRole('button',{name:/^Start \d+ cards|^Resume/}).first().click();
    await page.getByRole('button',{name:'Show answer',exact:true}).click();
   }
   // The review harness blocks service workers; dismiss its expected offline-install notice before capturing.
   const dismiss=page.getByRole('button',{name:'Dismiss notification',exact:true});
   if(await dismiss.count())await dismiss.first().click({timeout:1000}).catch(()=>{/* It may have expired during the click. */});
   await dismiss.first().waitFor({state:'hidden',timeout:5000});
   const file=`${device}-${name}-${colorScheme==='light'?'day':'night'}-${state}.png`;
   await page.screenshot({path:resolve(output,file),animations:'disabled'});
   const measured=await page.evaluate(()=>{
    const grid=document.querySelector('.v7-cal-scroll')?.getBoundingClientRect();
    return {overflow:document.documentElement.scrollWidth-innerWidth,title:document.querySelector('main h1')?.textContent,gridShare:grid?grid.height/innerHeight:null};
   });
   measurements.push({file,flags,...measured});console.log(file,JSON.stringify(measured));await context.close();
  }
 }
 await writeFile(resolve(output,'measurements.json'),JSON.stringify(measurements,null,2)+'\n');
}finally{await browser.close();}
