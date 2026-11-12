import {isFlagOn} from '../../flags';
import ProgressV6,{progressRange,rangeOptions,rangeWords} from '../progress-v6/Page';
import {lazy,Suspense,useEffect,useMemo,useState} from 'react';
import {v7Screen} from '../../app/v7Kit';
import {getStudyApi} from '../../data/study';
import {periodFor,effortSummary,type EffortRange} from '../progress-v6/model';
import {formatDuration} from '../../lib/format';
import {needsAttention,savedTimeIssues,type SavedTimeIssues} from './savedTimeIssues';
import {useSearchParams} from 'react-router';
import {useV6HeaderTitle} from '../../app/v6Title';
import {getMode} from '../../data/mode';
import {Clock,MessageCircle,Layers,Target} from 'lucide-react';
import {useInsightData,useSettings} from '../../data/hooks';
import {buildInsights} from '../../lib/insights';
import {formatCount,formatDurationMinutes} from '../../lib/text';
import {compactStudyTotal} from './study-total';
import {Segmented} from '../../ui/Segmented';
import {SectionHeading} from '../../ui/SectionHeading';
import {Slab} from '../../ui/Slab';
import {Tile} from '../../ui/Tile';
import {InkRecall} from './InkRecall';
import {CalibrationRules,SubjectRules,MostRevisitedLink} from './InkRules';
import {StackedBars} from '../../ui/charts/StackedBars';
import {GroupedBars} from '../../ui/charts/GroupedBars';
import type {InsightDays} from '../../data/api';
const percent=(n:number|null)=>n===null?'—':`${Math.round(n*100)}%`;
function LegacyInsights({fixedDays}:{fixedDays?:InsightDays}={}){
 const [chosenDays,setDays]=useState<InsightDays>(30);
 const days=fixedDays??chosenDays;
 const query=useInsightData(days),settings=useSettings();
 const values=useMemo(()=>query.data?buildInsights(query.data,days,{timeZone:settings.data?.timeZone??'UTC',rolloverHour:settings.data?.rolloverHour??4}):null,[query.data,days,settings.data?.timeZone,settings.data?.rolloverHour]);
 const legend=[{name:'Again',color:'bg-[var(--bad)]'},{name:'Hard',color:'bg-[var(--warn)]'},{name:'Good',color:'bg-[var(--grade-good)]'},{name:'Easy',color:'bg-[var(--easy)]'}];
 const studyTotal=values?compactStudyTotal(values.minutes):null;
 return <section className="flex flex-col gap-5 pb-2">
  {fixedDays?<h2 className="sr-only">Insights</h2>:<h1 className="text-title font-semibold" style={{fontFamily:"var(--font-display)"}}>Insights</h1>}
  {!fixedDays&&<Segmented label="Time range" tone="amber" value={String(days)} onChange={value=>setDays(Number(value) as InsightDays)} options={[{value:'7',label:'7 days'},{value:'30',label:'30 days'},{value:'90',label:'90 days'}]}/>}
  {query.isPending||settings.isPending?<p role="status" className="text-ink-2">Loading insights…</p>
  :query.isError||settings.isError?<div role="alert">Couldn’t load insights. <button className="text-amber" onClick={()=>{void query.refetch();void settings.refetch()}}>Try again</button></div>
  :values&&<>
  <div className="grid grid-cols-3 gap-2.5" aria-label="Study totals">
   <Tile className="min-w-0 overflow-hidden p-[var(--pad-tile)]"><Clock size={17} className="mb-2 text-ink-2"/><strong data-study-total-visible aria-hidden="true" title={studyTotal?.exact} className="block whitespace-nowrap text-[clamp(0.9rem,4vw,1.6rem)] font-medium tabular-nums" style={{fontFamily:"var(--font-num)"}}>{studyTotal?.short}</strong><span data-study-total-exact className="sr-only">{fixedDays?'Tutor sessions':'Studied'} {studyTotal?.exact}</span><span aria-hidden="true" className="text-xs text-ink-2">{fixedDays?'in tutor sessions':'studied'}</span></Tile>
   <Tile className="min-w-0 overflow-hidden p-[var(--pad-tile)]"><MessageCircle size={17} className="mb-2 text-ink-2"/><strong className="block whitespace-nowrap text-[clamp(0.9rem,4vw,1.6rem)] font-medium tabular-nums" style={{fontFamily:"var(--font-num)"}}>{formatCount(values.sessions)}</strong><span className="text-xs text-ink-2">{fixedDays?'tutor sessions':'sessions'}</span></Tile>
   <Tile className="min-w-0 overflow-hidden p-[var(--pad-tile)]"><Layers size={17} className="mb-2 text-ink-2"/><strong className="block whitespace-nowrap text-[clamp(0.9rem,4vw,1.6rem)] font-medium tabular-nums" style={{fontFamily:"var(--font-num)"}}>{formatCount(values.reviews)}</strong><span className="text-xs text-ink-2">reviews</span></Tile>
  </div>
  <Slab className="flex flex-col gap-3 p-4"><div className="flex items-center justify-between"><SectionHeading>Recall</SectionHeading><strong className="text-num-l font-medium tabular-nums text-ink" style={{fontFamily:"var(--font-num)"}}>{percent(values.recall)}</strong></div>
   <InkRecall data={values.recallBuckets.map((row,i)=>({label:i===0?`${days} days ago`:i===values.recallBuckets.length-1?'Today':'',value:row.recall}))} target={settings.data?.desiredRetention??0.9}/>
  </Slab>
  <Slab className="flex flex-col gap-3 p-4"><SectionHeading>Reviews by {days===90?'week':'day'}</SectionHeading>
   <div className="flex flex-wrap gap-3 text-caption text-ink-2">{legend.map(g=><span key={g.name} data-review-grade={g.name.toLowerCase()} className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${g.color}`}/>{g.name}</span>)}</div>
   <StackedBars data={values.reviewBuckets.map((row,i)=>({label:days===7?['M','T','W','T','F','S','S'][i]||'':days===90?`W${i+1}`:String(i+1),again:row.again,hard:row.hard,good:row.good,easy:row.easy}))}/>
  </Slab>
  <Slab className="flex flex-col gap-3 p-4"><SectionHeading>When you said</SectionHeading><CalibrationRules data={values.calibration}/>{values.calibrationMessage&&<p className="border-l-2 border-[var(--ink-2)] pl-3 font-math text-label italic text-ink-2">{values.calibrationMessage}</p>}</Slab>
  <Slab className="flex flex-col gap-3 p-4"><SectionHeading>Time by subject</SectionHeading><SubjectRules data={values.subjects} format={formatDurationMinutes}/></Slab>
  <Slab className="flex flex-col gap-3 p-4"><SectionHeading>Checkpoints</SectionHeading><GroupedBars data={values.checkpointWeeks} tone="ink"/></Slab>
  <div className="grid grid-cols-2 gap-3">
   <Tile><Target size={20} className="mb-3 text-ink-2"/><span className="block text-label text-ink-2">Typical session</span><strong className="text-xl">{values.typicalSession===null?'—':formatDurationMinutes(Math.round(values.typicalSession))}</strong></Tile>
   <MostRevisitedLink conceptName={values.mostRevisited?.conceptName} label={values.mostRevisited?.label}/>
  </div>
  </>}
 </section>;
}

const views=[{value:'overview',label:'Overview'},{value:'learning',label:'Learning'},{value:'time',label:'Time'}] as const;
type View=typeof views[number]['value'];
function rangeCaption(range:EffortRange){
 const days=range==='day'?1:Number(range);
 const end=new Date(),start=new Date(end.getTime()-(days-1)*86_400_000);
 const f=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short'});
 return days===1?'Today · '+f.format(end):f.format(start)+' – '+f.format(end)+' · '+days+' days';
}
/** N115 (mockup `22__Page`, `55__insights`): Overview / Learning / Time tabs and stat tiles.
 * N121 D1: one "Time range" control, one study-time source (saved focus) and range-matched tiles. */
function ProgressNotebook(){
 // #1330: the mockup header carries the subtitle, above its rule.
 useV6HeaderTitle('Progress','Small steps, seen over time.');
 const [params,setParams]=useSearchParams();
 // The mockup and the pre-N121 page open on 30 days; ?range=day still shows today.
 const range=progressRange(params.get('range'),'30');
 // Insight aggregates come in 7, 30 or 90 days; Today reads the 7-day data and keeps only today's reviews.
 const days:InsightDays=range==='30'||range==='90'?Number(range) as InsightDays:7;
 const rawView=params.get('view');
 const view:View=rawView==='learning'||rawView==='time'?rawView:'overview';
 const query=useInsightData(days),settings=useSettings();
 const values=useMemo(()=>query.data?buildInsights(query.data,days,{timeZone:settings.data?.timeZone??'UTC',rolloverHour:settings.data?.rolloverHour??4}):null,[query.data,days,settings.data?.timeZone,settings.data?.rolloverHour]);
 const [issues,setIssues]=useState<SavedTimeIssues|null>(null);
 const [savedMinutes,setSavedMinutes]=useState<number|null>(null);
 useEffect(()=>{
  let alive=true;
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
  const period=periodFor(range,new Date(),zone);
  void getStudyApi().listStudyEntries(period.span).then(rows=>{if(alive){setIssues(savedTimeIssues(rows,new Date().toISOString()));setSavedMinutes(effortSummary(rows,period,zone,new Date().toISOString()).minutes);}})
   .catch(()=>{if(alive){setIssues(null);setSavedMinutes(null);}});
  return()=>{alive=false;};
 },[range]);
 const set=(key:string,value:string)=>{const next=new URLSearchParams(params);next.set(key,value);setParams(next);};
 const metric=(label:string,value:string,note:string)=><div className="notebook-metric" role="group" aria-label={label}>
  <span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
 // Reviews and recall within the chosen range: today from the raw answers when the adapter has them.
 const zone=settings.data?.timeZone??'UTC';
 const todayKey=new Intl.DateTimeFormat('en-CA',{timeZone:zone}).format(new Date());
 const todays=range==='day'&&query.data?.reviews.length?query.data.reviews.filter(r=>new Intl.DateTimeFormat('en-CA',{timeZone:zone}).format(new Date(r.reviewedAt))===todayKey):null;
 const reviewCount=todays?todays.length:values?.reviews??0;
 const recall=todays?(todays.length?todays.filter(r=>r.rating!==1).length/todays.length:null):values?.recall??null;
 const weeks=Math.max(1,Math.ceil((range==='day'?1:Number(range))/7));
 const demonstrated=values?values.checkpointWeeks.slice(-weeks).reduce((n,w)=>n+w.demonstrated,0):0;
 const words=rangeWords(range);
 return <div className="notebook-progress">
  {getMode()==='demo'&&<div className="notebook-page-intro"><small className="lemma-sample-label basis-full">Example workspace · demonstration history</small></div>}
  <Segmented label="Time range" value={range} onChange={value=>set('range',value)} options={rangeOptions}/>
  <Segmented label="Progress views" value={view} onChange={value=>set('view',value)} options={[...views]}/>
  {needsAttention(issues)&&<div role="status" className="lemma-log-warning">
   <p>Some saved time entries overlap or need correction. Each minute is counted once.</p>
   <a href="#/log" className="inline-flex min-h-11 items-center text-[var(--link)] underline underline-offset-4">Check your log</a>
  </div>}
  <div className="notebook-progress-content">
   {view==='overview'&&<>
    <p className="notebook-range-caption">{rangeCaption(range)}</p>
    <div className="notebook-metrics" aria-label="Progress summary">
     <section aria-label="Total logged time" className="notebook-metric">
      <span>Total logged time</span><strong>{savedMinutes===null?'—':formatDuration(savedMinutes)}</strong><small>Saved focus · {words}</small></section>
     {query.isPending||settings.isPending?<p role="status" className="text-ink-2">Loading insights…</p>:
      query.isError||settings.isError?<div role="alert" className="lemma-log-warning">Couldn’t load insights. <button type="button" onClick={()=>{void query.refetch();void settings.refetch()}}>Try again</button></div>:
      values&&<>
       {metric('Reviews completed',formatCount(reviewCount),'Answers · '+words)}
       {metric('Recall on review',percent(recall),'Remembered · '+words)}
       {metric('Checkpoints demonstrated',formatCount(demonstrated),range==='day'?'This week':'Last '+weeks+' weeks')}
      </>}
    </div>
    <ProgressV6 defaultRange="30" controls={false} variant="compact"/>
   </>}
   {view==='learning'&&<LegacyInsights fixedDays={days}/>}
   {view==='time'&&<>
    <ProgressV6 defaultRange="30" controls={false}/>
    <a href="#/log" className="notebook-concept-entry"><span>Open your time log</span><span aria-hidden="true">›</span></a>
   </>}
  </div>
 </div>;
}

/** Flag-off Insights stays exactly as before; v6 shows the mockup Progress notebook. */
const ProgressV7=lazy(()=>import('./v7/ProgressV7'));
export default function Page(){
 // v7 Progress (PLAN §6.13) behind v7Shell; v6 and legacy stay for rollback.
 if(v7Screen()==='progress')return <Suspense fallback={<div role="status" aria-label="Progress loading" className="min-h-dvh"/>}><ProgressV7/></Suspense>;
 return isFlagOn('v6Shell')?<ProgressNotebook/>:<LegacyInsights/>;
}
