import {Link} from 'react-router';
import type {CheckpointView,Settings} from '../../data/types';
import type {AdaptiveView} from '../../data/adaptive/contract';
import {useSettings} from '../../data/hooks';
import {useAdaptive} from './useAdaptive';
import {studyDaysLeft,localDate} from '../../../supabase/functions/_shared/adaptive/time';
import {dueRechecks,type Recheck} from '../../../supabase/functions/_shared/adaptive/recheck';
import './adaptive.css';

type Flags=Settings['flags'];
export const inactiveCheckpoint=(cp:CheckpointView,flags:Flags)=>flags?.scheduler_v2===true&&(cp.planState==='deferred'||cp.planState==='skipped');
export function checkpointLabel(cp:CheckpointView,flags:Flags,fallback:string){
 if(inactiveCheckpoint(cp,flags))return cp.planState==='skipped'?'Skipped':'Deferred';
 return flags?.recheck_v2===true&&cp.ui==='revisit'?'Demonstrated':fallback;
}
export const stepDisposition=(cp:CheckpointView,index:number,flags:Flags)=>flags?.scheduler_v2===true&&cp.stepMeta?.[index]?.state==='deferred'?'deferred':undefined;
function Reason({reason,at}:{reason?:string|null;at?:string|null}){
 const {data}=useSettings();
 return <> · {reason||'reason not recorded'} · {at?<time dateTime={at}>{localDate(data?.timeZone||'UTC',at)}</time>:'date not recorded'}</>;
}
export function PlanDisposition({view}:{view:CheckpointView}){
 const {data}=useSettings(),flags=data?.flags;
 if(!flags?.scheduler_v2)return null;
 const steps=view.stepMeta?.map((meta,index)=>({meta,index})).filter(x=>x.meta.state==='deferred')??[];
 if(!inactiveCheckpoint(view,flags)&&!steps.length)return null;
 return <span className="adaptive-disposition" data-adaptive-state={view.planState}>
  {inactiveCheckpoint(view,flags)&&<span>{checkpointLabel(view,flags,'')}<Reason reason={view.deferredReason} at={view.deferredAt}/></span>}
  {steps.map(({meta,index})=><span key={index}>Step {index+1}: Deferred<Reason reason={meta.deferred_reason??meta.tier} at={meta.deferred_at}/></span>)}
 </span>;
}
export function DeferredStep({view,index}:{view:CheckpointView;index:number}){
 const {data}=useSettings();
 if(!stepDisposition(view,index,data?.flags))return null;
 const meta=view.stepMeta![index];
 return <span className="adaptive-disposition">Deferred<Reason reason={meta.deferred_reason??meta.tier} at={meta.deferred_at}/></span>;
}
export function Feasibility({data,projectId}:{data:AdaptiveView;projectId:string}){
 const p=data.state.projects[projectId];
 if(!data.state.flags.time_block||!p||(!p.atRisk&&!(p.feasibility&&p.feasibility.slack<0)))return null;
 return <p className="adaptive-risk"><Link to={'/p/'+encodeURIComponent(p.slug)+'?tab=map'}>
  {p.feasibility&&p.feasibility.slack<0&&<>short by {Math.abs(p.feasibility.slack)} min</>}{p.atRisk&&<>{p.feasibility&&p.feasibility.slack<0?' · ':''}core at risk</>} · Open plan
 </Link></p>;
}
export function Rechecks({data,projectId}:{data:AdaptiveView;projectId:string}){
 if(!data.state.flags.recheck_v2)return null;
 const cpIds=new Set(data.rows.checkpoints.filter(c=>c.project_id===projectId).map(c=>c.id));
 const concepts=new Set(data.rows.cpConcepts.filter(c=>cpIds.has(c.checkpoint_id)).map(c=>c.concept_id));
 const due=dueRechecks(data.rechecks as Recheck[],data.state.today).filter(r=>concepts.has(r.class_id))
  .sort((a,b)=>String(a.due).localeCompare(String(b.due))||a.class_id.localeCompare(b.class_id)||a.level.localeCompare(b.level));
 return <section aria-label="Due rechecks" className="adaptive-section"><h3>Due rechecks</h3>
  {due.length?<ul>{due.map(r=><li key={r.class_id+'/'+r.level+'/'+r.seq}>
   <strong>{data.rows.concepts.find(c=>c.id===r.class_id)?.name??r.class_id}</strong> · {r.level} · {r.due!<data.state.today?'Overdue':'Due today'} · <time dateTime={r.due!}>{r.due}</time>
   <p>{r.prompt}</p>
  </li>)}</ul>:<p>No rechecks due.</p>}
 </section>;
}
export function TodaySchedulerView({data}:{data:AdaptiveView}){
 const {state}=data;
 if(!state.flags.time_block&&!state.flags.recheck_v2)return null;
 const projects=data.rows.projects.filter(p=>state.projects[p.id]);
 const q=state.queue;
 return <section aria-label="Adaptive scheduler" className="adaptive-panel">
  {state.flags.time_block&&<><h2>Today's schedule</h2><p><time dateTime={state.today}>{state.today}</time> · {state.zone}</p>
   <dl className="adaptive-facts"><div><dt>Capacity today</dt><dd>{state.capacityToday.configured?state.capacityToday.minutes+' min':'Unset'}</dd></div>
    <div><dt>Used today</dt><dd>{state.usedToday} min</dd></div></dl></>}
  {projects.map(p=>{const view=state.projects[p.id];return <section key={p.id} aria-label={p.title+' schedule'}>
   <h3><Link to={'/p/'+encodeURIComponent(p.slug)}>{p.title}</Link></h3>
   {state.flags.time_block&&<dl className="adaptive-facts">
    <div><dt>Deadline</dt><dd>{view.time.deadlineDate??'None'}</dd></div>
    <div><dt>Last study day</dt><dd>{view.time.lastStudyOn??'None'}</dd></div>
    <div><dt>Study days left (incl. today)</dt><dd>{studyDaysLeft(state.today,view.time.lastStudyOn)}</dd></div>
   </dl>}
   <Feasibility data={data} projectId={p.id}/><Rechecks data={data} projectId={p.id}/>
  </section>;})}
  {state.flags.time_block&&<section aria-label="Today's queue" className="adaptive-section"><h3>Today's queue</h3>
   <p>{q.minutes.review} min review · {q.minutes.learning} min learning · {q.minutes.available} min available</p>
   {q.items.length?<ol>{q.items.slice(0,8).map((item,index)=><li key={index}>{item.ref} · {item.est_minutes} min</li>)}</ol>:<p>No queued work.</p>}
   {q.items.length>8&&<p>+{q.items.length-8} more</p>}
   {q.tail.length>0&&<p>If time permits: {q.tail.map(item=>item.ref).join(', ')}</p>}
   {state.capacityUnset&&<p>Set minutes per weekday with your tutor to schedule capacity.</p>}
  </section>}
 </section>;
}
export function TodayScheduler(){
 const {data}=useSettings();
 return data?.flags?.time_block||data?.flags?.recheck_v2?<SchedulerData/>:null;
}
function SchedulerData({projectId}:{projectId?:string}){
 const query=useAdaptive();
 if(!query.flags.time_block&&!query.flags.recheck_v2)return null;
 if(query.error)return <p role="alert">Scheduler unavailable. <button type="button" onClick={()=>{void query.refetch();}}>Try again</button></p>;
 return query.data?(projectId?<div className="adaptive-panel"><Feasibility data={query.data} projectId={projectId}/><Rechecks data={query.data} projectId={projectId}/></div>:<TodaySchedulerView data={query.data}/>):<p role="status">Loading schedule…</p>;
}
export function ProjectScheduler({projectId}:{projectId:string}){
 const {data}=useSettings();
 return data?.flags?.time_block||data?.flags?.recheck_v2?<SchedulerData projectId={projectId}/>:null;
}
