import {describe,expect,it} from 'vitest';
import {replayRechecks,validPrompt,promptFor,dueRechecks,retrievabilityOf,type Evidence,type Level,type Outcome,type ClassInfo,type RecheckInput} from '../../../supabase/functions/_shared/adaptive/recheck.ts';
import {addDays} from '../../../supabase/functions/_shared/adaptive/dates.ts';
import {rng,SEEDS} from './prng.ts';

let n=0;
const DAY0='2026-11-16';
const at=(day:string,h=10)=>Date.parse(day+'T'+String(h).padStart(2,'0')+':00:00Z');
function ev(p:Partial<Evidence>&{day?:string}):Evidence{
  const day=p.day??DAY0;
  return {id:'e'+(++n),at:at(day,p.at?0:10)+(p.at??0),day,session_id:'S1',concept_id:'compact',level:'use',role:'primary',
    outcome:'pass',hint_level:0,novelty:'novel',kind:'attempt',...p} as Evidence;
}
const base=(over:Partial<RecheckInput>={}):RecheckInput=>({evidence:[],triggers:[],decisions:[],
  classes:{compact:{name:'compactness',core:false,lastStudyOn:'2026-11-22',active:true},hausdorff:{name:'Hausdorff',core:true,lastStudyOn:'2026-11-22',active:true}},...over});
const run=(evidence:Evidence[],over:Partial<RecheckInput>={})=>replayRechecks(base({evidence,...over}));

describe('what creates a recheck (§7)',()=>{
  it('a clean hint-0 pass, and completing work, create zero rechecks (acceptance 2)',()=>{
    const r=run([ev({outcome:'pass',kind:'evidence'}),ev({outcome:'pass',level:'understand',kind:'attempt'})]);
    expect(r.rechecks).toEqual([]);
  });
  it('T1: fail then pass on the same (concept, level) in one session → exactly one recheck, due ≥ next study day (I5)',()=>{
    const r=run([ev({outcome:'fail'}),ev({outcome:'pass',day:DAY0})]);
    expect(r.rechecks).toHaveLength(1);
    const x=r.rechecks[0];
    expect(x.origin_codes).toEqual(['T1']);expect(x.state).toBe('open');
    expect(x.due!>=addDays(DAY0,1)).toBe(true);expect(x.due).not.toBe(DAY0);
    expect(validPrompt(x.prompt)).toBe(true);
  });
  it('T1 needs the same session and the same level',()=>{
    expect(run([ev({outcome:'fail',session_id:'A'}),ev({outcome:'pass',session_id:'B'})]).rechecks).toEqual([]);
    expect(run([ev({outcome:'fail',level:'use'}),ev({outcome:'pass',level:'recall'})]).rechecks).toEqual([]);
  });
  it('T2: a pass that needed hint ≥ 2 is graded Hard; hint 1 is not a trigger',()=>{
    expect(run([ev({hint_level:1})]).rechecks).toEqual([]);
    const r=run([ev({hint_level:2})]);expect(r.rechecks).toHaveLength(1);expect(r.rechecks[0].origin_codes).toEqual(['T2']);
    expect(r.rechecks[0].lapses).toBe(0);
  });
  it('T3: failed or partial end-of-session recall; none from an abandoned session',()=>{
    expect(run([ev({kind:'recall',outcome:'fail'})]).rechecks[0].origin_codes).toEqual(['T3']);
    expect(run([ev({kind:'recall',outcome:'partial'})]).rechecks[0].lapses).toBe(0);
    expect(run([ev({kind:'recall',outcome:'pass'})]).rechecks).toEqual([]);
    expect(run([ev({kind:'recall',outcome:'fail',session_id:'AB'})],{abandonedSessions:['AB']}).rechecks).toEqual([]);
  });
  it('T4 and T5 triggers create an understand-level recheck graded Again',()=>{
    const t=(code:'T4'|'T5')=>run([],{triggers:[{id:'m1',at:at(DAY0),day:DAY0,code,concept_id:'compact'}]}).rechecks[0];
    expect(t('T4').level).toBe('understand');expect(t('T4').lapses).toBe(1);expect(t('T5').origin_codes).toEqual(['T5']);
  });
  it('self-reported evidence and role "used" are never evidence; missing concept is listed, not dropped',()=>{
    expect(run([ev({novelty:'self_reported',outcome:'fail'}),ev({novelty:'self_reported',outcome:'pass'})]).rechecks).toEqual([]);
    expect(run([ev({role:'used',hint_level:3})]).rechecks).toEqual([]);
    const r=run([ev({concept_id:null,hint_level:3,id:'orphan'})]);
    expect(r.rechecks).toEqual([]);expect(r.unresolved).toEqual(['orphan']);
  });
  it('prompts are concrete: a generic "Recheck CPn" is invalid',()=>{
    expect(validPrompt('Recheck CP2: Equivalence relations…')).toBe(false);
    expect(validPrompt('recheck cp10')).toBe(false);
    for(const l of ['recall','use','understand','transfer'] as Level[])expect(validPrompt(promptFor('compactness',l))).toBe(true);
  });
});

