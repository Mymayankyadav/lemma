import {isFlagOn} from '../../flags';
import type {DemoStore} from '../demo/model';
import type {AdaptiveData} from './contract';
/** Only the local demo fixture; no production study data is copied into app fixtures. */
export function demoAdaptiveData(store:DemoStore):AdaptiveData{
 const cps=store.checkpoints;
 const targets=store.concepts.filter(c=>c.level==='planet').slice(0,4),attempts=targets.flatMap((c,i)=>Array.from({length:8},(_,j)=>({id:i*8+j+1,occurred_at:'2026-11-'+String(10+j).padStart(2,'0')+'T10:00:00Z',session_id:'atlas-demo-session-'+j,project_id:cps[0]?.projectId,checkpoint_id:cps[0]?.id,item_kind:'practice',weight:1,cued:[],tags:[{concept_id:c.id,facet:'use',role:'target',stage:'E',result:j===0?'fail':'ok',hint_level:0}]})));
 return {rows:{settings:{...store.settings,time_zone:store.settings.timeZone,rollover_hour:store.settings.rolloverHour,
  ...(isFlagOn('atlasV3')?{planning:{window_start:'18:00',window_end:'21:00'}}:{}),fsrs_weights:store.settings.fsrsWeights,desired_retention:store.settings.desiredRetention,review_budget:store.settings.reviewBudget},
  projects:store.projects.filter(p=>!p.system&&p.status!=='archived').map(p=>({...p,target_date:p.targetDate})),
  checkpoints:cps.map(c=>({...c,project_id:c.projectId,current_step:c.currentStep+1,due_on:c.dueOn,
   plan_state:c.planState??'active',deferred_at:c.deferredAt,deferred_reason:c.deferredReason,step_meta:c.stepMeta})),
  prereqs:cps.flatMap(c=>c.prereqs.map(code=>({checkpoint_id:c.id,prereq_id:cps.find(p=>p.projectId===c.projectId&&p.code===code)?.id}))),
  cpConcepts:cps.flatMap(c=>c.conceptIds.map(id=>({checkpoint_id:c.id,concept_id:id}))),
  concepts:store.concepts.map(c=>({...c,parent_id:c.parentId})),conceptLinks:store.links.map(l=>({from_id:l.fromId,to_id:l.toId,kind:l.kind})),
  sessions:store.sessions.map(s=>({...s,project_id:s.projectId,checkpoint_id:cps.find(c=>c.projectId===s.projectId&&c.code===s.checkpointCode)?.id,
   started_at:s.startedAt,last_activity_at:s.lastActivityAt})),
  evidence:[],misconceptions:[],decisions:[],baselines:[],overrides:[],intervals:[],busy:[],dueCards:{},attempts,
  instructionEvents:targets.map((c,i)=>({id:i+1,concept_id:c.id,occurred_at:'2026-11-09T10:00:00Z'})),
  atlasLinks:targets.length>=2?[{id:'atlas-demo-link',from_id:targets[0].id,to_id:targets[1].id,kind:'analogous',status:'proposed',origin:'tutor',confidence:.8,rationale:'Both arguments use the same compactness structure.',version:1}]:[]},rechecks:[]};
}
