// Raw-row fixtures shaped like the 2026-11-17 production data (codes, statuses, dates, counts; no study text).
import type {Rows} from '../../../supabase/functions/_shared/adaptive/facts.ts';
import {rng} from './prng.ts';

export type P={slug:string;cps:number;done:number;stages?:number;target:string;lastStudy?:string|null;tiers?:'mixed'|'allcore'|'nocore'};
export const NOW=new Date('2026-11-17T06:00:00Z'); // 11:30 IST, study day 2026-11-17
export const PRODUCTION:P[]=[
  {slug:'topology-1',cps:39,done:3,stages:6,target:'2026-11-20'},
  {slug:'algebra-1',cps:35,done:3,stages:6,target:'2026-11-20'},
  {slug:'complex-analysis',cps:35,done:0,stages:6,target:'2026-11-20'},
  {slug:'analysis-1-probability',cps:30,done:0,stages:5,target:'2026-11-20'}];
export function rowsFor(ps:P[],opts:{capacity?:any;flags?:Record<string,boolean>;seed?:number}={}):Rows{
  const r=rng(opts.seed??7);
  const rows:Rows={settings:{time_zone:'Asia/Calcutta',rollover_hour:4,desired_retention:0.91,flags:opts.flags??{},
      capacity:opts.capacity===undefined?{weekday_minutes:240}:opts.capacity,planning:{window_start:'08:00',window_end:'22:00'},review_budget:{cards:20,minutes:20}},
    projects:[],checkpoints:[],prereqs:[],cpConcepts:[],concepts:[],conceptLinks:[],evidence:[],misconceptions:[],decisions:[],baselines:[],
    overrides:[],sessions:[],intervals:[],busy:[],dueCards:{}};
  ps.forEach((p,pi)=>{
    const pid='proj-'+p.slug;
    rows.projects.push({id:pid,slug:p.slug,title:p.slug,status:'active',target_date:p.target,last_study_on:p.lastStudy??null,deadline_at:null,time_confirmed:false,share_weight:null,auto_prune_standard:true,prompt:'',goal:'',target_label:null});
    const per=Math.ceil(p.cps/(p.stages??6));
    for(let i=0;i<p.cps;i++){
      const cards=(i%per)===per-1;
      const tier=cards?'standard':p.tiers==='allcore'?'core':p.tiers==='nocore'?'standard':(i<7?'core':r.pick(['standard','standard','standard','venture']));
      const id=pid+'-cp'+(i+1);const n=r.int(3,5);
      rows.checkpoints.push({id,project_id:pid,code:'CP'+(i+1),position:i+1,stage:'S'+(Math.floor(i/per)+1),title:cards?'Cards K'+(Math.floor(i/per)+1):'Topic '+(i+1),
        steps:Array.from({length:n},(_,k)=>k===n-1&&r.bool(0.4)?'Venture: extra '+k:'Step '+k),status:i<p.done?'demonstrated':'not_started',current_step:i<p.done?n:0,
        kind:cards?'cards':'learn',tier,estimate_minutes:cards?20:r.pick([45,60,75,90]),pinned:false,plan_state:'active',deferred_at:null,deferred_reason:null,step_meta:null,
        due_on:'2026-11-'+String(14+Math.min(6,Math.floor(i*6/p.cps))).padStart(2,'0'),demonstrated_at:i<p.done?'2026-11-16T10:00:00Z':null,self_reported:false});
      if(i>0&&!cards&&r.bool(0.4))rows.prereqs.push({checkpoint_id:id,prereq_id:pid+'-cp'+r.int(Math.max(1,i-3),i)});
      const cid='c-'+p.slug+'-'+(i+1);
      rows.concepts.push({id:cid,name:'Concept '+p.slug+' '+(i+1),parent_id:null});
      rows.cpConcepts.push({checkpoint_id:id,concept_id:cid});
    }
    if(p.done>0){
      for(let k=0;k<(pi===0?7:6);k++)rows.sessions.push({id:'s-'+p.slug+'-'+k,project_id:pid,checkpoint_id:pid+'-cp'+(1+k%p.done),started_at:(pi===0?'2026-11-16':'2026-11-1'+k)+'T10:00:00Z',minutes:90,state:'ended',abandoned:false,study_day:null,time_zone:'Asia/Calcutta'});
    }
  });
  return rows;
}
