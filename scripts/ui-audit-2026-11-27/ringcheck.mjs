import {chromium,newCtx,openHash} from './lib.mjs';
const b=await chromium.launch();
const probe=p=>p.evaluate(()=>{const e=document.activeElement;if(!e||e===document.body)return 'body';const s=getComputedStyle(e);return e.tagName+' fv='+e.matches(':focus-visible')+' outline='+s.outlineStyle+' '+s.outlineWidth+' '+s.outlineColor});
for(const [dev,touch] of [['phone-p',true],['ipad-l',false]]){
 const ctx=await newCtx(b,dev,{touch});const p=await ctx.newPage();
 await openHash(p,'/');console.log(dev,touch?'touch':'pointer','| cold load      :',await probe(p));
 await p.getByRole('link',{name:'Paths',exact:true}).first().click();await p.waitForTimeout(1200);console.log(dev,'| tap/click nav   :',await probe(p));
 await p.keyboard.press('Tab');await p.waitForTimeout(100);
 await p.getByRole('link',{name:'Calendar',exact:true}).first().focus();await p.keyboard.press('Enter');await p.waitForTimeout(1200);console.log(dev,'| keyboard nav    :',await probe(p));
 await p.goBack();await p.waitForTimeout(1200);console.log(dev,'| browser back    :',await probe(p));
 await ctx.close();
}
await b.close();