describe('deduplication and states',()=>{
  it('a trigger on an open recheck merges: one open per (class, level), due = min, origins appended',()=>{
    const r=run([ev({hint_level:3}),ev({hint_level:2,day:'2026-11-17'})]);
    expect(r.rechecks).toHaveLength(1);
    expect(r.rechecks[0].origin_evidence_ids).toHaveLength(2);expect(r.rechecks[0].merge_log).toHaveLength(1);
    expect(r.rechecks[0].due!<=addDays('2026-11-17',2)).toBe(true);
  });
  it('different levels are different rechecks',()=>{
    const r=run([ev({hint_level:3,level:'use'}),ev({hint_level:3,level:'understand'})]);
    expect(r.rechecks.map(x=>x.level)).toEqual(['use','understand']);
  });
  it('two passes in a row retire; one pass ≥ 3 days after creation retires',()=>{
    const open=ev({hint_level:3,day:'2026-11-16'});
    const a=run([open,ev({kind:'recheck',day:'2026-11-17'}),ev({kind:'recheck',day:'2026-11-18'})]).rechecks[0];
    expect(a.state).toBe('retired');expect(a.close_reason).toBe('passed');
    const b=run([open,ev({kind:'recheck',day:'2026-11-19'})]).rechecks[0];
    expect(b.state).toBe('retired');
    const c=run([open,ev({kind:'recheck',day:'2026-11-17'})]).rechecks[0];
    expect(c.state).toBe('open');expect(c.due!>='2026-11-18').toBe(true);                   // one early pass reschedules with Good
  });
  it('partial → Hard (stays open), fail → Again with fail_count',()=>{
    const open=ev({hint_level:3});
    const p=run([open,ev({kind:'recheck',outcome:'partial',day:'2026-11-17'})]).rechecks[0];
    expect(p.state).toBe('open');expect(p.fail_count).toBe(0);expect(p.pass_streak).toBe(0);
    const f=run([open,ev({kind:'recheck',outcome:'fail',day:'2026-11-17'})]).rechecks[0];
    expect(f.fail_count).toBe(1);expect(f.lapses).toBe(1);
  });
  it('a later hint-0 novel pass elsewhere at the same or a higher level counts as a pass and can close it (superseded)',()=>{
    const open=ev({hint_level:3,day:'2026-11-16',level:'use'});
    const r=run([open,ev({level:'understand',day:'2026-11-20',kind:'attempt'})]).rechecks[0];
    expect(r.state).toBe('superseded');
    const lower=run([ev({hint_level:3,level:'understand'}),ev({level:'use',day:'2026-11-20'})]).rechecks[0];
    expect(lower.state).toBe('open');                                                          // nothing implies upward
    const familiar=run([open,ev({level:'use',day:'2026-11-20',novelty:'familiar'})]).rechecks[0];
    expect(familiar.state).toBe('open');
  });
  it('4 fails escalate and pause until a remediation step; no infinite loops',()=>{
    const evs=[ev({hint_level:3,day:'2026-11-16'})];
    for(let i=0;i<4;i++)evs.push(ev({kind:'recheck',outcome:'fail',day:addDays('2026-11-17',i)}));
    const r=run(evs);
    expect(r.rechecks[0].state).toBe('escalated');expect(r.escalations).toEqual([{class_id:'compact',level:'use',fail_count:4}]);
    const frozen=run([...evs,ev({kind:'recheck',outcome:'pass',day:'2026-11-25'})]);
    expect(frozen.rechecks[0].state).toBe('escalated');
    const fixed=run(evs,{decisions:[{id:'d1',at:at('2026-11-21'),day:'2026-11-21',concept_id:'compact',level:'use',action:'remediation'}]});
    expect(fixed.rechecks[0].state).toBe('open');expect(fixed.rechecks[0].fail_count).toBe(0);
    const late=run(evs,{decisions:[{id:'d2',at:at('2026-11-22'),day:'2026-11-22',concept_id:'compact',level:'use',action:'remediation'}]});
    expect(late.rechecks[0].close_reason).toBe('beyond_deadline');                 // the next day is already past the last study day
  });
  it('converted to a card closes it; rate_easy makes the next pass Easy (longer interval)',()=>{
    const open=ev({hint_level:3});
    const conv=run([open],{decisions:[{id:'d',at:at('2026-11-17'),day:'2026-11-17',concept_id:'compact',level:'use',action:'convert_card'}]}).rechecks[0];
    expect(conv.state).toBe('converted');
    const good=run([open,ev({kind:'recheck',day:'2026-11-17'})]).rechecks[0];
    const easy=run([open,ev({kind:'recheck',day:'2026-11-17'})],{decisions:[{id:'d',at:at('2026-11-17',9),day:'2026-11-17',concept_id:'compact',level:'use',action:'rate_easy'}]}).rechecks[0];
    expect(easy.stability).toBeGreaterThan(good.stability);
  });
  it('expired while every linked checkpoint is deferred, and it reopens when they are restored',()=>{
    const evs=[ev({hint_level:3})];
    const off=run(evs,{classes:{compact:{name:'compactness',core:false,lastStudyOn:'2026-11-22',active:false}}});
    expect(off.rechecks[0].state).toBe('expired');
    expect(run(evs).rechecks[0].state).toBe('open');
  });
});

