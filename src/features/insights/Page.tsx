import {useMemo,useState} from 'react';
import {Link} from 'react-router';
import {Clock,MessageCircle,Layers,Target,RotateCcw,Waypoints} from 'lucide-react';
import {useInsightData,useSettings} from '../../data/hooks';
import {buildInsights} from '../../lib/insights';
import {Segmented} from '../../ui/Segmented';
import {Slab} from '../../ui/Slab';
import {Tile} from '../../ui/Tile';
import {LineArea} from '../../ui/charts/LineArea';
import {StackedBars} from '../../ui/charts/StackedBars';
import {CalibrationBars} from '../../ui/charts/CalibrationBars';
import {HBars} from '../../ui/charts/HBars';
import {GroupedBars} from '../../ui/charts/GroupedBars';
import type {InsightDays} from '../../data/api';
const duration=(n:number)=>`${Math.floor(n/60)}h ${n%60}m`;
const percent=(n:number|null)=>n===null?'—':`${Math.round(n*100)}%`;
export default function Page(){
 const [days,setDays]=useState<InsightDays>(30);
 const query=useInsightData(days),settings=useSettings();
 const values=useMemo(()=>query.data?buildInsights(query.data,days,{timeZone:settings.data?.timeZone??'UTC',rolloverHour:settings.data?.rolloverHour??4}):null,[query.data,days,settings.data?.timeZone,settings.data?.rolloverHour]);
 const legend=[{name:'Again',color:'bg-again'},{name:'Hard',color:'bg-hard'},{name:'Good',color:'bg-good'},{name:'Easy',color:'bg-easy'}];
 return <section className="flex flex-col gap-5 pb-2">
  <h1 className="text-title font-semibold">Insights</h1>
  <Segmented label="Time range" tone="amber" value={String(days)} onChange={value=>setDays(Number(value) as InsightDays)} options={[{value:'7',label:'7 days'},{value:'30',label:'30 days'},{value:'90',label:'90 days'}]}/>
  {query.isPending||settings.isPending?<p role="status" className="text-ink-2">Loading insights…</p>
  :query.isError||settings.isError?<div role="alert">Couldn’t load insights. <button className="text-amber" onClick={()=>{void query.refetch();void settings.refetch()}}>Try again</button></div>
  :values&&<>
  <div className="grid grid-cols-3 gap-2.5">
   <Tile className="min-w-0 overflow-hidden p-[var(--pad-tile)]"><Clock size={17} className="mb-2 text-amber"/><strong className="block whitespace-nowrap text-[clamp(0.8rem,3.7vw,var(--type-headline))] font-semibold">{duration(values.minutes)}</strong><span className="text-xs text-ink-2">studied</span></Tile>
   <Tile className="min-w-0 overflow-hidden p-[var(--pad-tile)]"><MessageCircle size={17} className="mb-2 text-amber"/><strong className="block whitespace-nowrap text-title font-semibold">{values.sessions}</strong><span className="text-xs text-ink-2">sessions</span></Tile>
   <Tile className="min-w-0 overflow-hidden p-[var(--pad-tile)]"><Layers size={17} className="mb-2 text-amber"/><strong className="block whitespace-nowrap text-title font-semibold">{values.reviews}</strong><span className="text-xs text-ink-2">reviews</span></Tile>
  </div>
  <Slab className="flex flex-col gap-3"><div className="flex items-center justify-between"><h2 className="text-title-s font-semibold">Recall</h2><strong className="text-num-l font-semibold text-amber">{percent(values.recall)}</strong></div>
   <LineArea data={values.recallBuckets.map((row,i)=>({label:i===0?`${days} days ago`:i===values.recallBuckets.length-1?'Today':'',value:row.recall}))} target={settings.data?.desiredRetention??0.9}/>
  </Slab>
  <Slab className="flex flex-col gap-3"><h2 className="text-title-s font-semibold">Reviews by {days===90?'week':'day'}</h2>
   <div className="flex flex-wrap gap-3 text-caption text-ink-2">{legend.map(g=><span key={g.name} className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${g.color}`}/>{g.name}</span>)}</div>
   <StackedBars data={values.reviewBuckets.map((row,i)=>({label:days===7?['M','T','W','T','F','S','S'][i]||'':days===90?`W${i+1}`:String(i+1),again:row.again,hard:row.hard,good:row.good,easy:row.easy}))}/>
  </Slab>
  <Slab className="flex flex-col gap-3"><h2 className="text-title-s font-semibold">When you said</h2><CalibrationBars data={values.calibration}/>{values.calibrationMessage&&<p className="text-label text-ink-2">{values.calibrationMessage}</p>}</Slab>
  <Slab className="flex flex-col gap-3"><h2 className="text-title-s font-semibold">Time by subject</h2><HBars data={values.subjects.map(row=>({label:row.subject.name,glyph:row.subject.glyph,value:row.minutes,display:duration(row.minutes)}))}/></Slab>
  <Slab className="flex flex-col gap-3"><h2 className="text-title-s font-semibold">Checkpoints</h2><GroupedBars data={values.checkpointWeeks}/></Slab>
  <div className="grid grid-cols-2 gap-3">
   <Tile><Target size={20} className="mb-3 text-amber"/><span className="block text-label text-ink-2">Typical session</span><strong className="text-xl">{values.typicalSession===null?'—':duration(Math.round(values.typicalSession))}</strong></Tile>
   <Link to={values.mostRevisited?.conceptName?`/atlas?focus=${encodeURIComponent(values.mostRevisited.conceptName.toLowerCase().replace(/[^a-z0-9]+/g,'-'))}`:'/atlas'} className="tile">
    <div className="mb-3 flex items-center justify-between text-amber"><RotateCcw size={20}/><Waypoints size={16}/></div><span className="block text-label text-ink-2">Most revisited</span><strong className="text-headline">{values.mostRevisited?.conceptName||values.mostRevisited?.label||'No repeats yet'}</strong>
   </Link>
  </div>
  </>}
 </section>;
}
