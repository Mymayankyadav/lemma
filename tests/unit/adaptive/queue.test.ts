import {describe,expect,it} from 'vitest';
import {buildQueue,interleave,renderQueue,type QueueInput,type ReviewItem} from '../../../supabase/functions/_shared/adaptive/queue.ts';
import type {PlanCp,PlanProject} from '../../../supabase/functions/_shared/adaptive/plan.ts';
import {rng,SEEDS} from './prng.ts';

const rv=(ref:string,classId:string,over:Partial<ReviewItem>={}):ReviewItem=>({type:'recheck',ref,classId,system:'S1',minutes:3,retrievability:0.5,importance:1,prereqOfToday:false,...over});
const cp=(n:number,over:Partial<PlanCp>={}):PlanCp=>({id:'c'+n,code:'CP'+n,project_id:'p',position:n,stage:'S1',kind:'learn',tier:'standard',estimate:60,pinned:false,
  status:'not_started',planState:'active',steps:[1,2].map(()=>({tier:'standard' as const,minutes:null,done:false,deferred:false})),dueOn:null,prereqs:[],...over});
const P:PlanProject={id:'p',slug:'p',lastStudyOn:'2026-11-20',autoPrune:false,paceSamples:[],reviewMinutes:0};
const base=(over:Partial<QueueInput>={}):QueueInput=>({today:'2026-11-17',mode:'normal',capacity:180,configured:true,used:0,reviewShare:0.25,reviewBudgetMinutes:20,
  reviews:[],projects:[P],cps:[cp(1,{status:'in_progress'}),cp(2),cp(3)],nextStudyDays:['2026-11-18','2026-11-19','2026-11-20'],...over});