describe('FSRS clamp against the deadline (§7)',()=>{
  const cls=(core:boolean,last:string|null):Record<string,ClassInfo>=>({compact:{name:'compactness',core,lastStudyOn:last,active:true}});
  it('non-core: past last_study_on retires with beyond_deadline; core keeps one check in the buffer ≤ last_study_on − 1',()=>{
    const evs=[ev({hint_level:3,day:'2026-11-16'})];
    const non=run(evs,{classes:cls(false,'2026-11-16')}).rechecks[0];     // next day is already past
    expect(non.state).toBe('retired');expect(non.close_reason).toBe('beyond_deadline');
    const farNon=run(evs,{classes:cls(false,'2026-11-16')}).rechecks[0];expect(farNon.due).toBeNull();
    const core=run([ev({kind:'recall',outcome:'fail',day:'2026-11-16'}),ev({kind:'recheck',day:'2026-11-17'}),ev({kind:'recheck',outcome:'partial',day:'2026-11-18'})],{classes:cls(true,'2026-11-22')}).rechecks[0];
    expect(core.due!<='2026-11-21').toBe(true);expect(core.due!>='2026-11-19').toBe(true);
  });
  it('never due the same study day as its evidence (I5), over many shapes',()=>{
    for(const seed of SEEDS){
      const r=rng(seed);
      const evs:Evidence[]=[];
      for(let i=0;i<r.int(2,12);i++)evs.push(ev({day:addDays('2026-11-10',r.int(0,10)),outcome:r.pick<Outcome>(['pass','pass','partial','fail']),hint_level:r.int(0,4),
        level:r.pick<Level>(['recall','use','understand','transfer']),kind:r.pick(['attempt','recall','recheck'] as const),novelty:r.pick(['novel','familiar'] as const),session_id:r.pick(['A','B'])}));
      const out=run(evs,{classes:cls(r.bool(),r.pick(['2026-11-20','2026-11-22',null]))});
      for(const x of out.rechecks){
        if(x.state==='open'){expect(x.due).not.toBeNull();expect(x.due!>addDays(x.last_review,0)).toBe(true)}
        if(x.due&&cls(false,null).compact.lastStudyOn===null&&x.state==='open')expect(x.due>=addDays(x.created_day,1)).toBe(true);
      }
    }
  });
});

