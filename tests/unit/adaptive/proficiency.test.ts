import {describe,expect,it} from 'vitest';
import {replayProficiency,calibrationPairs,weights,mean,nEff,meanEff,predict,isLBU,rawSignal,nextMode,scrutinyOrder,nodeCard,CFG,type ProfEvidence} from '../../../supabase/functions/_shared/adaptive/proficiency.ts';
import type {Level,Outcome} from '../../../supabase/functions/_shared/adaptive/recheck.ts';
import {rng,SEEDS} from './prng.ts';

let n=0;
const ev=(p:Partial<ProfEvidence>={}):ProfEvidence=>({id:'e'+(++n),at:Date.parse('2026-11-16T10:00:00Z')+n*1000,day:'2026-11-16',concept_id:'c',level:'use',role:'primary',outcome:'pass',hint_level:0,novelty:'novel',...p});
const cell=(evs:ProfEvidence[],level:Level='use',c='c')=>replayProficiency(evs)[c][level];

describe('weights (§9.2)',()=>{
  it('prior is Beta(1,1): no evidence, mean .5, n_eff 0; evidence on another concept leaves it untouched',()=>{
    const p=replayProficiency([ev({concept_id:'other'})]);
    expect(p.c).toBeUndefined();
    const blank={alpha:1,beta:1,n:0,last:null,used:0};expect(mean(blank)).toBe(0.5);expect(nEff(blank)).toBe(0);
    expect(p.other.use.alpha).toBe(2);expect(p.other.understand).toEqual(blank);
  });
  it('a pass is weighted by hint level: 1, .7, .4, .2, 0 (a level-4 pass is exposure only)',()=>{
    expect([0,1,2,3,4].map(h=>weights(ev({hint_level:h})).a)).toEqual([1,0.7,0.4,0.2,0]);
  });
  it('novelty, self-report, confidence and role multiply; fails count in full on β',()=>{
    expect(weights(ev({novelty:'familiar'})).a).toBe(0.5);expect(weights(ev({novelty:'seen_solution'})).a).toBe(0.2);
    expect(weights(ev({novelty:'self_reported'})).a).toBe(0.2);expect(weights(ev({confidence:0.5})).a).toBe(0.5);
    expect(weights(ev({role:'secondary'})).a).toBe(0.5);expect(weights(ev({role:'used'})).a).toBeCloseTo(0.3);
    expect(weights(ev({outcome:'fail'}))).toEqual({a:0,b:1});expect(weights(ev({outcome:'fail',role:'secondary',confidence:0.5})).b).toBe(0.25);
  });
  it('partial is half of the pass weight on α and 0.5 on β',()=>{
    expect(weights(ev({outcome:'partial',hint_level:1}))).toEqual({a:0.35,b:0.5});
  });
  it('fatigue (> 150 min into a session, or outside the planning window) scales β by .7',()=>{
    expect(weights(ev({outcome:'fail',minutes_into_session:151})).b).toBeCloseTo(0.7);
    expect(weights(ev({outcome:'fail',local_hour:23})).b).toBeCloseTo(0.7);expect(weights(ev({outcome:'fail',local_hour:10,minutes_into_session:60})).b).toBe(1);
    expect(weights(ev({minutes_into_session:200})).a).toBe(1);                       // fatigue never discounts a pass
  });
  it('a teaching exercise is first exposure: half weight on α',()=>{expect(weights(ev({teaches:true})).a).toBe(0.5)});
});
describe('implications are downward only',()=>{
  it('understand → recall ×.5; transfer → use ×.7; use → recall ×.3; nothing upward (use never implies understand)',()=>{
    const p=replayProficiency([ev({level:'understand'})]).c;expect(p.understand.alpha).toBe(2);expect(p.recall.alpha).toBe(1.5);expect(p.use.alpha).toBe(1);
    const t=replayProficiency([ev({level:'transfer'})]).c;expect(t.use.alpha).toBeCloseTo(1.7);expect(t.understand.alpha).toBe(1);
    const u=replayProficiency([ev({level:'use'})]).c;expect(u.recall.alpha).toBeCloseTo(1.3);expect(u.understand.alpha).toBe(1);expect(u.transfer.alpha).toBe(1);
  });
  it('a fail implies nothing',()=>{const p=replayProficiency([ev({level:'understand',outcome:'fail'})]).c;expect(p.recall.beta).toBe(1);expect(p.recall.alpha).toBe(1)});
  it('role "used" feeds only the use level and counts toward load-bearing use',()=>{
    const p=replayProficiency([ev({role:'used',level:'use'}),ev({role:'used',level:'understand'})]).c;
    expect(p.use.used).toBe(1);expect(p.use.alpha).toBeCloseTo(1.3);expect(p.understand.n).toBe(0);
  });
});
describe('repeats and forgetting',()=>{
  it('the same item fingerprint within 30 days is familiar, in any subject; after 31 days it is novel again',()=>{
    const day=86400000,t0=Date.parse('2026-10-01T10:00:00Z');
    const a=replayProficiency([ev({at:t0,fingerprint:'f1',concept_id:'x'}),ev({at:t0+10*day,fingerprint:'f1',concept_id:'y'})]);
    expect(a.y.use.alpha).toBeCloseTo(1.5);
    const b=replayProficiency([ev({at:t0,fingerprint:'f1',concept_id:'x'}),ev({at:t0+31*day,fingerprint:'f1',concept_id:'y'})]);
    expect(b.y.use.alpha).toBe(2);
  });
  it('mean_eff pulls toward .5 as retrievability falls; n_eff is α+β−2',()=>{
    const c=cell([ev(),ev(),ev()]);expect(nEff(c)).toBe(3);
    expect(meanEff(c,1)).toBe(mean(c));expect(meanEff(c,0)).toBe(0.5);expect(meanEff(c,0.5)).toBeCloseTo(0.5*mean(c)+0.25);
  });
  it('predicted success is σ(logit(mean_eff) − b), the minimum over concepts',()=>{
    const hi=cell(Array.from({length:8},()=>ev())),lo=cell([ev({outcome:'fail'}),ev({outcome:'fail'})]);
    expect(predict([{cell:hi}],0)).toBeCloseTo(mean(hi),5);
    expect(predict([{cell:hi},{cell:lo}],0)).toBeCloseTo(mean(lo),5);
    expect(predict([{cell:hi}],1)).toBeLessThan(predict([{cell:hi}],-1));expect(predict([],0)).toBe(0.5);
  });
});
describe('load-bearing but unexamined (§9.4)',()=>{
  it('flagged at 5 uses and no understand evidence; examining it clears the flag',()=>{
    const used=Array.from({length:5},()=>ev({role:'used'}));
    expect(isLBU(replayProficiency(used).c)).toBe(true);
    expect(isLBU(replayProficiency(used.slice(0,4)).c)).toBe(false);
    expect(isLBU(replayProficiency([...used,ev({level:'understand'}),ev({level:'understand'})]).c)).toBe(false);
  });
});
describe('modes with hysteresis (§9.3)',()=>{
  const strong=replayProficiency(Array.from({length:6},()=>ev({level:'understand'})));
  const base={criterionLevel:'understand' as Level,primary:[{id:'c',core:false}],prof:strong,criterionB:0,fails:{},maxHint:{}};
  it('fast-track needs p ≥ .85 and n_eff ≥ 2 on the criterion level; one signal is not enough',()=>{
    expect(rawSignal(base)).toBe('up');
    let s=nextMode({mode:'normal',up:0,down:0},'up');expect(s.mode).toBe('normal');
    s=nextMode(s,'up');expect(s.mode).toBe('fast_track');
    expect(nextMode({mode:'normal',up:1,down:0},'hold').up).toBe(0);                        // an inconsistent signal resets
  });
  it('little evidence never fast-tracks',()=>{expect(rawSignal({...base,prof:replayProficiency([ev({level:'understand'})])})).toBe('hold')});
  it('a core checkpoint also needs understand on its star concept',()=>{
    const useOnly=replayProficiency(Array.from({length:8},()=>ev({level:'use'})));
    expect(rawSignal({...base,criterionLevel:'use',primary:[{id:'c',core:true,star:true}],prof:useOnly})).toBe('hold');
    expect(rawSignal({...base,criterionLevel:'use',primary:[{id:'c',core:false}],prof:useOnly})).toBe('up');
  });
  it('scrutiny on 2 fails or hint ≥ 3 on one concept, or p < .5 at the start; down needs 2 signals',()=>{
    expect(rawSignal({...base,fails:{c:2}})).toBe('down');expect(rawSignal({...base,maxHint:{c:3}})).toBe('down');expect(rawSignal({...base,fails:{c:1}})).toBe('up');
    expect(rawSignal({...base,pAtStart:0.4})).toBe('down');
    let s=nextMode({mode:'normal',up:0,down:0},'down');expect(s.mode).toBe('normal');s=nextMode(s,'down');expect(s.mode).toBe('scrutiny');
    expect(nextMode({mode:'scrutiny',up:1,down:0},'up').mode).toBe('normal');expect(nextMode({mode:'fast_track',up:0,down:1},'down').mode).toBe('normal');
  });
  it('scrutiny probes prerequisites at most 2 deep, weakest first',()=>{
    const prof=replayProficiency([ev({concept_id:'a'}),ev({concept_id:'a'}),ev({concept_id:'a'}),ev({concept_id:'b',outcome:'fail'}),ev({concept_id:'c'})]);
    const pre=new Map([['x',['a','b']],['a',['c']],['c',['deep']],['b',[]]]);
    const order=scrutinyOrder('x',pre,prof,'use');
    expect(order[0]).toBe('b');expect(order).toContain('c');expect(order).not.toContain('deep');
  });
});
describe('node card (§11.1)',()=>{
  it('is compact and within ~100 tokens',()=>{
    const p=replayProficiency([ev(),ev({level:'understand',outcome:'fail'})]).c;
    const card=nodeCard({name:'Compactness',prof:p,seen:'2026-11-16',gaps:['fin-subcover-quantifiers'],lbu:true});
    expect(card).toMatch(/^Compactness R\.\d+±\.\d+ Us\.\d+±\.\d+ Un\.\d+±\.\d+ T- gaps:\[fin-subcover-quantifiers\] assume:\[\] seen:2026-11-16 flags:\[LBU\]$/);
    expect(Math.ceil(card.length/3)).toBeLessThanOrEqual(100);
    expect(nodeCard({name:'New',prof:undefined})).toContain('R- Us- Un- T-');
  });
});
describe('purity and undo (I3, I7)',()=>{
  const shapes=(seed:number)=>{const r=rng(seed);return Array.from({length:r.int(2,25)},()=>ev({concept_id:r.pick(['a','b','c']),level:r.pick<Level>(['recall','use','understand','transfer']),
    outcome:r.pick<Outcome>(['pass','pass','partial','fail']),hint_level:r.int(0,4),novelty:r.pick(['novel','familiar','seen_solution'] as const),role:r.pick(['primary','secondary','used'] as const),
    fingerprint:r.bool(0.3)?r.pick(['f1','f2']):null,confidence:r.pick([1,0.7,0.5])}))};
  it('shuffled input gives identical bytes; voiding the last row equals never having it',()=>{
    for(const seed of SEEDS){
      const evs=shapes(seed);const r=rng(seed+3);
      expect(JSON.stringify(replayProficiency(r.shuffle(evs)))).toBe(JSON.stringify(replayProficiency(evs)));
      const ordered=[...evs].sort((a,b)=>a.at-b.at);
      expect(JSON.stringify(replayProficiency(ordered.map((e,i)=>i===ordered.length-1?{...e,voided:true}:e)))).toBe(JSON.stringify(replayProficiency(ordered.slice(0,-1))));
    }
  });
  it('evidence without a concept changes nothing, and weights are never negative',()=>{
    for(const seed of SEEDS){const p=replayProficiency([...shapes(seed),ev({concept_id:null})]);
      for(const row of Object.values(p))for(const c of Object.values(row)){expect(c.alpha).toBeGreaterThanOrEqual(1);expect(c.beta).toBeGreaterThanOrEqual(1)}}
  });
  it('default config is the spec',()=>{expect(CFG.hint).toEqual([1,0.7,0.4,0.2,0]);expect(CFG.repeatDays).toBe(30)});
});
describe('calibration pairs',()=>{
  it('predicts each attempt before counting it; the first attempt on a concept is not a prediction',()=>{
    const evs=[ev(),ev(),ev({outcome:'fail'})];
    const pairs=calibrationPairs(evs);
    expect(pairs.map(x=>x.y)).toEqual([1,0]);
    expect(pairs[0].p).toBeGreaterThan(0.5);expect(pairs[1].p).toBeGreaterThan(pairs[0].p);          // a fail after two passes was a confident miss
  });
  it('is deterministic and skips role "used" and self-reports',()=>{
    for(const seed of SEEDS.slice(0,10)){const r=rng(seed);
      const evs=Array.from({length:12},()=>ev({outcome:r.pick<Outcome>(['pass','fail']),role:r.pick(['primary','used'] as const),novelty:r.pick(['novel','self_reported'] as const)}));
      expect(JSON.stringify(calibrationPairs(r.shuffle(evs)))).toBe(JSON.stringify(calibrationPairs(evs)));
      expect(calibrationPairs(evs).length).toBeLessThanOrEqual(evs.filter(e=>e.role==='primary'&&e.novelty==='novel').length);
    }
  });
});
