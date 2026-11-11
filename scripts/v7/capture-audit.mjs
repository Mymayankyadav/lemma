// C1–C4: reproducible viewport frames, four modes, and actual tablet/desktop
// layouts. Called against the existing preview by the gallery workflow.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {openScene,shots} from '../../tests/e2e/v7-scenes.ts';
const output='artifacts/v7-gallery/audit';
await mkdir(output,{recursive:true});
const browser=await chromium.launch(),files=[];
const golden=['today','focus','review-round','calendar-day','path-map','atlas'];
try{
 for(const scheme of ['light','dark']){
  for(const contrast of ['normal','high'])for(const name of golden){
   const page=await browser.newPage({baseURL:'http://127.0.0.1:4173',deviceScaleFactor:2,locale:'en-IN',timezoneId:'Asia/Kolkata'});
   try{
    await openScene(page,shots.find(shot=>shot.name===name),scheme,{width:390,height:844});
    if(contrast==='high')await page.locator('html').evaluate(node=>node.setAttribute('data-contrast','high'));
    const file=`${name}-390x844-${scheme==='light'?'day':'night'}-${contrast}.png`;
    await page.screenshot({path:output+'/'+file,animations:'disabled'});files.push(file);
   }finally{await page.close();}
  }
  for(const width of [768,1280])for(const name of ['today','calendar-day']){
   const page=await browser.newPage({baseURL:'http://127.0.0.1:4173',deviceScaleFactor:2,locale:'en-IN',timezoneId:'Asia/Kolkata'});
   try{
    await openScene(page,shots.find(shot=>shot.name===name),scheme,{width,height:800});
    const file=`${name}-${width}x800-${scheme==='light'?'day':'night'}.png`;
    await page.screenshot({path:output+'/'+file,animations:'disabled'});files.push(file);
   }finally{await page.close();}
  }
 }
 await writeFile(output+'/manifest.json',JSON.stringify({sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),clock:'2026-11-09T13:43:00+05:30',locale:'en-IN',timeZone:'Asia/Kolkata',deviceScaleFactor:2,approved:false,files},null,2));
 console.log(`Captured ${files.length} audit frames; source and seed are in manifest.json.`);
}finally{await browser.close();}