describe('purity: order independence, undo and determinism (I3, I7)',()=>{
  function shapes(seed:number){
    const r=rng(seed);const evs:Evidence[]=[];
    for(let i=0;i<r.int(3,16);i++)evs.push(ev({day:addDays('2026-11-10',r.int(0,8)),outcome:r.pick<Outcome>(['pass','pass','partial','fail']),hint_level:r.pick([0,0,0,1,2,3]),
      level:r.pick<Level>(['recall','use','understand']),kind:r.pick(['attempt','attempt','recall','recheck'] as const),session_id:r.pick(['A','B','C']),
      concept_id:r.pick(['compact','hausdorff','compact'])}));
    return evs;
  }
  it('same facts in any array order give byte-identical output',()=>{
    for(const seed of SEEDS){
      const evs=shapes(seed);const a=JSON.stringify(run(evs));
      const b=JSON.stringify(run(rng(seed+1).shuffle(evs)));
      expect(b).toBe(a);
    }
  });
  it('undo: removing or voiding the last evidence restores the exact earlier state; redo restores the later one',()=>{
    for(const seed of SEEDS){
      const evs=shapes(seed);if(evs.length<2)continue;
      const ordered=[...evs].sort((a,b)=>a.at-b.at||(a.id<b.id?-1:1));
      const last=ordered[ordered.length-1];
      const before=JSON.stringify(run(ordered.slice(0,-1)));
      expect(JSON.stringify(run(ordered.map(e=>e===last?{...e,voided:true}:e)))).toBe(before);
      const after=JSON.stringify(run(ordered));
      expect(JSON.stringify(run([...ordered.slice(0,-1),{...last,voided:false}]))).toBe(after);
    }
  });
  it('undoing the evidence that created a recheck removes it when it had no other origin',()=>{
    const mk=ev({hint_level:3});
    expect(run([mk]).rechecks).toHaveLength(1);
    expect(run([{...mk,voided:true}]).rechecks).toEqual([]);
  });
  it('same concept in two projects: one recheck, scheduled under the nearer deadline (class info carries it)',()=>{
    const evs=[ev({hint_level:3,project_id:'p1'} as any),ev({hint_level:3,day:'2026-11-17',project_id:'p2'} as any)];
    const r=run(evs,{classes:{compact:{name:'compactness',core:false,lastStudyOn:'2026-11-18',active:true}}});
    expect(r.rechecks).toHaveLength(1);expect(r.rechecks[0].due===null||r.rechecks[0].due<='2026-11-18').toBe(true);
  });
  it('a due recheck on a day without a session is still due the next day (nothing piles on a missed day)',()=>{
    const r=run([ev({hint_level:3})]).rechecks;const d=r[0].due!;
    expect(dueRechecks(r,addDays(d,-1))).toHaveLength(0);expect(dueRechecks(r,d)).toHaveLength(1);expect(dueRechecks(r,addDays(d,5))).toHaveLength(1);
  });
  it('retrievability decays with days since the last review',()=>{
    const x=run([ev({hint_level:3})]).rechecks[0];
    expect(retrievabilityOf(x,x.last_review)).toBeGreaterThan(retrievabilityOf(x,addDays(x.last_review,10)));
  });
});
