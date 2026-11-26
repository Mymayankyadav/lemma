import {describe, expect, it} from 'vitest';
import {planExam, type BlueprintRow, type ExamAttempt, type ExamSnapshot, type ConceptEvidence} from '../../../supabase/functions/_shared/exam/plan';
import {renderExam} from '../../../supabase/functions/_shared/exam/render';

const now = '2026-11-25T12:00:00Z';
const row = (key:string, marks:number, fields:Partial<BlueprintRow> = {}):BlueprintRow => ({key,title:key,marks,...fields});
const mark = (row_key:string, outcome:string, fields:Partial<ExamAttempt> = {}):ExamAttempt => ({row_key,outcome,occurred_at:'2026-11-24T09:30:00Z',independence:'independent',hint_level:0,novelty:'novel',...fields});
const course = (fields:Partial<ConceptEvidence> = {}):ConceptEvidence => ({concept:'rank',occurred_at:'2026-11-23T09:30:00Z',outcome:'pass',hint_level:0,novelty:'novel',...fields});
function sample():ExamSnapshot {
  return {now, sitting:{id:'exam',project_id:'algebra',title:'Linear algebra final',status:'active',phase:'screen',card_mode:'later',time_zone:'Asia/Kolkata',starts_at:'2026-11-27T04:00:00Z',study_minutes:600,total_marks:57,version:1,blueprint_version:1,
    blueprint:[row('diag',20,{format:'mcq'}),row('proj',15),row('rank',12,{concepts:['rank']}),row('det',10,{provisional:true})],ledger:{det:{disposition:'defer',reason:'No time',reopen:'More minutes'}}},
    attempts:[mark('proj','incorrect')],evidence:[course()]};
}
describe('exam planning from one as-of snapshot', () => {
  it('reproduces the algebra paper and preserves the skipped coverage in the ledger',()=>{
    const s=sample(), p=planExam(s);
    expect(p.coverage).toEqual({accounted:57,secure:12,deferred:10});
    expect(p.rows.map(r=>+r.exposure.toFixed(1))).toEqual([17,13.5,3.6,8.5]);
    expect(p.next).toMatchObject({kind:'probe',keys:['diag'],minutes:1});
    expect(p.next.why).toContain('proj');
    expect(p.runnerUp).toMatchObject({kind:'teach',keys:['proj']});
    expect(p.rows[2].fact).toContain('independent');
  });
  it('makes the cutoff, zero budget, unknown budget and passed exam explicit',()=>{
    const s=sample(); s.sitting.study_minutes=0;
    expect(planExam(s)).toMatchObject({minutes:0,next:{kind:'rest'},runnerUp:undefined});
    s.sitting.study_minutes=90; s.sitting.last_study_at='2026-11-25T11:59Z';
    expect(planExam(s).next.kind).toBe('rest');
    s.sitting.starts_at=now;
    expect(planExam(s)).toMatchObject({next:{kind:'confirm'},runnerUp:undefined});
    s.sitting.starts_at=null; s.sitting.last_study_at=null; s.sitting.study_minutes=null;
    expect(planExam(s).next.kind).toBe('map');
  });
  it('verifies independently secure material with a whole proof when one fits',()=>{
    const s=sample(); s.sitting.blueprint=[row('calc',40,{minutes:6}),row('proof',20,{format:'proof',minutes:12})];
    s.attempts=[mark('calc','correct'),mark('proof','correct')]; s.sitting.study_minutes=12;
    expect(planExam(s)).toMatchObject({next:{kind:'verify',keys:['proof'],minutes:12},runnerUp:undefined});
    s.attempts=[]; s.sitting.activation_study_minutes=60;
    expect(planExam(s).next.kind).toBe('verify');
  });
  it('teaches directly when the same choice wins after either probe result',()=>{
    for (const weights of [[50,1],[10,60]]) {
      const s=sample(); s.sitting.blueprint=[row('maybe',weights[0]),row('gap',weights[1])]; s.attempts=[mark('gap','incorrect')];
      expect(planExam(s).next.kind).toBe('teach');
    }
  });
  it('conflicts include compulsory exposure, including a deferred compulsory row',()=>{
    const s=sample(); s.sitting.blueprint[1].compulsory=true; s.sitting.study_minutes=2;
    expect(planExam(s).conflicts).toContain('Compulsory proj: 13.5 marks exposed.');
    s.sitting.study_minutes=90; s.sitting.ledger.proj={disposition:'defer',reason:'Choice',reopen:'Extra time'};
    expect(planExam(s).conflicts).toHaveLength(1); expect(planExam(s).next.keys).not.toContain('proj');
  });
  it('distinguishes weak evidence from the absence of evidence even for equal-weight rows',()=>{
    const s=sample(); s.sitting.blueprint=[row('a',10),row('b',10)];s.attempts=[mark('b','partial')];
    const [a,b]=planExam(s).rows; expect(a.status).toBe('unseen');expect(b.status).toBe('shaky');expect(a.exposure).toBeGreaterThan(b.exposure);
  });
  it('detects recent conflicting results and distinguishes low-confidence guesses from secure work',()=>{
    const s=sample();s.attempts.push(mark('diag','incorrect'),mark('diag','correct',{occurred_at:'2026-11-25T10:00Z'}));
    expect(planExam(s).rows[0].status).toBe('conflicting'); expect(planExam(s).next.keys).toContain('diag');
    s.attempts=[mark('diag','correct',{confidence:'low'})]; expect(planExam(s).rows[0].status).toBe('shaky');
  });
  it('does not diagnose failure from a timeout, a skip, an unscorable answer or reading',()=>{
    const s=sample(); s.attempts=['skipped','timeout','unscorable','exposure'].map(x=>mark('diag',x,{marks_awarded:0,marks_possible:2,independence:x==='exposure'?'reading':'independent'}));
    expect(planExam(s).rows[0].status).toBe('unseen');
    s.attempts=[mark('diag','correct',{hint_level:1})]; expect(planExam(s).rows[0].status).toBe('shaky');
  });
  it('applies corrected scores and voids on replay, including marks over the outcome label',()=>{
    const s=sample(); s.attempts=[mark('diag','correct',{marks_awarded:1,marks_possible:4})];
    expect(planExam(s).rows[0].status).toBe('gap'); s.attempts[0].marks_awarded=4;
    expect(planExam(s).rows[0].status).toBe('secure'); s.attempts[0].voided_at=now;
    expect(planExam(s).rows[0].status).toBe('unseen'); expect(planExam(s)).toEqual(planExam(structuredClone(s)));
  });
  it('only uses the current blueprint, respects recency, and preserves evidence across mode switches',()=>{
    const s=sample(); s.evidence=[course({occurred_at:'2026-10-24T12:00Z'})];
    s.attempts=[mark('removed','incorrect'),mark('diag','correct',{occurred_at:'2026-11-26T00:00Z'})];
    const active=planExam(s); expect(active.rows[2].status).toBe('stale'); expect(active.next.keys).not.toContain('removed');
    expect(active.rows[0].status).toBe('unseen'); s.sitting.status='paused'; expect(planExam(s).rows).toEqual(active.rows);
    s.evidence=[course({novelty:'self_reported'}),course({voided_at:now})]; expect(planExam(s).rows[2].status).toBe('unseen');
  });
  it('prioritises the row score over simultaneous course evidence',()=>{
    const s=sample();s.attempts=[mark('rank','partial',{occurred_at:s.evidence[0].occurred_at})];
    expect(planExam(s).rows[2].status).toBe('shaky');
  });
  it('bundles a prerequisite repair with its scored dependent in the available time',()=>{
    const s=sample();s.sitting.blueprint=[row('basic',5),row('joint',45,{prereqs:['basic']})];s.attempts=[mark('basic','incorrect'),mark('joint','incorrect')];
    expect(planExam(s).next).toMatchObject({kind:'teach',keys:['basic','joint'],minutes:16});
    s.sitting.study_minutes=8; expect(planExam(s).next.keys).toEqual(['basic']);
  });
  it('keeps pinned rows ahead of a normal lesson and skips excluded rows',()=>{
    const s=sample();s.sitting.ledger.proj={disposition:'pin'};
    expect(planExam(s).next.keys).toEqual(['proj']);
    s.sitting.ledger.proj={disposition:'skip',reason:'Owner choice'};expect(planExam(s).next.keys).not.toContain('proj');
  });
  it('keeps the next action, coverage and bookmark readable with sixty rows',()=>{
    const s=sample();s.sitting.blueprint=Array.from({length:60},(_,i)=>row('r'+i,10));s.sitting.bookmark={checkpoint:'CP4'};
    const text=renderExam(s.sitting,'algebra',planExam(s),now,2);
    expect(text.length).toBeLessThanOrEqual(3000);expect(text).toContain('more rows');expect(text).toContain('COVERAGE');expect(text).toContain('NEXT');expect(text).toContain('BOOKMARK CP4');
  });
});
