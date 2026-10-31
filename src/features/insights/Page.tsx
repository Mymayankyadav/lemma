import {useMemo,useState} from 'react';
import {Clock,MessageCircle,Layers,Target} from 'lucide-react';
import {useInsightData,useSettings} from '../../data/hooks';
import {buildInsights} from '../../lib/insights';
import {formatCount,formatDurationMinutes} from '../../lib/text';
import {Segmented} from '../../ui/Segmented';
import {Slab} from '../../ui/Slab';
import {Tile} from '../../ui/Tile';
import {InkRecall} from './InkRecall';
import {CalibrationRules,SubjectRules,MostRevisitedLink} from './InkRules';
import {StackedBars} from '../../ui/charts/StackedBars';
import {GroupedBars} from '../../ui/charts/GroupedBars';
import type {InsightDays} from '../../data/api';
const percent=(n:number|null)=>n===null?'—':`${Math.round(n*100)}%`;
export default function Page(){
 const [days,setDays]=useState<InsightDays>(30);
 const query=useInsightData(days),settings=useSettings();
 const values=useMemo(()=>query.data?buildInsights(query.data,days,{timeZone:settings.data?.timeZone??'UTC',rolloverHour:settings.data?.rolloverHour??4}):null,[query.data,days,settings.data?.timeZone,settings.data?.rolloverHour]);
 const legend=[{name:'Again',color:'bg-[var(--bad)]'},{name:'Hard',color:'bg-[var(--warn)]'},{name:'Good',color:'bg-[var(--grade-good)]'},{name:'Easy',color:'bg-[var(--good)]'}];
 return <section className="flex flex-col gap-5 pb-2">
  <h1 className="text-title font-semibold" style={{fontFamily:"var(--font-display)"}}>Insights</h1>
  <Segmented label="Time range" tone="amber" value={String(days)} onChange={value=>setDays(Number(value) as InsightDays)} options={[{value:'7',label:'7 days'},{value:'30',label:'30 days'},{value:'90',label:'90 days'}]}/>
  {query.isPending||settings.isPending?<p role="status" className="text-ink-2">Loading insights…</p>
  :query.isError||settings.isError?<div role="alert">Couldn’t load insights. <button className="text-amber" onClick={()=>{void query.refetch();void settings.refetch()}}>Try again</button></div>
  :values&&<>
  <div className="grid grid-cols-3 gap-2.5" aria-label="Study totals">
   <Tile className="min-w-0 overflow-hidden p-[var(--pad-tile)]"><Clock size={17} className="mb-2 text-amber"/><strong className="block whitespace-nowrap text-[clamp(0.9rem,4vw,1.6rem)] font-medium tabular-nums" style={{fontFamily:"var(--font-num)"}}>{formatDurationMinutes(values.minutes)}</strong><span className="text-xs text-ink-2">studied</span></Tile>
   <Tile className="min-w-0 overflow-hidden p-[var(--pad-tile)]"><MessageCircle size={17} className="mb-2 text-amber"/><strong className="block whitespace-nowrap text-[clamp(0.9rem,4vw,1.6rem)] font-medium tabular-nums" style={{fontFamily:"var(--font-num)"}}>{formatCount(values.sessions)}</strong><span className="text-xs text-ink-2">sessions</span></Tile>
   <Tile className="min-w-0 overflow-hidden p-[var(--pad-tile)]"><Layers size={17} className="mb-2 text-amber"/><strong className="block whitespace-nowrap text-[clamp(0.9rem,4vw,1.6rem)] font-medium tabular-nums" style={{fontFamily:"var(--font-num)"}}>{formatCount(values.reviews)}</strong><span className="text-xs text-ink-2">reviews</span></Tile>
  </div>
  <Slab className="flex flex-col gap-3 p-4"><div className="flex items-center justify-between"><h2 className="text-title-s font-medium" style={{fontFamily:"var(--font-display)"}}>Recall</h2><strong className="text-num-l font-medium tabular-nums text-amber" style={{fontFamily:"var(--font-num)"}}>{percent(values.recall)}</strong></div>
   <InkRecall data={values.recallBuckets.map((row,i)=>({label:i===0?`${days} days ago`:i===values.recallBuckets.length-1?'Today':'',value:row.recall}))} target={settings.data?.desiredRetention??0.9}/>
  </Slab>
  <Slab className="flex flex-col gap-3 p-4"><h2 className="text-title-s font-medium" style={{fontFamily:"var(--font-display)"}}>Reviews by {days===90?'week':'day'}</h2>
   <div className="flex flex-wrap gap-3 text-caption text-ink-2">{legend.map(g=><span key={g.name} data-review-grade={g.name.toLowerCase()} className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${g.color}`}/>{g.name}</span>)}</div>
   <StackedBars data={values.reviewBuckets.map((row,i)=>({label:days===7?['M','T','W','T','F','S','S'][i]||'':days===90?`W${i+1}`:String(i+1),again:row.again,hard:row.hard,good:row.good,easy:row.easy}))}/>
  </Slab>
  <Slab className="flex flex-col gap-3 p-4"><h2 className="text-title-s font-medium" style={{fontFamily:"var(--font-display)"}}>When you said</h2><CalibrationRules data={values.calibration}/>{values.calibrationMessage&&<p className="border-l-2 border-amber pl-3 font-math text-label italic text-ink-2">{values.calibrationMessage}</p>}</Slab>
  <Slab className="flex flex-col gap-3 p-4"><h2 className="text-title-s font-medium" style={{fontFamily:"var(--font-display)"}}>Time by subject</h2><SubjectRules data={values.subjects} format={formatDurationMinutes}/></Slab>
  <Slab className="flex flex-col gap-3 p-4"><h2 className="text-title-s font-medium" style={{fontFamily:"var(--font-display)"}}>Checkpoints</h2><GroupedBars data={values.checkpointWeeks}/></Slab>
  <div className="grid grid-cols-2 gap-3">
   <Tile><Target size={20} className="mb-3 text-amber"/><span className="block text-label text-ink-2">Typical session</span><strong className="text-xl">{values.typicalSession===null?'—':formatDurationMinutes(Math.round(values.typicalSession))}</strong></Tile>
   <MostRevisitedLink conceptName={values.mostRevisited?.conceptName} label={values.mostRevisited?.label}/>
  </div>
  </>}
 </section>;
}
