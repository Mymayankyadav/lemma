// A reduced stand-in for the 2026-11-17 production shape (codes, tiers, counts only; no study text).
import type {PlanCp,PlanProject,Step,Tier,CpKind} from '../../../supabase/functions/_shared/adaptive/plan.ts';
import type {PruneState} from '../../../supabase/functions/_shared/adaptive/prune.ts';
import {rng} from './prng.ts';

export type Shape={slug:string;cps:number;done:number;stages:number;last:string;core?:number;auto?:boolean};
export function makeProject(shape:Shape,seed=1):{project:PlanProject;cps:PlanCp[]}{
  const r=rng(seed);const id=shape.slug;
  const cps:PlanCp[]=[];
  const per=Math.ceil(shape.cps/shape.stages);
  for(let i=0;i<shape.cps;i++){
    const stage='S'+(Math.floor(i/per)+1);
    const isCards=(i%per)===per-1&&shape.stages>0;
    const kind:CpKind=isCards?'cards':'learn';
    const tier:Tier=isCards?'standard':i<(shape.core??6)?'core':r.pick<Tier>(['standard','standard','standard','venture']);
    const n=r.int(3,5);
    const steps:Step[]=Array.from({length:n},(_,k)=>({tier:k===n-1&&r.bool(0.4)?'venture':(tier==='venture'?'venture':'standard'),minutes:null,done:false,deferred:false}));
    const done=i<shape.done;
    cps.push({id:id+'-'+(i+1),code:'CP'+(i+1),project_id:id,position:i+1,stage,kind,tier,estimate:kind==='cards'?20:r.pick([45,60,75,90]),
      pinned:false,status:done?'demonstrated':'not_started',planState:'active',steps:steps.map(s=>({...s,done})),dueOn:null,
      prereqs:i>0&&!isCards&&r.bool(0.5)?[id+'-'+r.int(Math.max(1,i-3),i)].filter(x=>!cps.find(c=>c.id===x&&c.kind==='cards')):[]});
  }
  return {project:{id,slug:shape.slug,lastStudyOn:shape.last,autoPrune:shape.auto??true,paceSamples:[],reviewMinutes:0},cps};
}
export const TOPOLOGY:Shape={slug:'topology-1',cps:39,done:3,stages:6,last:'2026-11-20',core:8,auto:true};
export function state(shapes:Shape[],over:Partial<PruneState>={},seed=1):PruneState{
  const ps=shapes.map((s,k)=>makeProject(s,seed+k));
  return {today:'2026-11-17',projects:ps.map(p=>p.project),cps:ps.flatMap(p=>p.cps),capOf:()=>240,usedToday:0,reviewShare:0.25,bufferMin:false,...over};
}
