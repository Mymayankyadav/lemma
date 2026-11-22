import {Disclosure} from '../../../ui/v7/Disclosure';
import {MoreActions} from '../../../ui/v7/ActionSheet';
import {GoalEditor} from './GoalEditor';
import {EmptyMoment} from '../../../ui/v7/EmptyMoment';
import {useStudyUi} from '../../../data/StudyUiRelease';
import {GRADES,GRADE_KEYS} from '../../../ui/v7/grades';
import {Illustration} from '../../../ui/v7/Illustration';
import {useEffect,useMemo,useState} from 'react';
import {Link,useSearchParams} from 'react-router';
import {getStudyApi} from '../../../data/study';
import {getGoalApi} from '../../../data/study-goals';
import type {GoalRecord} from '../../../data/study-goals/contract';
import type {StudyEntryRecord} from '../../../data/study/contract';
import {useInsightData,useSettings,useSubjects} from '../../../data/hooks';
import {buildInsights} from '../../../lib/insights';
import {formatDuration,formatShortDate,ownerZone} from '../../../lib/format';
import {HubHeader} from '../../../app/v7/V7Shell';
import {Button,Meter,Segmented,Sheet,Skeleton,StatTile,Stepper} from '../../../ui/v7/components';
import {Chart,Heatmap,HorizontalBars} from '../../../ui/v7/Chart';
import {StatusBadge} from '../../../ui/v7/Status';
import {kitSubject,subjectToken} from '../../atlas/v7/model';
import {civilDay,effortSummary} from '../../progress-v6/model';
import {goalSavedMinutes} from '../../progress-v6/goal-model';
import {almanacPeriod,asRange,changeChip,coveringSpan,currentPeriod,goalView,groupDays,insightDays,insightSentences,previousPeriod,ranges,stackColumns,type ProgressRange} from './progressModel';
import {CalendarDays,ChartColumn,ChevronRight,Plus,Share2} from 'lucide-react';
import {useToast} from '../../../ui/Toast';
import './progress.css';
import {isFlagOn} from '../../../flags';


type Tab='overview'|'learning';
const minutes=(value:number)=>formatDuration(value);
/** Column charts label their axis in whole minutes below an hour and in hours above, so ticks fit the 40 px gutter. */
const axis=(value:number)=>value<60?Math.round(value)+' min':(Math.round(value/6)/10).toLocaleString('en')+' h';
const percent=(value:number)=>Math.round(value)+'%';
const tabWords:Record<Tab,string>={overview:'Overview',learning:'Learning'};
const confidenceWord={sure:'Sure',unsure:'Unsure',guess:'Guess'} as const;
const gradeColors=GRADE_KEYS.map(key=>GRADES[key].colour);

/** Overview and Learning share the hub, with the time log on its own route. */
export function ProgressTabs({current}:{current:Tab|'log'}){
 return <nav className="v7-hub-tabs" aria-label="Progress sections">
  {(['overview','learning'] as const).map(tab=><Link key={tab} to={'/insights'+(tab==='overview'?'':'?tab='+tab)} aria-current={current===tab?'page':undefined}>{tabWords[tab]}</Link>)}
  <Link to="/log" aria-current={current==='log'?'page':undefined}>Log</Link>
 </nav>;
}

