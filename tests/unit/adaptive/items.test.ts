import {describe,expect,it} from 'vitest';
import {fingerprint,priorB,updateB,uncalibrated,templateItem,normalizeProfile,coreLevels,draftProfile} from '../../../supabase/functions/_shared/adaptive/items.ts';
import {buildDigest,renderDigest,type EvidenceFact} from '../../../supabase/functions/_shared/adaptive/digest.ts';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {brier,buckets,weightedBrier,scribeAudit,auditSampleSize,weeklyReport,itemWeight} from '../../../supabase/functions/_shared/adaptive/calibration.ts';
import {validateScribe,runJob,scribeCandidates,aliasProposals,type ScribeEvent,type JobState} from '../../../supabase/functions/_shared/adaptive/workers.ts';
import {rng,SEEDS} from './prng.ts';

let n=0;
const ev=(p:Partial<EvidenceFact>={}):EvidenceFact=>({id:'e'+(++n),at:1e12+n*1000,day:'2026-11-16',concept_id:'c',level:'use',role:'primary',outcome:'pass',hint_level:0,novelty:'novel',...p});

describe('items (§10)',()=>{
  it('fingerprint ignores case, spacing and LaTeX delimiters but not content',()=>{
    expect(fingerprint('Prove that  $f$ is continuous.')).toBe(fingerprint('prove that f is continuous'));
    expect(fingerprint('Prove f is continuous')).not.toBe(fingerprint('Prove f is open'));
  });
  it('prior difficulty: 1–5 maps to −2…+2; defaults by origin',()=>{
    expect([1,2,3,4,5].map(e=>priorB('source_exercise','use',e))).toEqual([-2,-1,0,1,2]);
    expect(priorB('template','recall')).toBe(-1);expect(priorB('template','understand')).toBe(0.5);expect(priorB('source_exercise','use')).toBe(0);expect(priorB('past_exam','use')).toBe(0.5);
  });
  it('Elo update: a pass lowers b, a fail raises it, steps shrink with b_n; fewer than 3 attempts is uncalibrated',()=>{
    expect(updateB(0,0,0.8,'pass').b).toBeLessThan(0);expect(updateB(0,0,0.8,'fail').b).toBeGreaterThan(0);
    expect(Math.abs(updateB(0,0,0.5,'pass').b)).toBeGreaterThan(Math.abs(updateB(0,15,0.5,'pass').b));
    expect(updateB(0,0,0.5,'partial').b).toBeCloseTo(0);expect(updateB(0,2,.5,'pass').b_n).toBe(3);
    expect(uncalibrated({b_n:2})).toBe(true);expect(uncalibrated({b_n:3})).toBe(false);
  });
  it('items with no evidence still get a template at every level',()=>{
    for(const l of ['recall','use','understand','transfer'] as const)expect(templateItem('c','Compactness',l).text.length).toBeGreaterThan(10);
    expect(templateItem('c','Compactness','transfer','a metric-space argument').text).toContain('a metric-space argument');
  });
  it('learning profile: normalised, and decides the core levels',()=>{
    const p=normalizeProfile({prove:3,solve:1});expect(Object.values(p).reduce((a,b)=>a+b,0)).toBeCloseTo(1,2);
    expect(coreLevels(normalizeProfile({prove:5,solve:1}))).toEqual(['understand']);
    expect(coreLevels(normalizeProfile({solve:4,compute:3,prove:1}))).toEqual(['use','transfer']);
    expect(coreLevels(normalizeProfile({read:5,explain:3,prove:1}))).toEqual(['recall','understand']);
    expect(coreLevels(draftProfile({exercises:2,theorems:80,examples:20,definitions:30,pages:100}))).toEqual(['understand']);
  });
  it('the Beta proficiency model is gone: no source file imports it (07 Acceptance 5)',()=>{
    const files:string[]=[];const walk=(d:string)=>{for(const f of readdirSync(d)){const p=join(d,f);if(statSync(p).isDirectory())walk(p);else if(/\.(ts|tsx|mts)$/.test(f))files.push(p)}};
    walk('src');walk('supabase/functions');
    expect(files.filter(f=>/from\s+['"][^'"]*\/proficiency(\.ts)?['"]/.test(readFileSync(f,'utf8')))).toEqual([]);
    expect(files.some(f=>/adaptive[\\/]proficiency\.ts$/.test(f))).toBe(false);
  });
});
describe('digest (§11.1, I9, I10)',()=>{
  const evs=[ev({id:'812',session_no:7 as any,outcome:'fail',at:1}),ev({id:'813',session_no:7 as any,outcome:'pass',hint_level:2,at:2}),ev({id:'900',session_no:9 as any,level:'understand',at:3})] as any[];
  it('one line per episode, newest first, each ending with its evidence ids',()=>{
    const d=buildDigest(evs);expect(d.map(l=>l.text)).toEqual(['S9 understand pass [ev:900]','S7 use fail→pass, hint2 [ev:812,813]']);
    expect(d[1].ids).toEqual(['812','813']);
  });
  it('is rebuilt from evidence only: voided rows vanish, nothing else is an input; within 300 tokens',()=>{
    expect(buildDigest(evs.map(e=>e.id==='900'?{...e,voided:true}:e)).map(l=>l.text).join()).not.toContain('S9');
    const many=Array.from({length:200},(_,i)=>ev({id:'x'+i,session_no:i as any,at:i}));
    expect(Math.ceil(renderDigest(buildDigest(many)).length/3)).toBeLessThanOrEqual(300);
  });
});
describe('calibration (Phase 6)',()=>{
  it('Brier and buckets',()=>{
    expect(brier([{p:1,y:1},{p:0,y:0}])).toBe(0);expect(brier([{p:0.5,y:1},{p:0.5,y:0}])).toBeCloseTo(0.25);expect(brier([])).toBeNull();
    const b=buckets([{p:0.75,y:1},{p:0.72,y:0},{p:0.95,y:1}]);expect(b.map(x=>x.n)).toEqual([2,1]);expect(b[0].observed).toBe(0.5);
  });
  it('uncalibrated items weigh less',()=>{expect(itemWeight(0)).toBe(0);expect(itemWeight(3)).toBe(1);expect(weightedBrier([{p:1,y:0,bN:0},{p:0,y:0,bN:3}])).toBe(0)});
  it('scribe audit: ≥ 10 events, > 15% disagreement raises a flag and lowers confidence weight',()=>{
    expect(scribeAudit(Array.from({length:10},(_,i)=>({agree:i>1}))).raise).toBe(true);
    expect(scribeAudit(Array.from({length:10},(_,i)=>({agree:i>0}))).raise).toBe(false);
    expect(scribeAudit(Array.from({length:5},()=>({agree:false}))).raise).toBe(false);
    expect(scribeAudit(Array.from({length:10},(_,i)=>({agree:i>1}))).confidenceScale).toBeLessThan(1);
    expect(auditSampleSize(100)).toBe(10);expect(auditSampleSize(400)).toBe(20);expect(auditSampleSize(4)).toBe(4);
    expect(weeklyReport({pairs:[{p:0.8,y:1}],uncalibratedItems:3,audit:scribeAudit([])})).toContain('Brier');
  });
});
describe('workers (§12, I8)',()=>{
  const events:ScribeEvent[]=[{id:'1',kind:'attempt',outcome:'fail',hint_level:2,text:'x',session_id:'s',checkpoint_id:'c',tutorTagged:false},
    {id:'2',kind:'attempt',outcome:'pass',hint_level:0,text:'y',session_id:'s',checkpoint_id:'c',tutorTagged:true},
    {id:'3',kind:'attempt',outcome:'pass',hint_level:0,text:'z',session_id:'s',checkpoint_id:'c',tutorTagged:false}];
  const cand=new Set(['a','b']);
  it('never writes a concept outside the candidates, never changes an outcome or hint, skips tutor-tagged events',()=>{
    for(const seed of SEEDS){
      const r=rng(seed);
      const rows=events.map(e=>({event_id:r.bool(0.9)?e.id:'ghost',concept_id:r.pick(['a','b','zzz','invented']),level:r.pick(['use','understand','bogus']),
        outcome:'pass',hint_level:0,confidence:r.pick([2,-1,0.4,NaN])}));
      const out=validateScribe(rows,events,cand);
      for(const d of out.drafts){expect(cand.has(d.concept_id)).toBe(true);const e=events.find(x=>x.id===d.session_event_id)!;
        expect(d.outcome).toBe(e.outcome);expect(d.hint_level).toBe(e.hint_level);expect(e.tutorTagged).toBe(false);expect(d.origin).toBe('scribe');expect(d.confidence).toBeLessThanOrEqual(0.9)}
      expect(out.drafts.length+out.unresolved.length).toBeGreaterThanOrEqual(2-0);
    }
    expect(validateScribe('garbage',events,cand).drafts).toEqual([]);
  });
  it('an unknown concept is listed as unresolved, not invented',()=>{
    const out=validateScribe([{event_id:'1',concept_id:'novel-concept',level:'use',confidence:1}],events,cand);
    expect(out.drafts).toEqual([]);expect(out.unresolved.find(u=>u.event_id==='1')?.reason).toMatch(/not in candidates/);
  });
  it('confidence scale from the audit lowers the weight',()=>{
    expect(validateScribe([{event_id:'1',concept_id:'a',level:'use',confidence:0.8}],events,cand,0.5).drafts[0].confidence).toBeCloseTo(0.4);
  });
  const state=():JobState=>({enabled:true,tokensToday:0,tokenCap:1000,done:new Set()});
  const ok=async()=>({json:[],input_tokens:100,output_tokens:10});
  it('idempotent per (job, input), kill switch, daily cap, one retry then failed',async()=>{
    const s=state();let writes=0;const w=()=>++writes;
    expect((await runJob(s,'scribe','S1',100,ok,'p',w)).telemetry.status).toBe('ok');
    expect((await runJob(s,'scribe','S1',100,ok,'p',w)).telemetry.status).toBe('skipped_done');expect(writes).toBe(1);
    s.enabled=false;expect((await runJob(s,'scribe','S2',100,ok,'p',w)).telemetry.status).toBe('skipped_disabled');s.enabled=true;
    s.tokensToday=950;expect((await runJob(s,'scribe','S3',100,ok,'p',w)).telemetry.status).toBe('skipped_cap');
    let calls=0;const flaky=async()=>{if(++calls<2)throw new Error('boom');return {json:[],input_tokens:1,output_tokens:1}};
    const r=await runJob(state(),'scribe','S4',1,flaky,'p',w);expect(r.telemetry.status).toBe('ok');expect(r.telemetry.attempts).toBe(2);
    const dead=await runJob(state(),'scribe','S5',1,async()=>{throw new Error('down')},'p',w);expect(dead.telemetry).toMatchObject({status:'failed',attempts:2,error:'down'});
    const s2=state();await runJob(s2,'scribe','S6',1,ok,'p',()=>{throw new Error('write failed')});expect(s2.done.has('scribe:S6')).toBe(false);   // a failed write is retried next run
  });
  it('candidates: the checkpoint concepts, their prerequisites and children, and the top 20 matches',()=>{
    const c=scribeCandidates(['a'],new Map([['a',['p']]]),new Map([['a',['k']]]),Array.from({length:30},(_,i)=>'m'+i));
    expect(c.has('p')&&c.has('k')&&c.has('m19')&&!c.has('m20')).toBe(true);
  });
  it('alias proposals: exact normalised name under the same-named parent is automatic; the rest are proposals',()=>{
    const cs=[{id:'a1',name:'Compactness',subject_id:'s1',parent_id:'pa'},{id:'a2',name:'compactness',subject_id:'s2',parent_id:'pb'},
      {id:'pa',name:'Topology',subject_id:'s1',parent_id:null},{id:'pb',name:'topology',subject_id:'s2',parent_id:null},
      {id:'x1',name:'Group',subject_id:'s1',parent_id:null},{id:'x2',name:'Group',subject_id:'s2',parent_id:'pb'}];
    const r=aliasProposals(cs);
    expect(r.auto).toEqual([['a1','a2']]);expect(r.propose).toContainEqual(['pa','pb']);expect(r.propose).toContainEqual(['x1','x2']);   // top-level concepts have no parent topic: proposals
  });
});
