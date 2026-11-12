import {GradeGlyph} from '../../../ui/v7/grades';
import {useEffect,useMemo,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {Check} from 'lucide-react';
import {useQuery} from '@tanstack/react-query';
import {getApi} from '../../../data';
import {useDeckTree,useReviewItems} from '../../../data/hooks';
import type {QueueFilter} from '../../../data/types';
import {Button} from '../../../ui/v7/components';
import {getRun,type DurableRun} from '../../review-run/v6/adapter';
import {offerNotificationsOnce} from '../../../platform/permissions';
import {defaultSelection,reviewBatch} from '../../review/v6/selection';
import {clock,roundSummary,type GradeSplit} from '../../review/v7/reviewModel';
import {useStartRound} from '../../review/v7/useStartRound';
import {LottieMoment} from '../../../ui/v7/LottieMoment';
import '../../review/v7/review-hub.css';

const allFilter:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};
const grades:(keyof GradeSplit)[]=['again','hard','good','easy'];
const gradeName:Record<keyof GradeSplit,string>={again:'Again',hard:'Hard',good:'Good',easy:'Easy'};
const MORE=10;

/** PLAN §6.4 C: Round complete. Counts come from the saved run and its recorded reviews, never from in-memory answers. */
export default function RoundCompleteV7(){
 const [search]=useSearchParams(),navigate=useNavigate(),id=search.get('run');
 const [run,setRun]=useState<DurableRun|null>(null),[error,setError]=useState<string|null>(null);
 // N123 · N1: the first finished round is the moment the Android app asks once for notification permission.
 useEffect(()=>{if(run)void offerNotificationsOnce();},[run]);
 useEffect(()=>{
  let live=true;
  if(!id){setError('No completed review-run ID');return;}
  void getRun(id).then(value=>{if(live)setRun(value);if(live&&!value)setError('This review round was not found.');})
   .catch(failure=>{if(live)setError(failure instanceof Error?failure.message:'Could not restore results');});
  return()=>{live=false;};
 },[id]);
 const insights=useQuery({queryKey:['insights','round',id],queryFn:()=>getApi().getInsightData(7),enabled:!!run,staleTime:0});
 const forecast=useQuery({queryKey:['review-forecast'],queryFn:()=>getApi().getReviewForecast(),staleTime:0});
 const decks=useDeckTree(),cards=useReviewItems(allFilter);
 const {start,busy,issue}=useStartRound();
 const summary=useMemo(()=>run?roundSummary(insights.data?.reviews??[],{startedAt:run.startedAt,endedAt:run.endedAt,graded:run.progress.graded}):null,[run,insights.data]);
 const nodes=useMemo(()=>(decks.data??[]).filter(node=>node.due>0||node.children.some(child=>child.due>0)),[decks.data]);
 const more=useMemo(()=>{
  const selected=defaultSelection(nodes);
  return {selected,batch:reviewBatch(nodes,cards.data??[],selected,MORE).batch};
 },[nodes,cards.data]);
 const tomorrow=forecast.data?.[1]?.due;
 const showBar=!!summary&&summary.counted>0;
 return <main id="main-content" className="v7-page v7-rc" aria-label="Review results">
  {run?.progress.done?<LottieMoment name="review" animation="round-complete" width={144} className="v7-rc-art"/>
   :<span className="v7-rc-proof" aria-hidden="true"><Check/></span>}
  <h1 className="v7-rc-title">{run&&!run.progress.done?'Round paused':'Round complete'}</h1>
  {error&&<p role="alert" className="v7-rv-note">{error}</p>}
  {!run&&!error&&<p role="status" className="v7-rv-note">Loading saved review results…</p>}
  {run&&summary&&<>
   {run.progress.skipped>0&&<p className="v7-rv-note">{run.progress.skipped} {run.progress.skipped===1?'card was':'cards were'} skipped because {run.progress.skipped===1?'it':'they'} changed since you started.</p>}
   {!run.progress.done&&<p role="status" className="v7-rv-note">{run.progress.remaining} cards are still waiting in this round.</p>}
   <section className="v7-rc-tiles" aria-label="Round statistics">
    <div className="v7-stat"><p className="v7-meta">Cards</p><p className="v7-figure-m">{summary.cards}</p></div>
    <div className="v7-stat"><p className="v7-meta">Time</p><p className="v7-figure-m">{summary.seconds>0?clock(summary.seconds):'–'}</p></div>
    <div className="v7-stat"><p className="v7-meta">Recalled first try</p><p className="v7-figure-m">{summary.recalledPct===null?'–':summary.recalledPct+'%'}</p></div>
   </section>
   {showBar&&<section aria-label="How the round went">
    <ul className="v7-rc-bar" role="img" aria-label={grades.map(name=>summary.grades[name]+' '+gradeName[name]).join(', ')}>
     {grades.filter(name=>summary.grades[name]>0).map(name=><li key={name} data-grade={name} style={{flexGrow:summary.grades[name]}}>{summary.grades[name]}</li>)}
    </ul>
    <ul className="v7-rc-legend">{grades.map(name=><li key={name} data-grade={name}><GradeGlyph grade={name} size={14}/>{gradeName[name]}</li>)}</ul>
   </section>}
   {tomorrow!==undefined&&<p className="v7-rv-note" aria-label="Next round">Next: {tomorrow.toLocaleString()} {tomorrow===1?'card':'cards'} tomorrow</p>}
  </>}
  {issue&&<p role="alert" className="v7-rv-note">{issue}</p>}
  <div className="v7-rc-actions">
   <Button variant="primary" onClick={()=>navigate('/')}>Done</Button>
   {more.batch.length>0&&<Button loading={busy} onClick={()=>{void start(more.batch,[...more.selected]);}}>Review {more.batch.length} more</Button>}
  </div>
 </main>;
}
