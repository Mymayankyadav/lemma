import {describe,expect,it} from 'vitest';
import {assemble} from '../../../supabase/functions/_shared/adaptive/facts.ts';
import {rowsFor,PRODUCTION,NOW} from './rows.ts';
import {rng,SEEDS} from './prng.ts';

const topo=(o:any={})=>rowsFor(PRODUCTION,o);
const ev=(rows:any,id:number,over:any={})=>({id,occurred_at:'2026-11-16T10:00:00Z',session_id:'s-topology-1-0',concept_id:'c-topology-1-1',level:'use',role:'primary',outcome:'pass',hint_level:0,novelty:'novel',kind:'attempt',voided_at:null,...over});

describe('acceptance 1: TIME block from production-shaped facts',()=>{
  const s=assemble(topo(),NOW);
  const t=s.projects['proj-topology-1'];
  it('shows deadline, study days left and first session; every date is derived',()=>{
    expect(t.block).toContain('TIME today=2026-11-17 (Tue) tz=Asia/Calcutta');
    expect(t.block).toContain('deadline=2026-11-20 last_study=2026-11-20 study_days_left=4 (incl. today)');
    expect(t.block).toContain('first_session=2026-11-16');
    expect(t.block).toContain('capacity_today=240m used_today=0m');
    const dates=new Set(t.block.match(/\d{4}-\d{2}-\d{2}/g));
    expect([...dates].sort()).toEqual(['2026-11-16','2026-11-17','2026-11-20']);          // today, first session, deadline/last study
    expect(t.block).not.toMatch(/pace|forecast|behind|ahead|finish|projected|10-day|4 ?h/i);
  });
  it('the other three projects have their own first session (or none)',()=>{
    expect(s.projects['proj-algebra-1'].block).toMatch(/first_session=2026-11-1\d/);
    expect(s.projects['proj-complex-analysis'].block).toContain('first_session=none');
  });
  it('capacity unset is reported, never guessed',()=>{
    const u=assemble(topo({capacity:null}),NOW);
    expect(u.projects['proj-topology-1'].block).toContain('capacity_today=unset');
    expect(u.queue.flags).toContain('capacity_unset');expect(u.capacityUnset).toBe(true);
  });
  it('last_study_on may extend the deadline day (Owner: up to the 22nd) and unconfirmed times are marked',()=>{
    const e=assemble(rowsFor(PRODUCTION.map(p=>({...p,lastStudy:'2026-11-22'}))),NOW);
    expect(e.projects['proj-topology-1'].block).toContain('deadline=2026-11-20 last_study=2026-11-22 study_days_left=6');
    expect(e.projects['proj-topology-1'].unconfirmed).toBe(true);
  });
  it('overdue is measured against the latest approved baseline, not the original plan',()=>{
    const rows=topo();
    const cps=rows.checkpoints.filter((c:any)=>c.project_id==='proj-topology-1'&&c.status!=='demonstrated').slice(0,3);
    rows.baselines=[{project_id:'proj-topology-1',baseline_version:1,entries:cps.map((c:any)=>({checkpoint_id:c.id,due_on:'2026-11-19'}))}];
    const out=assemble(rows,NOW).projects['proj-topology-1'].block;
    expect(out).toContain('due_today=[] overdue_vs_baseline=[]');
  });
});
describe('the recheck loop is gone (acceptance 2)',()=>{
  it('demonstrating checkpoints with clean hint-0 evidence creates zero rechecks and no warm-up items',()=>{
    const rows=topo();rows.evidence=[ev(rows,1),ev(rows,2,{concept_id:'c-topology-1-2'}),ev(rows,3,{concept_id:'c-topology-1-3',kind:'evidence'})];
    const s=assemble(rows,NOW);
    expect(s.rechecks.rechecks).toEqual([]);expect(s.queue.items.filter(x=>x.type==='recheck')).toEqual([]);
  });
  it('a fixed gap creates exactly one recheck, due no earlier than the next study day, concrete prompt',()=>{
    const rows=topo();rows.evidence=[ev(rows,1,{outcome:'fail',occurred_at:'2026-11-17T04:00:00Z'}),ev(rows,2,{occurred_at:'2026-11-17T04:30:00Z'})];
    const s=assemble(rows,NOW);
    expect(s.rechecks.rechecks).toHaveLength(1);
    const r=s.rechecks.rechecks[0];expect(r.due!>='2026-11-18').toBe(true);expect(r.prompt).toMatch(/Concept topology-1 1/);expect(r.prompt).not.toMatch(/^Recheck CP/);
    expect(s.queue.items.filter(x=>x.type==='recheck')).toEqual([]);                       // not due today (I5)
    const later=assemble(rows,new Date('2026-11-18T06:00:00Z'));
    expect(later.queue.items.filter(x=>x.type==='recheck')).toHaveLength(1);
  });
  it('a recheck of a prerequisite concept of today\'s checkpoint is mandatory',()=>{
    const rows=topo();
    rows.conceptLinks=[{from_id:'c-topology-1-1',to_id:'c-topology-1-4',kind:'prereq'}];
    rows.evidence=[ev(rows,1,{outcome:'fail',occurred_at:'2026-11-16T04:00:00Z'}),ev(rows,2,{occurred_at:'2026-11-16T04:30:00Z'})];
    const s=assemble(rows,new Date('2026-11-18T06:00:00Z'));
    const item=s.queue.items.find(x=>x.type==='recheck');expect(item?.reason_code).toBe('mandatory_prereq');
  });
});
describe('feasibility and pruning on the production shape (acceptance 5)',()=>{
  const s=assemble(topo(),NOW);
  it('topology-1 is infeasible, and the proposal never contains core, pinned, done or in-progress items',()=>{
    expect(s.projects['proj-topology-1'].feasibility!.slack).toBeLessThan(0);
    const cps=new Map(topo().checkpoints.map((c:any)=>[c.project_id+'|'+c.code,c]));
    for(const a of s.prune.actions){
      const c=cps.get(a.project_id+'|'+a.ref);if(!c)continue;
      if(a.kind==='defer_cp'||a.kind==='compress_cp'){expect(c.tier).not.toBe('core');expect(c.status).toBe('not_started');expect(c.pinned).toBe(false)}
    }
  });
  it('capacity is shared: the four projects compete and core being cut in several projects becomes a question',()=>{
    expect(s.prune.atRisk.length).toBeGreaterThan(0);
    if(s.prune.atRisk.length>1)expect(s.prune.ask?.question).toBe('which_project_first');
  });
  it('projects with no sessions still reserve their share',()=>{
    const f=s.projects['proj-complex-analysis'].feasibility!;
    expect(f.raw).toBeGreaterThan(0);expect(f.required).toBeGreaterThan(0);
  });
});
describe('the queue shows the real plan',()=>{
  it('a checkpoint that is only proposed for pruning stays in the queue until the deferral is applied',()=>{
    const rows=rowsFor([{slug:'tiny',cps:2,done:0,stages:1,target:'2026-11-18',tiers:'nocore'}],{capacity:{weekday_minutes:100}});
    rows.sessions=[];rows.projects[0].auto_prune_standard=false;
    const cp1=rows.checkpoints.find((c:any)=>c.code==='CP1');Object.assign(cp1,{estimate_minutes:600,steps:['a','b']});
    const s=assemble(rows,NOW);
    expect(s.prune.actions.some(a=>a.kind==='defer_cp'&&a.ref==='CP1'&&a.needs_approval)).toBe(true);   // proposed, not applied
    expect(s.queue.items.concat(s.queue.tail).map(x=>x.ref)).toContain('CP1#1');
  });
});
describe('purity (I3, I7)',()=>{
  it('identical facts on the same study day give byte-identical output, whatever the row order',()=>{
    for(const seed of SEEDS.slice(0,12)){
      const r=rng(seed);const rows=rowsFor([PRODUCTION[0]],{seed});   // the evidence touches topology-1 only; one project keeps this fast
      rows.evidence=Array.from({length:r.int(0,12)},(_,i)=>ev(rows,i+1,{outcome:r.pick(['pass','fail','partial']),hint_level:r.pick([0,2,3]),concept_id:'c-topology-1-'+r.int(1,4),
        occurred_at:'2026-11-1'+r.int(5,7)+'T0'+r.int(1,9)+':00:00Z',session_id:'s-topology-1-'+r.int(0,2)}));
      const a=JSON.stringify(assemble(rows,NOW));
      const shuffled={...rows};for(const k of ['evidence','checkpoints','prereqs','cpConcepts','concepts','sessions','projects'] as const)(shuffled as any)[k]=r.shuffle((rows as any)[k]);
      expect(JSON.stringify(assemble(shuffled,NOW))).toBe(a);
    }
  });
  it('undo of an evidence row restores the previous recheck set and queue exactly',()=>{
    for(const seed of SEEDS.slice(0,12)){
      const r=rng(seed);const rows=rowsFor([PRODUCTION[0]],{seed});   // the evidence touches topology-1 only; one project keeps this fast
      const evs=Array.from({length:r.int(2,10)},(_,i)=>ev(rows,i+1,{outcome:r.pick(['pass','fail']),hint_level:r.pick([0,3]),concept_id:'c-topology-1-'+r.int(1,3),
        occurred_at:'2026-11-1'+r.int(4,6)+'T0'+r.int(1,9)+':00:00Z',session_id:'s-topology-1-'+r.int(0,2)}));
      const full={...rows,evidence:evs},without={...rows,evidence:evs.slice(0,-1)},voided={...rows,evidence:evs.map((e,i)=>i===evs.length-1?{...e,voided_at:'2026-11-17T01:00:00Z'}:e)};
      const pick=(s:any)=>JSON.stringify([s.rechecks,s.queue]);
      expect(pick(assemble(voided,NOW))).toBe(pick(assemble(without,NOW)));
      expect(pick(assemble({...rows,evidence:evs.map(e=>({...e,voided_at:null}))},NOW))).toBe(pick(assemble(full,NOW)));
    }
  });
  it('a deadline that has passed is post-deadline mode: nothing is due',()=>{
    const s=assemble(topo(),new Date('2026-11-25T06:00:00Z'));
    expect(s.queue.items).toEqual([]);expect(s.queue.flags).toContain('post_deadline');
  });
});
