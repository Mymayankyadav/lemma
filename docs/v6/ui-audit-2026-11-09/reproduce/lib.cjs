const fs=require('fs');
const BASE='http://localhost:4173/lemma/';
const seed=JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
async function newCtx(browser,{theme='night',w=390,h=844,scale=2,seedOn=true}={}){
 const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:scale,colorScheme:theme==='night'?'dark':'light',
  locale:'en-IN',timezoneId:'Asia/Kolkata',reducedMotion:'reduce'});
 if(seedOn)await ctx.addInitScript(s=>{try{if(!sessionStorage.getItem('audit.seeded')){for(const [k,v] of Object.entries(s))sessionStorage.setItem(k,v);sessionStorage.setItem('audit.seeded','1')}}catch(e){}},seed);
 return ctx;
}
async function settle(page,ms=500){
 try{await page.waitForLoadState('networkidle',{timeout:10000})}catch{}
 try{await page.waitForFunction(()=>{const m=document.querySelector('#main-content')||document.body;return !/(^|\n)\s*Loading\b/.test(m.innerText)},null,{timeout:12000})}catch{}
 await page.evaluate(()=>document.fonts&&document.fonts.ready);
 await page.waitForTimeout(ms);
}
async function go(page,route,theme='night',extra=''){
 await page.goto(BASE+'?demo=1&mode='+theme+extra+'#'+route);await settle(page);
}
module.exports={BASE,seed,newCtx,settle,go};
