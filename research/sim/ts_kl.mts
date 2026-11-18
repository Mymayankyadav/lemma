// Scores the TypeScript core on the harness's own streams (export_stream.py): mean KL to the oracle probability per learner.
//   node --experimental-strip-types research/sim/ts_kl.mts stream_W1_2000.json ... > ts_kl.json
// `research` is replay in research mode (it must equal the Python KF); `prod` is the shipped model. Items carry b_sd = 0, as the harness has no item uncertainty.
import {readFileSync} from 'node:fs';
import {replay} from '../../supabase/functions/_shared/adaptive/measure.ts';
const DAY=86400000,iso=(d:number)=>new Date(Math.round(d*DAY)).toISOString(),pad=(n:number)=>String(n).padStart(6,'0');
const kl=(p:number,q:number)=>{p=Math.min(1-1e-4,Math.max(1e-4,p));q=Math.min(1-1e-4,Math.max(1e-4,q));return p*Math.log(p/q)+(1-p)*Math.log((1-p)/(1-q));};
const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
function facts(run:any):any{
 const nsys=Math.max(...run.sys)+1,concepts:any[]=[...Array.from({length:nsys},(_,s)=>({id:'sys'+s,name:'S'+s,kind:'topic',level:'system'})),...Array.from({length:run.K},(_,k)=>({id:'k'+k,name:'K'+k,kind:'topic',parent_id:'sys'+run.sys[k]}))];
 const instructions:any[]=[],attempts:any[]=[],sessions:any[]=[],items:any[]=[],reviews:any[]=[];
 run.events.forEach((e:any,i:number)=>{
  if(e.kind==='teach')instructions.push({id:pad(i),concept_id:'k'+e.k,occurred_at:iso(e.t)});
  else if(e.kind==='attempt'){const ok=e.y?'ok':'fail',tag=(k:number,role:string)=>({concept_id:'k'+k,facet:'use',role,stage:'E',result:ok,hint_level:0});
   sessions.push({id:'s'+i,started_at:new Date(Math.round(e.t*DAY-e.fat*3600000)).toISOString()});items.push({id:'i'+i,b:e.b,b_sd:0});
   attempts.push({id:pad(i),occurred_at:iso(e.t),session_id:'s'+i,item_id:'i'+i,item_kind:'practice',tags:[tag(e.k,'target'),...run.pre[e.k].map((j:number)=>tag(j,'required'))]});}
  else reviews.push({id:pad(i),occurred_at:iso(e.t),card_id:'card'+e.c,rating:e.y?3:1});
 });
 return {concepts,instructions,attempts,sessions,items,reviews,cards:run.cards.map((c:any)=>({id:'card'+c.c,concept_id:'k'+c.k}))};
}
const out:Record<string,{seed:number[];prod:number[];research:number[]}>={};
for(const file of process.argv.slice(2).sort()){
 const run=JSON.parse(readFileSync(file,'utf8')),att=run.events.filter((e:any)=>e.kind==='attempt'),f=facts(run);
 const prod=replay(f).trace.filter(x=>x.stream==='attempt'),research=replay(f,{},undefined,{research:true}).trace.filter(x=>x.stream==='attempt');
 const w=(out[run.world]??={seed:[],prod:[],research:[]});w.seed.push(run.seed);w.prod.push(mean(prod.map((x,i)=>kl(att[i].p,x.kf))));w.research.push(mean(research.map((x,i)=>kl(att[i].p,x.kf))));
}
console.log(JSON.stringify(out));
