import {useEffect,useMemo,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router';
import {useQuery} from '@tanstack/react-query';
import {getApi} from '../../../data';
import {useDeckTree,useHome,useInsightData,useReviewItems,useSettings} from '../../../data/hooks';
import type {DeckNode,QueueFilter} from '../../../data/types';
import {HubHeader} from '../../../app/v7/V7Shell';
import {Button,Sheet,Switch} from '../../../ui/v7/components';
import {Chart} from '../../../ui/v7/Chart';
import {subjectClass,type Subject} from '../../../ui/v7/Subject';
import {kitSubject} from '../../atlas/v7/model';
import {resumeRun,type DurableRun} from '../../review-run/v6/adapter';
import {useReviewEstimate} from '../v6/estimate';
import {defaultSelection,reviewBatch} from '../v6/selection';
import {activeSubject,forecastBars,memoryStats,selectionFor,selectionForSlug,slugOf,subjectSegments} from './reviewModel';
import {useStartRound} from './useStartRound';
import './review-hub.css';

const allFilter:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};
const visibleDue=(node:DeckNode)=>node.due>0||node.children.some(child=>child.due>0);
const keysFor=(node:DeckNode)=>[node.key,...node.children.filter(child=>child.due>0).map(child=>child.key)];

/** PLAN §6.4 A: the review hub. One count, one button, then the shape of the week and the decks behind it. */
export default function ReviewHubV7(){
 const navigate=useNavigate(),[params]=useSearchParams(),pathSlug=params.get('path');
 const decks=useDeckTree(),cards=useReviewItems(allFilter),settings=useSettings(),home=useHome(),insights=useInsightData(30);
 const forecast=useQuery({queryKey:['review-forecast'],queryFn:()=>getApi().getReviewForecast(),staleTime:60_000});
 const [active,setActive]=useState<DurableRun|null>(null),[selected,setSelected]=useState<Set<string>|null>(null),[sheet,setSheet]=useState(false);
 const {start,busy,issue}=useStartRound();
 useEffect(()=>{
  let live=true;
  void resumeRun().then(run=>{if(live)setActive(run);}).catch(()=>{/* No saved run is not an error. */});
  return()=>{live=false;};
 },[]);
 const nodes=useMemo(()=>(decks.data??[]).filter(visibleDue),[decks.data]);
 const subjectBySlug=useMemo(()=>new Map((home.data?.projects??[]).map(project=>[project.slug,kitSubject(project.subject.name)])),[home.data]);
 const subjectOf=useMemo(()=>(slug:string):Subject=>subjectBySlug.get(slug)??'Other',[subjectBySlug]);
 const scoped=useMemo(()=>!!pathSlug&&selectionForSlug(nodes,pathSlug).size>0,[nodes,pathSlug]);
 const enabled=useMemo(()=>{
  if(selected)return selected;
  const only=pathSlug?selectionForSlug(nodes,pathSlug):null;
  return only&&only.size?only:defaultSelection(nodes);
 },[selected,nodes,pathSlug]);
 const quota=settings.data?.reviewsPerDay??0;
 const result=useMemo(()=>reviewBatch(nodes,cards.data??[],enabled,quota),[nodes,cards.data,enabled,quota]);
 const segments=useMemo(()=>subjectSegments(nodes,subjectOf),[nodes,subjectOf]);
 const current=useMemo(()=>activeSubject(nodes,subjectOf,enabled),[nodes,subjectOf,enabled]);
 const minutes=useReviewEstimate(result.batch.length);
 const memory=useMemo(()=>memoryStats(insights.data?.reviews??[]),[insights.data]);
 const bars=useMemo(()=>forecastBars(forecast.data??[]),[forecast.data]);
 const loading=decks.isPending||cards.isPending||settings.isPending;
 const failed=!!(decks.error||cards.error||settings.error);
 function toggleProject(node:DeckNode,value:boolean){
  const next=new Set(enabled);
  for(const key of keysFor(node))value?next.add(key):next.delete(key);
  setSelected(next);
 }
 function toggleChild(project:DeckNode,child:DeckNode,value:boolean){
  const next=new Set(enabled);
  value?next.add(child.key):next.delete(child.key);
  if(project.children.filter(node=>node.due>0).every(node=>next.has(node.key)))next.add(project.key);else next.delete(project.key);
  setSelected(next);
 }
 const count=result.batch.length,totalDue=result.allDue;
 const note=count?(minutes===null?'Estimating time…':'About '+minutes+' min at your pace'):'Nothing selected for this round';
 return <main id="main-content" className="v7-page v7-rv" aria-label="Review">
  <HubHeader title="Review" settings/>
  {loading&&<p role="status" className="v7-rv-note">Loading review decks…</p>}
  {!loading&&failed&&<div role="alert" className="v7-rv-error"><p>Could not load your review decks.</p>
   <Button onClick={()=>{void decks.refetch();void cards.refetch();void settings.refetch();}}>Retry</Button></div>}
  {!loading&&!failed&&<>
   <section className="v7-rv-hero" aria-label="Review counts">
    <p className="v7-rv-figure"><strong aria-label="Cards in this round">{count}</strong><span>{count===1?'card':'cards'} today</span></p>
    <p className="v7-rv-note">{note}{totalDue>count?' · '+(totalDue-count).toLocaleString()+' more due later':''}</p>
    {segments.length>0&&<div className="v7-rv-subjects" role="group" aria-label="Subjects in this round">
     {segments.map(segment=><button key={segment.subject} type="button" className={'v7-rv-subject '+subjectClass(segment.subject)}
      style={{flexGrow:segment.due}} aria-pressed={current===segment.subject}
      onClick={()=>setSelected(current===segment.subject?selectionFor(nodes,subjectOf,null):selectionFor(nodes,subjectOf,segment.subject))}>
      <span>{segment.subject}</span><small>{segment.due}</small></button>)}
    </div>}
    {issue&&<p role="alert" className="v7-rv-note">{issue}</p>}
    {active?<Button variant="primary" onClick={()=>navigate('/review/run?run='+encodeURIComponent(active.id))}>
     {'Resume · '+Math.min(active.progress.total,active.progress.position+1)+' of '+active.progress.total}</Button>
    :<Button variant="primary" aria-label={'Start '+count+' cards'} disabled={count===0} loading={busy} onClick={()=>{void start(result.batch,[...enabled]);}}>Start review</Button>}
    <Button variant="ghost" onClick={()=>setSheet(true)} disabled={nodes.length===0}>Customise this round</Button>
   </section>
   {pathSlug&&scoped&&selected===null&&<p className="v7-rv-note">Showing this path only. <button type="button" className="v7-rv-link" onClick={()=>{setSelected(null);navigate('/review',{replace:true});}}>Show all decks</button></p>}
   {nodes.length===0&&<p role="status" className="v7-rv-note">No cards due. Your review queue is clear.</p>}
   <div className="v7-rv-section">
    {bars.length>0?<Chart title="Due each day" kind="bars" data={bars.map(bar=>({label:bar.label,values:[bar.due]}))}
     series={[{label:'Due'}]} format={value=>String(Math.round(value))}
     summary={'Cards due over the next '+bars.length+' days: '+bars.reduce((sum,bar)=>sum+bar.due,0).toLocaleString()+' in all.'}/>
     :<p className="v7-rv-note">{forecast.isError?'Could not load the forecast.':'Loading the forecast…'}</p>}
   </div>
   <section className="v7-rv-section" aria-label="Memory, last 30 days">
    <h2 className="v7-headline">Memory · 30 days</h2>
    <div className="v7-rv-tiles">
     <div className="v7-stat"><p className="v7-meta">Recall</p><p className="v7-figure-m">{memory.recallPct===null?'–':memory.recallPct+'%'}</p></div>
     <div className="v7-stat"><p className="v7-meta">Reviews</p><p className="v7-figure-m">{memory.reviews.toLocaleString()}</p></div>
     <div className="v7-stat"><p className="v7-meta">Typical answer</p><p className="v7-figure-m">{memory.typicalSeconds===null?'–':memory.typicalSeconds+' s'}</p></div>
    </div>
   </section>
   {nodes.length>0&&<section className="v7-rv-section" aria-label="Review deck selection">
    <h2 className="v7-headline">Decks</h2>
    <ul className="v7-rv-decks">
     {nodes.map(node=>{
      const subject=subjectOf(slugOf(node.key));
      return <li key={node.key} className={subjectClass(subject)}>
       <span className="v7-rv-dot" aria-hidden="true"/>
       <Switch label={node.label+' · '+Math.max(node.due,node.children.reduce((sum,child)=>sum+child.due,0))+' due'}
        checked={keysFor(node).every(key=>enabled.has(key))} onChange={value=>toggleProject(node,value)}/>
      </li>;
     })}
    </ul>
    <Link className="v7-rv-link" to="/settings?section=study">Daily review limit: {Math.max(0,quota)}</Link>
   </section>}
  </>}
  <Sheet open={sheet} onClose={()=>setSheet(false)} title="Customise this round" eyebrow={count+' cards · '+note}
   footer={<Button variant="primary" onClick={()=>setSheet(false)}>Done</Button>}>
   <div className="v7-rv-sheet">
    <p className="v7-rv-note">Choose which decks and checkpoints feed this round. The daily limit is {Math.max(0,quota)} cards.</p>
    {nodes.map(node=><div key={node.key} className="v7-rv-group">
     <Switch label={node.label} checked={keysFor(node).every(key=>enabled.has(key))} onChange={value=>toggleProject(node,value)}/>
     {node.children.filter(child=>child.due>0).map(child=><div key={child.key} className="v7-rv-child">
      <Switch label={child.label+' · '+child.due+' due'} checked={enabled.has(child.key)} onChange={value=>toggleChild(node,child,value)}/></div>)}
    </div>)}
    <Button variant="ghost" onClick={()=>setSelected(null)}>Reset to all decks</Button>
   </div>
  </Sheet>
 </main>;
}
