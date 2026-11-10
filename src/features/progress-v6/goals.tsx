import {useEffect,useState,type FormEvent} from 'react';
import {getApi} from '../../data';
import {getGoalApi} from '../../data/study-goals';
import type {GoalPage,GoalPeriod,GoalRecord} from '../../data/study-goals/contract';
import type {StudyEntryRecord} from '../../data/study/contract';
import type {Subject,ProjectSummary} from '../../data/types';
import {Slab} from '../../ui/Slab';
import {civilDay,formatExactMinutes,periodFor} from './model';
import {goalSavedMinutes} from './goal-model';
import {civilRangeLabel} from '../calendar/views/labels';
import {formatDuration} from '../../lib/format';

type Draft={period:GoalPeriod;startDate:string;endDate:string;timeZone:string;
 targetMinutes:string;subjectId:string;projectId:string};
const button='min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold disabled:opacity-50';
const input='mt-1 min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3 text-body';
function forPeriod(period:GoalPeriod,zone:string):Draft{
 const now=new Date();
 const days=period==='custom'?[civilDay(now,zone)]:periodFor(period,now,zone).days;
 return {period,startDate:days[0],endDate:days[days.length-1],timeZone:zone,
  targetMinutes:period==='month'?'900':'240',subjectId:'',projectId:''};
}
function fromGoal(goal:GoalRecord):Draft{
 return {period:goal.period,startDate:goal.startDate,endDate:goal.endDate,
  timeZone:goal.timeZone,targetMinutes:String(goal.targetMinutes),
  subjectId:goal.subjectId??'',projectId:goal.projectId??''};
}
export default function ProgressGoals({zone,page,entries,error,loading,onSaved,onNext,onPrevious,canPrevious}:{
 zone:string;page:GoalPage;entries:StudyEntryRecord[];error:string;loading:boolean;
 onSaved:()=>void;onNext:()=>void;onPrevious:()=>void;canPrevious:boolean;
}){
 const [subjects,setSubjects]=useState<Subject[]>([]);
 const [projects,setProjects]=useState<ProjectSummary[]>([]);
 const [formOpen,setFormOpen]=useState(false),[editing,setEditing]=useState<GoalRecord|null>(null);
 const [draft,setDraft]=useState<Draft>(()=>forPeriod('week',zone));
 const [busy,setBusy]=useState(false),[failure,setFailure]=useState('');
 useEffect(()=>{
  let alive=true;
  // Metadata is optional presentation, never a source of owner IDs from the browser.
  void (async()=>{
   const api=getApi();
   const [s,p]=await Promise.all([api.listSubjects(),api.listProjects()]);
   if(alive){setSubjects(s);setProjects(p.filter(x=>!x.system));}
  })().catch(()=>{ /* Metadata failures (including unavailable demo fixtures) never block goal progress. */ });
  return ()=>{alive=false};
 },[]);
 function change<K extends keyof Draft>(key:K,value:Draft[K]){setDraft(old=>({...old,[key]:value}));}
 function openCreate(){setEditing(null);setDraft(forPeriod('week',zone));setFailure('');setFormOpen(true);}
 function openEdit(goal:GoalRecord){setEditing(goal);setDraft(fromGoal(goal));setFailure('');setFormOpen(true);}
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  setBusy(true);setFailure('');
  const values={period:draft.period,startDate:draft.startDate,endDate:draft.endDate,
   timeZone:draft.timeZone,targetMinutes:Number(draft.targetMinutes),
   subjectId:draft.subjectId||null,projectId:draft.projectId||null};
  try{
   const api=getGoalApi();
   if(editing)await api.updateGoal(editing.id,editing.version,values);
   else await api.createGoal(values);
   setFormOpen(false);setEditing(null);onSaved();
  }catch(reason){setFailure(reason instanceof Error?reason.message:'Could not save the goal');}
  finally{setBusy(false)}
 }
 async function archive(goal:GoalRecord){
  if(busy)return;
  setBusy(true);setFailure('');
  try{await getGoalApi().archiveGoal(goal.id,goal.version);onSaved();}
  catch(reason){setFailure(reason instanceof Error?reason.message:'Could not archive the goal')}
  finally{setBusy(false)}
 }
 const nameSubject=(id:string|null|undefined)=>id?subjects.find(s=>s.id===id)?.name??'A subject':'All subjects';
 const nameProject=(id:string|null|undefined)=>id?projects.find(p=>p.id===id)?.title??'A path':'All paths';
 const now=new Date().toISOString();
 const today=civilDay(new Date(),zone);
 return <Slab as="section" aria-label="Study goals" className="flex flex-col gap-3 p-4">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div className="min-w-0"><h2 className="text-title-s font-semibold">Study goals</h2>
    <p className="text-caption text-ink-2">Saved focus time within each goal's exact dates and scope</p></div>
   <button type="button" className={button} onClick={openCreate} aria-expanded={formOpen}>New goal</button>
  </div>
  {error&&<p role="alert" className="text-label">{error}
   <button type="button" className={button} onClick={onSaved}>Retry</button></p>}
  {loading?<p role="status">Loading study goals…</p>:!error&&<>
   {page.items.length===0?<p className="text-label text-ink-2">No active study goals on this page.</p>:<>
   {[{label:'',items:page.items.filter(goal=>goal.endDate>=today)},{label:'Past goals',items:page.items.filter(goal=>goal.endDate<today)}]
    .filter(group=>group.items.length).map(group=><div key={group.label||'current'} className="flex flex-col gap-2">
    {group.label&&<h3 className="text-label font-semibold text-ink-2">{group.label}</h3>}
   <ul className="space-y-3">{group.items.map(goal=>{
    const saved=goalSavedMinutes(entries,goal,now),target=goal.targetMinutes;
    const percent=Math.min(100,Math.max(0,100*saved/target));
    const ended=goal.endDate<today;
    const current=goal.startDate<=today&&today<=goal.endDate;
    const name=goal.period==='week'?(current?'This week':'Week'):goal.period==='month'?(current?'This month':'Month'):'Goal';
    const scope=[goal.subjectId?nameSubject(goal.subjectId):'',goal.projectId?nameProject(goal.projectId):'']
     .filter((part,index,all)=>part&&all.indexOf(part)===index).join(' · ')||'All study';
    return <li key={goal.id} className="rounded-[12px] border border-[var(--hair)] p-3" data-goal-id={goal.id}>
     <div className="flex flex-wrap items-center justify-between gap-2">
      <strong className="text-label">{name} · {civilRangeLabel(goal.startDate,goal.endDate)}</strong>
     </div>
     <p className="mt-1 break-words text-caption text-ink-2 [overflow-wrap:anywhere]">{scope}{goal.timeZone!==zone?' · '+goal.timeZone.split('/').pop()?.replace(/_/g,' ')+' time':''}</p>
     <label className="mt-2 block text-label" htmlFor={'goal-progress-'+goal.id}>
      <span className="font-semibold tabular-nums">{formatExactMinutes(saved)} of {target} min saved</span>
      <progress id={'goal-progress-'+goal.id} value={Math.min(saved,target)} max={target} className="lemma-goal-bar mt-1 block h-3 w-full"
       aria-label={name+' goal progress'} />
     </label>
     <p className="text-caption text-ink-2">{ended?(saved>=target?'Reached':formatDuration(target-saved)+' short'):
      saved>=target?'Reached':Math.round(percent)+'% · '+formatDuration(Math.max(0,target-saved))+' to go'}</p>
     <div className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" className={button} disabled={busy} onClick={()=>openEdit(goal)}>Edit goal</button>
      <details className="relative">
       <summary aria-label={'More actions for '+name.toLowerCase()+' goal'} className={button+' flex list-none items-center [&::-webkit-details-marker]:hidden'}>⋯</summary>
       <div className="absolute left-0 z-10 mt-1 rounded-[8px] border border-[var(--hair)] bg-[var(--paper)] p-1 shadow-lg">
        <button type="button" className={button+' lemma-destructive w-full'} disabled={busy} onClick={()=>{void archive(goal)}}>Archive goal</button>
       </div>
      </details>
     </div>
    </li>;
   })}</ul></div>)}</>}
   <div className="flex flex-wrap items-center justify-between gap-2 text-label">
    <span>{page.items.length} shown · {page.total} active goal{page.total===1?'':'s'}</span>
    <div className="flex flex-wrap gap-2">
     <button type="button" className={button} disabled={!canPrevious} onClick={onPrevious}>Previous goals</button>
     <button type="button" className={button} disabled={!page.nextCursor} onClick={onNext}>Next goals</button>
    </div>
   </div>
  </>}
  {formOpen&&<form aria-label={editing?'Edit study goal':'Create study goal'} className="space-y-3 rounded-ctl border border-edge p-3" onSubmit={e=>{void save(e)}}>
   <h3 className="text-body font-semibold">{editing?'Edit goal':'New goal'}</h3>
   <label className="block text-label">Goal period
    <select className={input} value={draft.period} onChange={e=>{
     const period=e.target.value as GoalPeriod;setDraft(old=>({...forPeriod(period,zone),
      subjectId:old.subjectId,projectId:old.projectId}));
    }}><option value="week">Week</option><option value="month">Month</option><option value="custom">Custom</option></select>
   </label>
   <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
    <label className="min-w-0 block text-label">Start date
     <input className={input} type="date" required value={draft.startDate} onChange={e=>change('startDate',e.target.value)}/></label>
    <label className="min-w-0 block text-label">End date (inclusive)
     <input className={input} type="date" required value={draft.endDate} onChange={e=>change('endDate',e.target.value)}/></label>
   </div>
   {draft.timeZone!==zone&&<p className="text-caption text-ink-2">Counted in {draft.timeZone.split('/').pop()?.replace(/_/g,' ')} time.</p>}
   <label className="block text-label">Target minutes
    <input className={input} type="number" min={1} max={100000} step={1} required value={draft.targetMinutes}
     onChange={e=>change('targetMinutes',e.target.value)}/></label>
   <label className="block text-label">Subject scope
    <select className={input} value={draft.subjectId} onChange={e=>{
     setDraft(old=>({...old,subjectId:e.target.value,projectId:''}));
    }}>
     <option value="">All subjects</option>
     {draft.subjectId&&!subjects.some(s=>s.id===draft.subjectId)&&<option value={draft.subjectId}>Current subject</option>}
     {subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
    </select></label>
   <label className="block text-label">Project scope
    <select className={input} value={draft.projectId} onChange={e=>change('projectId',e.target.value)}>
     <option value="">All projects</option>
     {draft.projectId&&!projects.some(p=>p.id===draft.projectId)&&<option value={draft.projectId}>{draft.projectId}</option>}
     {projects.filter(p=>!draft.subjectId||p.subject.id===draft.subjectId).map(p=>
      <option key={p.id} value={p.id}>{p.title}</option>)}
    </select></label>
   {failure&&<p role="alert" className="text-label">{failure}</p>}
   <div className="flex flex-wrap gap-2">
    <button type="submit" className={button} disabled={busy}>{busy?'Saving…':editing?'Save changes':'Create goal'}</button>
    <button type="button" className={button} disabled={busy} onClick={()=>{setFormOpen(false);setFailure('')}}>Cancel</button>
   </div>
  </form>}
  {!formOpen&&failure&&<p role="alert" className="text-label">{failure}</p>}
 </Slab>;
}
