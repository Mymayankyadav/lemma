#!/usr/bin/env node
/**
 * G0 (v7 UX audit r3): the install dialog's screenshots (public/screenshots/) showed a pre-v6 Today. This captures v7
 * Today in Day and Night from the real app, as a 360 × 640 phone at 3× (1080 × 1920, the size scripts/check-pwa.mjs
 * requires), on the example workspace with the clock fixed so the picture is stable.
 *
 *   VITE_ALLOW_FLAG_OVERRIDES=1 npm run build && npm run preview -- --port 4173
 *   node scripts/v7/install-shots.mjs [base-url]
 */
import {chromium} from '@playwright/test';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..','..');
const base=process.argv[2]??'http://localhost:4173/lemma/';
const at=new Date('2026-11-12T10:20:00+05:30');
const browser=await chromium.launch();
try{
 for(const [name,scheme] of [['day','light'],['night','dark']]){
  const context=await browser.newContext({viewport:{width:360,height:640},deviceScaleFactor:3,locale:'en-IN',timezoneId:'Asia/Kolkata',colorScheme:scheme,reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.clock.setFixedTime(at);
  await page.goto(base+'?demo=1&flags=v7Shell,v6Shell#/');
  await page.waitForSelector('html[data-v7]');
  await page.waitForLoadState('networkidle');
  // The example workspace's chip and any toast are not part of the product picture.
  await page.addStyleTag({content:'.v7-demo-chip,.v7-toast-host{display:none!important}'});
  await page.waitForTimeout(500);
  const file=resolve(root,'public/screenshots/today-'+name+'-1080x1920.png');
  await page.screenshot({path:file,animations:'disabled'});
  console.log('wrote',file);
  await context.close();
 }
}finally{await browser.close();}
