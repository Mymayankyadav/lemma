import {useEffect,useMemo,useState} from 'react';
import {useLocation} from 'react-router';
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
function requestedDays(search:string):InsightDays{
 const value=new URLSearchParams(search).get('days');
 return value==='7'?7:value==='90'?90:30;
}
export default function Page(){
 const location=useLocation();
 const [days,setDays]=useState<InsightDays>(()=>requestedDays(location.search));
 useEffect(()=>setDays(requestedDays(location.search)),[location.search]);
 const query=useInsightData(days),settings=useSettings();
 const values=useMemo(()=>query.data?buildInsights(query.data,days,{timeZone:settings.data?.timeZone??'UTC',rolloverHour:settings.data?.rolloverHour??4}):null,[query.data,days,settings.data?.timeZone,settings.data?.rolloverHour]);
 const legend=[{name:'Again',color:'bg-[var(--bad)]'},{name:'Hard',color:'bg-[var(--warn)]'},{name:'Good',color:'bg-[var(--grade-good)]'},{name:'Easy',color:'bg-[var(--easy)]'}];
 const studyTotal=values?compactStudyTotal(values.minutes):null;
 return <section className="flex flex-col gap-5 pb-2">
  <h1 className="text-title font-semibold" style={{fontFamily:"var(--font-display)"}}>Insights</h1>
  <Segmented label="Time range" tone="amber" value={String(days)} onChange={value=>setDays(Number(value) as InsightDays)} options={[{value:'7',label:'7 days'},{value:'30',label:'30 days'},{value:'90',label:'90 days'}]}/>
  {query.isPending||settings.isPending?<p role="status" className="text-ink-2">Loading insights…</p>
  :query.isError||settings.isError?<div role="alert">Couldn’t load insights. <button className="text-amber" onClick={()=>{void query.refetch();void settings.refetch()}}>Try again</button></div>
  :values&&<>
  <div className="grid grid-cols-3 gap-2.5" aria-label="Study totals">
   <Tile className="min-w-0 overflow-hidden p-[var(--pad-tile)]"><Clock size={17} className="mb-2 text-ink-2"/><strong data-study-total-visible aria-hidden="true" title={studyTotal?.exact} className="block whitespace-nowrap text-[clamp(0.9rem,4vw,1.6rem)] font-medium tabular-nums" style={{fontFamily:"var(--font-num)"}}>{studyTotal?.short}</strong><span data-study-total-exact className="sr-only">Studied {studyTotal?.exact}</span><span aria-hidden="true" className="text-xs text-ink-2">studied</span></Tile>
   <Tile className="min-w-0 overflow-hidden p-[var(--pad-tile)]"><MessageCircle size={17} className="mb-2 text-ink-2"/><strong className="block whitespace-nowrap text-[clamp(0.9rem,4vw,1.6rem)] font-medium tabular-nums" style={{fontFamily:"var(--font-num)"}}>{formatCount(values.sessions)}</strong><span className="text-xs text-ink-2">sessions</span></Tile>
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
