import {chromium,newCtx,openHash} from './lib.mjs';
const b=await chromium.launch();const ctx=await newCtx(b,'ipad-l',{touch:false});const p=await ctx.newPage();
console.log('media hover:',await p.evaluate(()=>matchMedia('(hover:hover)').matches));
await openHash(p,'/');
console.log('media hover after load:',await p.evaluate(()=>[matchMedia('(hover:hover)').matches,matchMedia('(pointer:fine)').matches,matchMedia('(any-hover:hover)').matches]));
for(const [role,name] of [['link','Continue studying'],['button','Start now'],['link','Paths'],['button','Search']]){
 const el=p.getByRole(role,{name}).first();await el.scrollIntoViewIfNeeded();
 const snap=()=>el.evaluate(e=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,bd:s.borderTopColor,color:s.color,tf:s.transform,sh:s.boxShadow.slice(0,50),hover:e.matches(':hover'),bgi:s.backgroundImage.slice(0,40)}});
 await p.mouse.move(2,2);await p.waitForTimeout(300);const a=await snap();
 const r=await el.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2,{steps:4});await p.waitForTimeout(500);const h=await snap();
 console.log(name,'\n  rest ',JSON.stringify(a),'\n  hover',JSON.stringify(h));
}
await b.close();