describe('review budget and order (§8.1)',()=>{
  it('R = min(due, max(share × capacity, review_budget.minutes)); minutes is a floor, not a cap',()=>{
    const reviews=Array.from({length:20},(_,i)=>rv('r'+i,'k'+i));         // 60 min due
    const q=buildQueue(base({reviews}));
    expect(q.minutes.review).toBe(45);                                   // max(0.25×180=45, 20) = 45
    const small=buildQueue(base({reviews,capacity:60}));
    expect(small.minutes.review).toBe(18);                               // share alone would allow 15; the 20-minute floor admits six 3-minute items
  });
  it('mandatory prerequisite rechecks come first and may exceed R',()=>{
    const reviews=[...Array.from({length:30},(_,i)=>rv('r'+i,'k'+i)),...[1,2,3].map(i=>rv('m'+i,'z'+i,{prereqOfToday:true,minutes:10}))];
    const q=buildQueue(base({reviews}));
    expect(q.items.filter(x=>x.reason_code==='mandatory_prereq')).toHaveLength(3);
    expect(q.minutes.review).toBeGreaterThanOrEqual(30);
  });
  it('orders by (1−R)×importance×(prereq?2:1); no two consecutive on one concept class',()=>{
    const order=interleave([rv('a','x',{retrievability:0.1}),rv('b','x',{retrievability:0.2}),rv('c','y',{retrievability:0.9}),rv('d','z',{retrievability:0.5})]);
    expect(order.map(x=>x.ref)[0]).toBe('a');
    for(let i=1;i<order.length;i++)expect(order[i].classId===order[i-1].classId&&order.some(o=>o.classId!==order[i].classId&&!order.slice(0,i).includes(o))).toBe(false);
    expect(order.map(x=>x.ref)).toEqual(['a','d','b','c']);
  });
  it('alternates systems where possible',()=>{
    const o=interleave([rv('a','a',{system:'S1',retrievability:0.1}),rv('b','b',{system:'S1',retrievability:0.2}),rv('c','c',{system:'S2',retrievability:0.3})]);
    expect(o.map(x=>x.system)).toEqual(['S1','S2','S1']);
  });
  it('overflow after a long absence is spread over the next 3 study days, never piled on one',()=>{
    const reviews=Array.from({length:60},(_,i)=>rv('r'+i,'k'+i));
    const q=buildQueue(base({reviews}));
    const counts=Object.values(q.overflow);
    expect(counts).toHaveLength(3);expect(Math.max(...counts)-Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(counts.reduce((a,b)=>a+b,0)).toBe(60-q.items.filter(x=>x.reason_code==='due_review').length);
  });
});
describe('learning fill and modes',()=>{
  it('fills the learning budget with the current CP\'s steps first, then the next CP; the rest is the "if time permits" tail',()=>{
    const q=buildQueue(base({capacity:90,reviewBudgetMinutes:0}));
    const steps=q.items.filter(x=>x.type==='step').map(x=>x.ref);
    expect(steps[0]).toBe('CP1#1');expect(steps).toContain('CP1#2');
    expect(q.items.reduce((a,x)=>a+x.est_minutes,0)).toBeLessThanOrEqual(90);
    expect(q.tail.length).toBeGreaterThan(0);
  });
  it('prerequisites block starting, not completing: a CP waits for its unfinished prerequisite',()=>{
    const q=buildQueue(base({cps:[cp(1),cp(2,{prereqs:['c1']})],capacity:600}));
    expect(q.items.some(x=>x.ref.startsWith('CP2'))).toBe(false);
  });
  it('a partly done CP offers only its remaining steps',()=>{
    const c=cp(1,{status:'in_progress',steps:[{tier:'standard',minutes:30,done:true,deferred:false},{tier:'standard',minutes:30,done:false,deferred:false}]});
    expect(buildQueue(base({cps:[c]})).items.map(x=>x.ref)).toEqual(['CP1#2']);
  });
  it('deadline today: only reviews and pinned items; deadline passed: nothing; no capacity: flagged',()=>{
    const reviews=[rv('r1','k1')];
    const d=buildQueue(base({mode:'deadline_today',reviews,cps:[cp(1),cp(2,{pinned:true})]}));
    expect(d.items.map(x=>x.ref)).toEqual(['r1','CP2#1','CP2#2']);
    expect(buildQueue(base({mode:'post_deadline',reviews})).items).toEqual([]);
    expect(buildQueue(base({mode:'post_deadline'})).flags).toContain('post_deadline');
    const z=buildQueue(base({capacity:0,reviews}));expect(z.flags).toContain('zero_capacity');expect(z.items.filter(x=>x.type==='step')).toEqual([]);
    expect(buildQueue(base({configured:false,capacity:0})).flags).toContain('capacity_unset');
  });
  it('absence of more than 3 study days starts with a re-entry probe of at most 3 prerequisite concepts',()=>{
    const q=buildQueue(base({absentDays:5,probeConcepts:['a','b','c','d']}));
    expect(q.items.slice(0,3).map(x=>x.type)).toEqual(['probe','probe','probe']);expect(q.items.filter(x=>x.type==='probe')).toHaveLength(3);
    expect(buildQueue(base({absentDays:3,probeConcepts:['a']})).items.some(x=>x.type==='probe')).toBe(false);
  });
  it('time already logged today shrinks what is available',()=>{
    expect(buildQueue(base({used:170})).minutes.available).toBe(10);
  });
  it('renders the top 8 then "+N more"',()=>{
    const reviews=Array.from({length:14},(_,i)=>rv('r'+i,'k'+i,{minutes:2}));
    const t=renderQueue(buildQueue(base({reviews,capacity:600})));
    expect(t.split('\n').filter(l=>/^\d+ /.test(l))).toHaveLength(8);expect(t).toMatch(/\+\d+ more/);
  });
});
describe('queue refs name their project when several are active',()=>{
  it('one project keeps bare codes; two projects prefix the slug so CP1 is never ambiguous',()=>{
    const one=buildQueue(base({cps:[cp(1,{status:'in_progress'})]}));
    expect(one.items.map(x=>x.ref)).toContain('CP1#1');
    const Q:PlanProject={...P,id:'q',slug:'quark'};
    const two=buildQueue(base({projects:[P,Q],capacity:600,cps:[cp(1,{status:'in_progress'}),{...cp(1,{status:'in_progress'}),id:'cq1',project_id:'q'}]}));
    const refs=two.items.map(x=>x.ref);
    expect(refs).toContain('p/CP1#1');expect(refs).toContain('quark/CP1#1');expect(new Set(refs).size).toBe(refs.length);
  });
});
describe('byte-identical output (I3)',()=>{
  it('shuffled inputs give identical bytes at a fixed capacity',()=>{
    for(const seed of SEEDS){
      const r=rng(seed);
      const reviews=Array.from({length:r.int(0,25)},(_,i)=>rv('r'+i,'k'+r.int(0,6),{retrievability:r.next(),importance:1+r.int(0,2),system:r.pick(['S1','S2',null]),prereqOfToday:r.bool(0.1)}));
      const cps=Array.from({length:r.int(1,12)},(_,i)=>cp(i+1,{status:i===0&&r.bool()?'in_progress':'not_started'}));
      const cap=r.pick([60,180,300]);
      const a=JSON.stringify(buildQueue(base({reviews,cps,capacity:cap})));
      expect(JSON.stringify(buildQueue(base({reviews:r.shuffle(reviews),cps:r.shuffle(cps),capacity:cap})))).toBe(a);
    }
  });
});
