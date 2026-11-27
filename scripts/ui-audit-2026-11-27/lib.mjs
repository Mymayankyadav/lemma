// Shared setup for the 2026-11-27 dark-mode UI audit (docs/v7/ui-audit-2026-11-27.md).
//   AUDIT_URL  the served production build (default http://127.0.0.1:4177/lemma/?demo=1)
//   AUDIT_OUT  where captures and reports are written (default artifacts/ui-audit-2026-11-27)
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
export {chromium};
export const BASE=process.env.AUDIT_URL??'http://127.0.0.1:4177/lemma/?demo=1';
export const SCRATCH=resolve(process.env.AUDIT_OUT??'artifacts/ui-audit-2026-11-27');
const IPAD='Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID='Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
// The iPad entries use the iPad user agent: the app keys its iPad layout (html[data-ipad]) off it. Viewports follow
// docs/v7/ipad-audit-2026-11-26.md (820x1148 and 1180x788, i.e. minus the 32 pt status bar).
// Mobile up. Widths straddle every layout breakpoint in src (359/360, 560, 600, 699/700, 840, 1024, 1100) and heights
// straddle the landscape-phone rules (max-height 480/500/559). `insets` emulate the iOS/Android safe areas (Chromium
// CDP Emulation.setSafeAreaInsetsOverride); iPads report none (docs/v7/ipad-audit-2026-11-26.md).
const ANDROID_TABLET='Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const DESKTOP='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const dev=(label,width,height,ua,rule,extra={})=>({label,viewport:{width,height},ua,rule,insets:null,touch:true,...extra});
export const DEVICES={
 'phone-xs':dev('Smallest phone (iPhone SE) · portrait',320,568,IPHONE,'below the 359/360 px rules',{insets:{top:20,bottom:0,left:0,right:0}}),
 'phone-s':dev('Small Android · portrait',360,740,ANDROID,'360 px rules'),
 'phone-p':dev('iPhone 14 · portrait',390,844,IPHONE,'reference phone',{insets:{top:47,bottom:34,left:0,right:0}}),
 'phone-xl':dev('iPhone Pro Max · portrait',430,932,IPHONE,'largest phone width',{insets:{top:59,bottom:34,left:0,right:0}}),
 'phone-l':dev('iPhone 14 · landscape',844,390,IPHONE,'landscape-phone rules (height ≤ 480)',{insets:{top:0,bottom:21,left:47,right:47}}),
 'phone-xl-l':dev('iPhone Pro Max · landscape',932,430,IPHONE,'landscape-phone rules, widest',{insets:{top:0,bottom:21,left:59,right:59}}),
 'tablet-s-p':dev('Android 7-8″ tablet · portrait',600,960,ANDROID_TABLET,'600 px rules'),
 'tablet-s-l':dev('Android 7-8″ tablet · landscape',960,600,ANDROID_TABLET,'height 600 landscape'),
 'ipad-mini-p':dev('iPad mini · portrait',744,1101,IPAD,'700 px rail breakpoint'),
 'ipad-mini-l':dev('iPad mini · landscape',1133,712,IPAD,'1100 px wide rail'),
 'ipad-p':dev('iPad 11″ · portrait',820,1148,IPAD,'Owner device (docs/v7/ipad-audit-2026-11-26.md)'),
 'ipad-l':dev('iPad 11″ · landscape',1180,788,IPAD,'Owner device, landscape'),
 'ipad-pro-p':dev('iPad Pro 13″ · portrait',1032,1344,IPAD,'1024 px rules'),
 'ipad-pro-l':dev('iPad Pro 13″ · landscape',1376,1000,IPAD,'largest tablet'),
 'desktop':dev('Desktop 1440 × 900 (pointer)',1440,900,DESKTOP,'desktop layout, hover and keyboard',{touch:false}),
};
/** `--devices=a,b`, AUDIT_DEVICES or the first positional argument: a comma list, `phones`, `tablets` or `all`. */
export function pickDevices(arg){
 const raw=arg??process.env.AUDIT_DEVICES??'all',names=Object.keys(DEVICES);
 if(raw==='all')return names;
 if(raw==='phones')return names.filter(n=>n.startsWith('phone'));
 if(raw==='tablets')return names.filter(n=>/^(tablet|ipad)/.test(n));
 const list=raw.split(',').filter(Boolean);for(const n of list)if(!DEVICES[n])throw new Error('unknown device '+n+' (have '+names.join(', ')+')');
 return list;
}
/** The safe-area override for a device, as a CDP call on the page (no-op where the device has none). */
export async function applyInsets(ctx,page,devName){
 const i=DEVICES[devName].insets;if(!i)return;
 const cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:i}).catch(()=>{});
}
export const NOW=new Date('2026-11-09T13:43:00+05:30');
export async function newCtx(browser,dev,{motion=false,touch=DEVICES[dev].touch,video}={}){
 const d=DEVICES[dev];
 const ctx=await browser.newContext({viewport:d.viewport,deviceScaleFactor:2,isMobile:touch,hasTouch:touch,userAgent:d.ua,colorScheme:'dark',
  reducedMotion:motion?'no-preference':'reduce',locale:'en-IN',timezoneId:'Asia/Kolkata',...(video?{recordVideo:video}:{})});
 // AUDIT_BETA=1 turns on Settings > Advanced > Beta testing (route hand-off animations and the other beta surfaces), which is off by default.
 if(process.env.AUDIT_BETA)await ctx.addInitScript(()=>{try{localStorage.setItem('lemma.v7.beta-testing','1');}catch{}});
 return ctx;
}
export async function openHash(page,hash,{demo='1'}={}){
 await page.clock.setFixedTime(NOW);
 // AUDIT_TEXT=130 reproduces the 130% system text size used by openScene in tests/e2e/v7-scenes.ts.
 if(process.env.AUDIT_TEXT)await page.addInitScript(scale=>{document.addEventListener('DOMContentLoaded',()=>{document.documentElement.style.fontSize=scale+'%';});},process.env.AUDIT_TEXT);
 await page.goto(BASE.replace('demo=1','demo='+demo)+'#'+hash);
 await page.locator('#main-content').waitFor({timeout:15000}).catch(()=>{});
 await page.getByRole('heading',{name:'Loading screen…',exact:true}).waitFor({state:'detached',timeout:8000}).catch(()=>{});
 await page.waitForLoadState('networkidle').catch(()=>{});
 await page.waitForTimeout(900);
 await page.evaluate(()=>document.fonts.ready);
}
