import {chromium,newCtx,openHash} from './lib.mjs';
const hashes=process.argv.slice(3);const b=await chromium.launch();const ctx=await newCtx(b,process.argv[2]);const p=await ctx.newPage();
for(const h of hashes){
 await openHash(p,h);
 const info=await p.evaluate(()=>{
  const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0};
  return {h:location.hash,h1:document.querySelector('h1')?.textContent,doc:[document.documentElement.scrollHeight,innerHeight,document.documentElement.scrollWidth],
  controls:[...document.querySelectorAll('main button,main a[href],main [role=tab],main [role=radio],main [role=switch],main input,main select,main textarea,main summary,header button,header a')].filter(vis).map(e=>(e.getAttribute('role')||e.tagName.toLowerCase())+':'+((e.getAttribute('aria-label')||e.textContent||e.getAttribute('placeholder')||'').trim().replace(/\s+/g,' ').slice(0,32)))};});
 console.log('\n##',info.h,'| h1=',info.h1,'| doc',info.doc.join('x'));console.log(info.controls.join(' | '));
}
await b.close();