function GoalCard({goal,entries,scope,onEdit}:{goal:GoalRecord;entries:StudyEntryRecord[];scope:string;onEdit:()=>void}){
 const view=goalView(goal,goalSavedMinutes(entries,goal,new Date().toISOString()),scope,new Date());
 return <li className="v7-goal">
  <div className="v7-goal-head"><p className="v7-eyebrow">{view.title}</p><Button variant="ghost" small onClick={onEdit}>Edit</Button></div>
  <p className="v7-goal-figure"><strong>{view.done}</strong> of {view.target}</p>
  <span className="v7-goal-meter" role="meter" aria-label={view.title} aria-valuemin={0} aria-valuemax={goal.targetMinutes} aria-valuenow={Math.round(view.fraction*goal.targetMinutes)} aria-valuetext={view.done+' of '+view.target}>
   <span style={{width:view.fraction*100+'%'}}/>{view.pace!==null&&<i style={{left:view.pace*100+'%'}} title="Even pace today"/>}</span>
  <p className="v7-meta">{view.rest}</p>
 </li>;
}
/** One range control for the figures and charts on Overview and Learning. */
export default function ProgressV7(){
 const studyRepair=useStudyUi();
 const [params,setParams]=useSearchParams(),settings=useSettings(),subjects=useSubjects(),notify=useToast();
 const tab:Tab=params.get('tab')==='learning'?'learning':'overview';
 const range:ProgressRange=asRange(params.get('range'));
 const zone=ownerZone(settings.data),now=useMemo(()=>new Date(),[]);
 const period=useMemo(()=>currentPeriod(range,now,zone),[range,now,zone]);
 const previous=useMemo(()=>previousPeriod(period,zone),[period,zone]);
 const almanac=useMemo(()=>almanacPeriod(now,zone),[now,zone]);
 const [entries,setEntries]=useState<StudyEntryRecord[]>([]),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading'),[reload,setReload]=useState(0);
 const [goals,setGoals]=useState<GoalRecord[]>([]),[editing,setEditing]=useState<GoalRecord|null|undefined>(undefined);
 const [details,setDetails]=useState(false);
 const insight=useInsightData(insightDays(range));
 useEffect(()=>{
  let alive=true;setStatus('loading');
  void (async()=>{
   const [rows,page]=await Promise.all([getStudyApi().listStudyEntries(coveringSpan(period,previous,almanac)),getGoalApi().listGoals({limit:10}).catch(()=>({items:[] as GoalRecord[]}))]);
   if(alive){setEntries(rows);setGoals(page.items);setStatus('ready');}
  })().catch(()=>{if(alive)setStatus('error');});
  return()=>{alive=false;};
 },[period,previous,almanac,reload]);
 const stamp=now.toISOString();
 const summary=useMemo(()=>status==='ready'?effortSummary(entries,period,zone,stamp):null,[status,entries,period,zone,stamp]);
 const before=useMemo(()=>status==='ready'?effortSummary(entries,previous,zone,stamp):null,[status,entries,previous,zone,stamp]);
 const daily=useMemo(()=>status==='ready'&&tab==='overview'?effortSummary(entries,almanac,zone,stamp).daily:[],[status,tab,entries,almanac,zone,stamp]);
 const name=(id:string)=>id==='unassigned'?'No subject':subjects.data?.find(item=>item.id===id)?.name??'Other subject';
 const color=(id:string)=>'var('+subjectToken(kitSubject(name(id)))+')';
 const groups=useMemo(()=>groupDays(period.days,range==='90'||range==='30'?7:1),[period,range]);
 const stacks=useMemo(()=>status==='ready'?stackColumns(entries,groups,zone,stamp):[],[status,entries,groups,zone,stamp]);
 const subjectIds=useMemo(()=>[...new Set(stacks.flatMap(column=>Object.keys(column.bySubject)))],[stacks]);
 const learn=useMemo(()=>{
  if(!insight.data)return null;
  return buildInsights(insight.data,insightDays(range),{timeZone:zone,rolloverHour:settings.data?.rolloverHour??4});
 },[insight.data,range,zone,settings.data?.rolloverHour]);
 const checkpoints=useMemo(()=>{
  const events=insight.data?.checkpointEvents??[];
  const start=Date.parse(period.span.start),end=Date.parse(period.span.end);
  return events.filter(event=>event.kind==='demonstrated'&&Date.parse(event.at)>=start&&Date.parse(event.at)<end);
 },[insight.data,period]);
 const target=Math.round((settings.data?.desiredRetention??.9)*100);
 function set(key:'range'|'tab',value:string){const next=new URLSearchParams(params);if(key==='tab'&&value==='overview')next.delete('tab');else next.set(key,value);setParams(next);}
 const chip=summary&&before&&before.minutes>0?changeChip(summary.minutes,before.minutes,range):null;
 const total=summary?.minutes??0;
 const tick=(day:string)=>formatShortDate(day,{zone}).split(' ').slice(1).join(' ');
 const columnLabel=(column:{from:string;to:string})=>column.from===column.to?formatShortDate(column.from,{zone}):formatShortDate(column.from,{zone})+' – '+formatShortDate(column.to,{zone});
 /** N131 · A5′: the weekly summary as a 1200 × 630 notebook-page image (drawn only when asked; the module loads then). */
 async function shareWeek(){
  if(!summary)return;
  try{
   const {shareCard}=await import('../../../ui/v7/shareImage');
   const outcome=await shareCard({kind:'week',minutes:summary.minutes,reviews:learn?.reviews??0,demonstrated:checkpoints.length,
    days:summary.daily.map(day=>day.minutes),range:formatShortDate(period.days[0],{zone})+' – '+formatShortDate(period.days[period.days.length-1],{zone})});
   if(outcome==='saved')notify('Image saved',{tone:'success'});
  }catch{notify('Could not make the image',{tone:'danger'});}
 }
 const hero=<section className="v7-progress-hero" aria-label="Focused time">
  {/* N221 (Owner report): the total is the screen's headline, with Your week beside it and one meta line beneath, so
      the chart starts higher. */}
  <div className="v7-progress-figure-row">
   <p className="v7-progress-figure">{formatDuration(total)}</p>
   {isFlagOn('v7Week')&&<Link className="v7-progress-week-link" to="/week">Your week<ChevronRight aria-hidden="true"/></Link>}
  </div>
  <div className="v7-progress-meta-row">
   {/* "Focused · range" stays its own text so it reads (and is found) as the figure's label. */}
   <p className="v7-meta"><span>Focused · {ranges.find(item=>item.value===range)?.label}</span>{!chip&&<span> · {range==='30'?'Your first month':'First in this range'}</span>}</p>
   {chip&&<StatusBadge tone={chip.tone}>{chip.text}</StatusBadge>}
  </div>
  {range==='7'&&summary&&<Button small variant="ghost" onClick={()=>{void shareWeek();}}><Share2 aria-hidden="true"/>Share this week</Button>}
 </section>;
 const nothing=<EmptyMoment art="progress" title="No study time yet" action={{label:'Start focus',to:'/?quick=1'}}/>;
 return <main id="main-content" className="v7-page v7-progress" aria-label="Progress">
  <HubHeader title={tab==='learning'&&isFlagOn('v7Room')?tabWords[tab]:'Progress'} titleFollowsTab={false} extraAction={<MoreActions label="Progress actions" title="Progress" items={[
   {label:'Add a goal',icon:<Plus/>,onClick:()=>setEditing(null)},
   {label:'Progress details',icon:<ChartColumn/>,onClick:()=>setDetails(true)},
   ...(isFlagOn('v7Week')?[{label:'Your week',icon:<CalendarDays/>,onClick:()=>{window.location.hash='/week';}}]:[]),
   ...(range==='7'?[{label:'Share this week',icon:<Share2/>,onClick:()=>{void shareWeek();}}]:[]),
  ]}/>}><ProgressTabs current={tab}/></HubHeader>
  {<Segmented label="Range" options={ranges.map(item=>item.label)} value={ranges.find(item=>item.value===range)!.label} onChange={label=>set('range',ranges.find(item=>item.label===label)!.value)}/>}
  {status==='loading'&&<Skeleton/>}
  {status==='error'&&<div role="alert" className="v7-progress-error"><p>Erratum: your saved study time didn’t load. Try again.</p><Button onClick={()=>setReload(value=>value+1)}>Retry</Button></div>}
  {status==='ready'&&summary&&tab==='overview'&&total<=0&&nothing}
  {status==='ready'&&summary&&tab==='overview'&&total>0&&<>
   {hero}
   <Chart title={range==='day'?'Focus today':range==='90'?'Focus by week':'Focus by day'} compact kind="bars" format={axis} totalFormat={minutes}
    data={stacks.map((column,index)=>({label:columnLabel(column),
      tickLabel:range==='30'&&index!==0&&index!==stacks.length-1?undefined:tick(column.from),values:[column.minutes]}))} series={[{label:'Focus'}]}/>
   {summary.exactParts.length>0&&<HorizontalBars title="By subject" format={minutes}
    data={summary.exactParts.map(part=>({label:name(part.id),subject:kitSubject(name(part.id)),value:part.minutes,color:color(part.id)}))}/>}
  </>}
  {status==='ready'&&tab==='learning'&&(learn?<>
   {learn.reviews===0?<EmptyMoment title="No reviews yet" action={{label:'Open review',to:'/review'}}/>:<>
   <Chart title="Recall over time" kind="line" target={target} format={percent} data={learn.recallBuckets.filter(bucket=>!studyRepair||bucket.recall!==null).map(bucket=>({label:columnLabel({from:bucket.date,to:bucket.endDate}),tickLabel:tick(bucket.date),values:[bucket.recall==null?0:bucket.recall*100]}))} series={[{label:'Recall'}]}/>
   <Chart title="Reviews by day" kind="stacked" data={learn.reviewBuckets.map(bucket=>({label:columnLabel({from:bucket.date,to:bucket.endDate}),tickLabel:tick(bucket.date),values:[bucket.again,bucket.hard,bucket.good,bucket.easy]}))}
    series={['Again','Hard','Good','Easy'].map((label,index)=>({label,color:isFlagOn('v7Room')&&index>0?'color-mix(in srgb, var(--v7-role-text-primary) '+[0,30,65,100][index]+'%, var(--v7-role-surface-page))':gradeColors[index]}))}/>
   <section className="v7-chart" aria-label="When you said"><h3 className="v7-headline">When you said</h3>
    {studyRepair&&!learn.calibration.some(row=>row.total>0)&&<p className="v7-meta">Choose a confidence before revealing an answer to see this summary.</p>}
    {learn.calibration.filter(row=>!studyRepair||row.total>0).map(row=><Meter key={row.confidence} label={confidenceWord[row.confidence]+(row.total?' · '+row.total+' answers':' · no answers')} value={row.rate==null?0:Math.round(row.rate*100)} max={100}/>)}
   </section>
   </>}
   {checkpoints.length>0&&<Chart title="Checkpoints demonstrated" kind="bars" data={groups.map(days=>({label:columnLabel({from:days[0],to:days[days.length-1]}),tickLabel:tick(days[0]),values:[checkpoints.filter(event=>{const day=civilDay(new Date(event.at),zone);return day>=days[0]&&day<=days[days.length-1];}).length]}))} series={[{label:'Demonstrated'}]}/>}
   {learn.minutes>0&&<StatTile label="Tutor sessions" value={formatDuration(learn.minutes)}/>}
  </>:<Skeleton/>)}
  {status==='ready'&&tab==='overview'&&(total>0||goals.length>0)&&<>
   <section id="progress-goals" aria-label="Goals" className="v7-goals">
    <div className="v7-card-heading"><h2 className="v7-learn-h2">Goals</h2><Button small onClick={()=>setEditing(null)}>Add a goal</Button></div>
    {goals.filter(goal=>!goal.archivedAt&&goal.endDate>=period.days[0]).length?<ul>{goals.filter(goal=>!goal.archivedAt&&goal.endDate>=period.days[0]).map(goal=>
     <GoalCard key={goal.id} goal={goal} entries={entries} scope={goal.subjectId?name(goal.subjectId):'All subjects'} onEdit={()=>setEditing(goal)}/>)}</ul>
     :<p className="v7-meta">No goals yet.</p>}
    {goals.some(goal=>goal.endDate<period.days[0])&&<><h3 className="v7-eyebrow">Past goals</h3><ul className="v7-goals-past">{goals.filter(goal=>goal.endDate<period.days[0]).map(goal=>{
     const view=goalView(goal,goalSavedMinutes(entries,goal,stamp),goal.subjectId?name(goal.subjectId):'All subjects',now);
     return <li key={goal.id}><span>{view.title}</span>{view.reached?<StatusBadge tone="success">Reached</StatusBadge>:<span className="v7-meta">{view.rest}</span>}</li>;})}</ul></>}
   </section>
  </>}
  {tab==='overview'&&daily.some(day=>day.minutes>0)&&<Heatmap title="Study almanac" format={minutes}
   data={daily.map(day=>({date:day.day,value:Math.round(day.minutes)}))}/>}
  <Sheet open={details} onClose={()=>setDetails(false)} title="Progress details">
   {details&&<>
   <div className="v7-progress-stats">
    <StatTile label="Reviews" value={learn?String(learn.reviews):'—'}/>
    <StatTile label="Recall" value={learn?.recall!=null?percent(learn.recall*100):'—'}/>
    <StatTile label="Checkpoints" value={String(checkpoints.length)}/>
   </div>
   {subjectIds.length>0?<Chart title="Time by subject" kind="stacked" format={axis} totalFormat={minutes}
    data={stacks.map(column=>({label:columnLabel(column),tickLabel:tick(column.from),values:subjectIds.map(id=>column.bySubject[id]??0)}))}
    series={subjectIds.map(id=>({label:name(id),color:color(id)}))}/>:<p>No subject time in this range.</p>}
   {summary&&insightSentences({parts:summary.exactParts,total,name,unsure:learn?.calibration.find(row=>row.confidence==='unsure')})
    .map(text=><p key={text} className="v7-progress-insight">{text}</p>)}
   {learn?.calibrationMessage&&<Disclosure label="Confidence details"><p>{learn.calibrationMessage}</p></Disclosure>}
   </>}
  </Sheet>
  {editing!==undefined&&<GoalEditor goal={editing} onClose={()=>setEditing(undefined)} onSaved={()=>setReload(value=>value+1)}/>}
 </main>;
}
