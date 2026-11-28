import {chromium,newCtx,openHash} from './lib.mjs';
const [,, dev, hash, ...rest]=process.argv;
const b=await chromium.launch();const ctx=await newCtx(b,dev);const p=await ctx.newPage();
await openHash(p,hash);
for(const act of rest){ // "click:Name"
  const [k,v]=act.split(/:(.*)/s);
  if(k==='click'){let l=null;for(const r of ['button','link','radio','tab','menuitem','switch','option','checkbox'])l=l?l.or(p.getByRole(r,{name:v})):p.getByRole(r,{name:v});await l.first().click({timeout:4000});}
  if(k==='fill')await p.locator('textarea,input').first().fill(v);
  if(k==='wait')await p.waitForTimeout(+v);
  await p.waitForTimeout(500);
}
const info=await p.evaluate(()=>{
 const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight*3};
 const scrollers=[...document.querySelectorAll('*')].filter(e=>{const s=getComputedStyle(e);return /(auto|scroll)/.test(s.overflowY)&&e.scrollHeight>e.clientHeight+4}).map(e=>e.tagName+'.'+String(e.className).slice(0,50)+' '+e.scrollHeight+'/'+e.clientHeight);
 return {url:location.hash,doc:[document.documentElement.scrollHeight,innerHeight],scrollers,
  dialogs:[...document.querySelectorAll('[role=dialog],dialog[open]')].map(d=>d.getAttribute('aria-label')||d.textContent.slice(0,30)),
  controls:[...(document.querySelector('[role=dialog],dialog[open]')||document).querySelectorAll('button,a[href],[role=tab],[role=switch],input,select,textarea,summary')].filter(vis).map(e=>(e.getAttribute('role')||e.tagName.toLowerCase())+': '+((e.getAttribute('aria-label')||e.textContent||e.getAttribute('placeholder')||'').trim().replace(/\s+/g,' ').slice(0,45)))};
});
console.log('URL',info.url,'dialogs',JSON.stringify(info.dialogs),'doc',info.doc,'scrollers',JSON.stringify(info.scrollers));console.log(info.controls.join(' | '));
await b.close();
