import type {DemoStore} from '../demo/model';
import type {AdaptiveData} from './contract';
/** Only the local demo fixture; no production study data is copied into app fixtures. */
export function demoAdaptiveData(store:DemoStore):AdaptiveData{
 const cps=store.checkpoints;
 return {rows:{settings:{...store.settings,time_zone:store.settings.timeZone,rollover_hour:store.settings.rolloverHour,
  fsrs_weights:store.settings.fsrsWeights,desired_retention:store.settings.desiredRetention,review_budget:store.settings.reviewBudget},
  projects:store.projects.filter(p=>!p.system&&p.status!=='archived').map(p=>({...p,target_date:p.targetDate})),
  checkpoints:cps.map(c=>({...c,project_id:c.projectId,current_step:c.currentStep+1,due_on:c.dueOn,
   plan_state:c.planState??'active',deferred_at:c.deferredAt,deferred_reason:c.deferredReason,step_meta:c.stepMeta})),
  prereqs:cps.flatMap(c=>c.prereqs.map(code=>({checkpoint_id:c.id,prereq_id:cps.find(p=>p.projectId===c.projectId&&p.code===code)?.id}))),
  cpConcepts:cps.flatMap(c=>c.conceptIds.map(id=>({checkpoint_id:c.id,concept_id:id}))),
  concepts:store.concepts.map(c=>({...c,parent_id:c.parentId})),conceptLinks:store.links.map(l=>({from_id:l.fromId,to_id:l.toId,kind:l.kind})),
  sessions:store.sessions.map(s=>({...s,project_id:s.projectId,checkpoint_id:cps.find(c=>c.projectId===s.projectId&&c.code===s.checkpointCode)?.id,
   started_at:s.startedAt,last_activity_at:s.lastActivityAt})),
  evidence:[],misconceptions:[],decisions:[],baselines:[],overrides:[],intervals:[],busy:[],dueCards:{}},rechecks:[]};
}
