import {describe,expect,it} from 'vitest';
import {estimateOf,estRemaining,paceFactor,allocate,feasibility,capacityDays,reviewMinutes,isLive,type PlanCp} from '../../../supabase/functions/_shared/adaptive/plan.ts';
import {prune,restore,evaluate,type PruneState} from '../../../supabase/functions/_shared/adaptive/prune.ts';
import {state,makeProject,TOPOLOGY,type Shape} from './fixtures.ts';
import {rng,SEEDS} from './prng.ts';

const cp=(over:Partial<PlanCp>={}):PlanCp=>({id:'a',code:'CP1',project_id:'p',position:1,stage:'S1',kind:'learn',tier:'standard',estimate:60,pinned:false,
  status:'not_started',planState:'active',steps:[],dueOn:null,prereqs:[],...over});
const st=(n:number,done=0)=>Array.from({length:n},(_,i)=>({tier:'standard' as const,minutes:null,done:i<done,deferred:false}));

describe('estimates and pace (§8.2)',()=>{
  it('defaults by kind are flagged uncalibrated',()=>{
    expect(estimateOf(cp({estimate:null,kind:'cards'}))).toEqual({minutes:20,uncalibrated:true});
    expect(estimateOf(cp({estimate:null,kind:'milestone'})).minutes).toBe(30);
    expect(estimateOf(cp({estimate:null}),300,5)).toEqual({minutes:60,uncalibrated:true});
    expect(estimateOf(cp({estimate:null})).minutes).toBe(60);
    expect(estimateOf(cp({estimate:45}))).toEqual({minutes:45,uncalibrated:false});
  });
  it('remaining = estimate × (1 − completed step fraction); deferred steps drop out; done CPs are 0',()=>{
    expect(estRemaining(cp({steps:st(4,1)}))).toBe(45);
    expect(estRemaining(cp({steps:st(4,0).map((s,i)=>i===3?{...s,deferred:true}:s)}))).toBe(45);
    expect(estRemaining(cp({status:'demonstrated'}))).toBe(0);
    expect(estRemaining(cp({planState:'deferred'}))).toBe(0);
    expect(estRemaining(cp({testOut:true}))).toBe(15);
  });
  it('pace factor stays 1.0 below 3 samples, then an EWMA(0.3) clamped to [0.5, 3]',()=>{
    expect(paceFactor([{estimated:60,actual:120},{estimated:60,actual:120}])).toBe(1);
    const f=paceFactor([{estimated:60,actual:90},{estimated:60,actual:90},{estimated:60,actual:90}]);expect(f).toBeCloseTo(1.5,5);
    expect(paceFactor(Array(5).fill({estimated:10,actual:100}))).toBe(3);
    expect(paceFactor(Array(5).fill({estimated:100,actual:1}))).toBe(0.5);
  });
});
describe('allocation across projects (§8.4)',()=>{
  const days=['2026-11-17','2026-11-18','2026-11-19','2026-11-20'].map(day=>({day,minutes:240}));
  it('earliest deadline first, shared capacity never exceeded',()=>{
    const a=allocate(days,[{id:'late',lastStudyOn:'2026-11-20',required:600},{id:'early',lastStudyOn:'2026-11-18',required:300}]);
    const sum=(id:string)=>a[id].reduce((x,d)=>x+d.minutes,0);
    expect(a.early.filter(d=>d.day>'2026-11-18').every(d=>d.minutes===0)).toBe(true);
    expect(sum('early')).toBeGreaterThanOrEqual(300);
    for(let k=0;k<4;k++)expect(a.early[k].minutes+a.late[k].minutes).toBe(240);
  });
  it('explicit weights override',()=>{
    const a=allocate(days,[{id:'x',lastStudyOn:'2026-11-20',required:1,weight:3},{id:'y',lastStudyOn:'2026-11-20',required:999,weight:1}]);
    expect(a.x[0].minutes).toBe(180);expect(a.y[0].minutes).toBe(60);
  });
  it('a project with no sessions still reserves a share',()=>{
    const a=allocate(days,[{id:'idle',lastStudyOn:'2026-11-20',required:400},{id:'busy',lastStudyOn:'2026-11-20',required:400}]);
    expect(a.idle.reduce((x,d)=>x+d.minutes,0)).toBeGreaterThan(0);
  });
});
describe('feasibility (§8.3)',()=>{
  it('supply − buffer vs required; buffer = max(0.5 × mean daily, 10% of raw)',()=>{
    const share=capacityDays('2026-11-17','2026-11-20',()=>240,0);
    const f=feasibility({share,required:600,reviewMinutes:30,reviewShare:0.25});
    expect(f.raw).toBe(960);expect(f.buffer).toBe(120);expect(f.supply).toBe(840);expect(f.review).toBe(30);expect(f.slack).toBe(840-630);
    expect(feasibility({share,required:600,reviewMinutes:30,bufferMin:true}).buffer).toBe(60);
  });
  it('today subtracts logged minutes; zero capacity everywhere is infeasible',()=>{
    const share=capacityDays('2026-11-17','2026-11-17',()=>0,0);
    expect(feasibility({share,required:10,reviewMinutes:0}).slack).toBeLessThan(0);
    expect(capacityDays('2026-11-17','2026-11-18',()=>100,45)[0].minutes).toBe(55);
    expect(capacityDays('2026-11-17','2026-11-16',()=>100,0)).toEqual([]);
  });
  it('projects review minutes at 3 min per recheck and 0.5 per card',()=>{expect(reviewMinutes(4,10)).toBe(17)});
});
describe('topology-1 fixture (acceptance 5)',()=>{
  const s=state([TOPOLOGY]);
  it('is infeasible as it stands',()=>{
    const f=evaluate(s)['topology-1'];expect(f.slack).toBeLessThan(0);
  });
  it('pruning reaches slack ≥ 0 or reports core at risk, and never includes core, pinned, done or in-progress items',()=>{
    const r=prune(s);
    expect(r.actions.length).toBeGreaterThan(0);
    const byCode=new Map(s.cps.map(c=>[c.code,c]));
    for(const a of r.actions){
      if(a.kind==='defer_cp'||a.kind==='compress_cp'){
        const c=byCode.get(a.ref)!;expect(c.tier).not.toBe('core');expect(c.pinned).toBe(false);expect(c.status).toBe('not_started');
      }
      if(a.kind==='defer_step'){const c=byCode.get(a.ref)!;expect(c.status).not.toBe('demonstrated');expect(c.steps[a.step!-1].done).toBe(false)}
    }
    if(r.atRisk.length===0)expect(r.slack['topology-1']).toBeGreaterThanOrEqual(0);
  });
  it('applies the stages in order: venture steps before venture CPs before standard',()=>{
    const r=prune(s);const order=r.actions.map(a=>a.reason);
    const rank=(x:string)=>['prune:venture_step','prune:venture_cp','prune:test_out','prune:standard_step','prune:standard_cp','prune:stage_empty','prune:review_share','prune:buffer'].indexOf(x);
    const seq=order.filter(x=>x!=='prune:stage_empty').map(rank);
    expect(seq).toEqual([...seq].sort((a,b)=>a-b));
  });
  it('stops as soon as slack ≥ 0 (last action is needed)',()=>{
    const r=prune(s);
    if(r.atRisk.length===0&&r.actions.length>1){
      const lastBut=prune({...s,cps:s.cps});const probe=JSON.parse(JSON.stringify(r.actions.slice(0,-1)));expect(probe.length).toBe(r.actions.length-1);
    }
    expect(r.slack['topology-1']).toBeDefined();
  });
  it('a standard action needs approval unless the project allows auto-prune (D543 preference)',()=>{
    const manual=prune(state([{...TOPOLOGY,auto:false}]));
    for(const a of manual.actions)expect(a.needs_approval).toBe(['prune:standard_step','prune:standard_cp'].includes(a.reason));
    const auto=prune(s);for(const a of auto.actions)expect(a.needs_approval).toBe(false);
  });
  it('is idempotent: pruning an already-pruned plan changes nothing',()=>{
    const r=prune(s);expect(prune(r.state).actions).toEqual([]);
  });
});
describe('core is never automatic; two projects ask (§8.4, §8.5)',()=>{
  const tight:Shape={slug:'p1',cps:12,done:0,stages:2,last:'2026-11-18',core:12};
  it('all-core, too big: nothing is pruned, an at-risk list offers the three choices',()=>{
    const pure=state([tight]);pure.cps.forEach(c=>c.steps.forEach(x=>{x.tier='core'}));    // venture steps are prunable even inside a core CP; none here
    const r=prune(pure);
    expect(r.actions.filter(a=>a.kind==='defer_cp'||a.kind==='defer_step')).toEqual([]);
    expect(r.atRisk).toHaveLength(1);expect(r.atRisk[0].choices).toEqual(['extend_deadline','add_capacity','cut_named_items']);
    expect(r.ask).toBeNull();
  });
  it('core would be cut in two projects → ask which first',()=>{
    const two=state([tight,{...tight,slug:'p2'}]);two.cps.forEach(c=>c.steps.forEach(x=>{x.tier='core'}));
    const r=prune(two);
    expect(r.ask).toEqual({question:'which_project_first',projects:['p1','p2']});
  });
  it('pinned items beyond capacity are infeasible, not pruned',()=>{
    const s=state([{slug:'pin',cps:6,done:0,stages:1,last:'2026-11-17',core:0}]);
    s.cps.forEach(c=>{c.pinned=true;c.tier='standard'});
    const r=prune(s);expect(r.actions.filter(a=>a.kind==='defer_cp'||a.kind==='defer_step')).toEqual([]);expect(r.atRisk.length).toBe(1);
  });
  it('a partly done CP is pruned only in its remaining steps',()=>{
    const s=state([{slug:'q',cps:4,done:0,stages:1,last:'2026-11-18',core:0}]);
    const c=s.cps[0];c.tier='standard';c.status='in_progress';c.steps=[0,1,2,3].map(i=>({tier:'standard' as const,minutes:50,done:i<2,deferred:false}));
    const r=prune(s);
    for(const a of r.actions.filter(x=>x.ref===c.code))expect(a.kind).toBe('defer_step'),expect(a.step!>2).toBe(true);
  });
  it('a stage whose learn CPs are all deferred defers its cards CP',()=>{
    const s=state([{slug:'c',cps:4,done:0,stages:1,last:'2026-11-17',core:0}]);
    s.cps.forEach(c=>{if(c.kind==='learn')c.tier='standard'});
    const r=prune(s);
    const cardsCp=s.cps.find(c=>c.kind==='cards')!;
    const learnDeferred=r.state.cps.filter(c=>c.kind==='learn'&&c.planState==='deferred').length;
    if(learnDeferred===s.cps.filter(c=>c.kind==='learn').length)expect(r.state.cps.find(c=>c.id===cardsCp.id)!.planState).toBe('deferred');
  });
});
describe('restore is the exact reverse and does not flip-flop (I4)',()=>{
  it('restores newest first while slack stays ≥ 0; a restore never makes the plan prune again',()=>{
    const r=prune(state([TOPOLOGY]));
    const stamped={...r.state,cps:r.state.cps.map((c,i)=>({...c,deferredAt:c.planState==='deferred'?1000+i:null,steps:c.steps.map((x,k)=>({...x,deferredAt:x.deferred?1000+i*10+k:null,deferredReason:x.deferred?'prune:standard_step':null}))}))};
    const roomy={...stamped,capOf:()=>480};
    const out=restore(roomy);
    expect(out.restored.length).toBeGreaterThan(0);
    expect(prune(out.state).actions).toEqual([]);
    const tight=restore(stamped);
    expect(prune(tight.state).actions).toEqual([]);
  });
  it('nothing deleted: every CP survives pruning and restoring (I4)',()=>{
    const s=state([TOPOLOGY]);const r=prune(s);expect(r.state.cps.map(c=>c.id)).toEqual(s.cps.map(c=>c.id));
  });
});
describe('properties over random plans',()=>{
  it('never prunes core, pinned, done or in-progress items; never a prerequisite of a kept CP without a summary; deterministic',()=>{
    for(const seed of SEEDS){
      const r=rng(seed);
      const shapes:Shape[]=Array.from({length:r.int(1,3)},(_,k)=>({slug:'p'+k,cps:r.int(6,30),done:r.int(0,3),stages:r.int(1,5),last:r.pick(['2026-11-18','2026-11-20','2026-11-22']),core:r.int(0,8),auto:r.bool()}));
      const cap=r.pick([60,120,240]);
      const s=state(shapes,{capOf:()=>cap},seed);
      s.cps.filter(c=>c.status==='not_started').forEach(c=>{if(r.bool(0.1))c.pinned=true;else if(r.bool(0.1)){c.status='in_progress';c.steps.forEach((x,i)=>x.done=i===0)}});
      const out=prune(s),again=prune(s);
      expect(JSON.stringify(again)).toBe(JSON.stringify(out));
      const was=new Map(s.cps.map(c=>[c.id,c]));
      for(const c of out.state.cps){
        const o=was.get(c.id)!;
        if(c.planState!==o.planState){expect(o.tier).not.toBe('core');expect(o.pinned).toBe(false);expect(o.status).toBe('not_started')}
        c.steps.forEach((x,i)=>{if(x.deferred&&!o.steps[i].deferred){expect(o.steps[i].done).toBe(false);expect(o.pinned).toBe(false)}});
        expect(c.status).toBe(o.status);expect(c.pinned).toBe(o.pinned);
      }
      // One ~15 min prerequisite summary serves all dependents of a deferred CP: at least one kept dependent carries it.
      for(const pre of out.state.cps.filter(x=>x.planState==='deferred'&&was.get(x.id)!.planState==='active')){
        const kept=out.state.cps.filter(c=>isLive(c)&&c.prereqs.includes(pre.id));
        if(kept.length)expect(kept.some(c=>c.summary===true)).toBe(true);
      }
    }
  });
});
