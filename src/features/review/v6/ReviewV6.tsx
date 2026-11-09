import {useEffect,useMemo,useState} from 'react';
import {Link,useNavigate} from 'react-router';
import {Play} from 'lucide-react';
import {useDeckTree,useReviewItems,useSettings} from '../../../data/hooks';
import {getMode} from '../../../data/mode';
import {useReviewSession} from '../../review-run/store';
import type {DeckNode,QueueFilter} from '../../../data/types';
import {FastTex} from '../../../ui/FastTex';
import {currentSettingsVersion,startRun,resumeRun,type DurableRun} from '../../review-run/v6/adapter';
import {defaultSelection,reviewBatch} from './selection';

const allFilter:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};
const button='min-h-11 rounded-ctl border border-edge px-3 py-2 text-label font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber disabled:opacity-40';
const visibleDue=(node:DeckNode)=>node.due>0||node.children.some(child=>child.due>0);
const keysFor=(project:DeckNode)=>[project.key,...project.children.filter(child=>child.due>0).map(child=>child.key)];

/** The N30.1 selected batch is the sole source for both labels and the round handoff. */
export default function ReviewV6(){
 const navigate=useNavigate();
 const decks=useDeckTree(),cards=useReviewItems(allFilter),settings=useSettings();
 const [active,setActive]=useState<DurableRun|null>(null);
 const [busy,setBusy]=useState(false),[issue,setIssue]=useState<string|null>(null);
 useEffect(()=>{
  let cancelled=false;
  void resumeRun().then(run=>{if(!cancelled)setActive(run)}).catch(error=>{
   if(!cancelled)setIssue(error instanceof Error?error.message:'Could not resume last run');
  });
  return()=>{cancelled=true};
 },[]);
 const [selected,setSelected]=useState<Set<string>|null>(null);
 const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set());
 const [search,setSearch]=useState('');
 const nodes=useMemo(()=>(decks.data??[]).filter(visibleDue),[decks.data]);
 const enabled=useMemo(()=>selected??defaultSelection(nodes),[selected,nodes]);
 const quota=settings.data?.reviewsPerDay??0;
 const result=useMemo(()=>reviewBatch(nodes,cards.data??[],enabled,quota),[nodes,cards.data,enabled,quota]);
 const visible=nodes.filter(project=>{
  const q=search.trim().toLocaleLowerCase();
  return !q||project.label.toLocaleLowerCase().includes(q)||
   project.children.some(child=>child.label.toLocaleLowerCase().includes(q));
 });
 const loading=decks.isPending||cards.isPending||settings.isPending;
 const error=!!(decks.error||cards.error||settings.error);
 function toggleProject(project:DeckNode,value:boolean){
  const next=new Set(enabled);
  for(const key of keysFor(project))value?next.add(key):next.delete(key);
  setSelected(next);
 }
 function toggleChild(project:DeckNode,child:DeckNode,value:boolean){
  const next=new Set(enabled);
  value?next.add(child.key):next.delete(child.key);
  // The parent key can still select ungrouped cards, never a deselected checkpoint.
  if(project.children.filter(node=>node.due>0).every(node=>next.has(node.key)))
   next.add(project.key);
  else next.delete(project.key);
  setSelected(next);
 }
 async function start(){
  if(!settings.data||!decks.data||!cards.data||!result.batch.length||busy)return;
  // The server's N62 card references are UUIDs. Preserve the established
  // local queue when a live-mode caller supplies non-UUID fixtures (e.g.
  // offline test data), rather than posting invalid IDs to the owner RPC.
  // Actual demo mode uses its durable tab-persistent adapter instead.
  if(getMode()==='live'&&result.batch.some(card=>
   !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(card.cardId))){
   useReviewSession.getState().initialize(result.batch,settings.data,allFilter);
   navigate('/review/run');
   return;
  }
  setBusy(true);setIssue(null);
  try{
   const run=await startRun({
    selectedDeckIds:[...enabled],filters:{sessionId:null,conceptSlug:null,includeNew:true,newOnly:false},
    cardBudget:Math.min(2000,result.batch.length),
    minuteBudget:Math.min(1440,result.batch.length),
    schedulerVersion:'fsrs-v6',settingsVersion:await currentSettingsVersion(),
   },result.batch);
   navigate('/review/run?run='+encodeURIComponent(run.id));
  }catch(error){setIssue(error instanceof Error?error.message:'Could not start review run')}
  finally{setBusy(false)}
 }
 const minutes=Math.max(1,Math.ceil(result.batch.length*4.5/60));
 const selectedDecks=nodes.filter(project=>keysFor(project).some(key=>enabled.has(key))).length;
 // N112 (mockup `12__Page`): one review hero, then decks and queue details one tap away.
 return <main aria-label="Review" className="flex min-w-0 flex-col text-ink">
  {loading&&<p role="status">Loading review decks…</p>}
  {!loading&&error&&<section role="alert" className="lemma-log-warning">
   <p>Could not load your review decks.</p>
   <button type="button" onClick={()=>{
    void decks.refetch();void cards.refetch();void settings.refetch();
   }}>Retry review data</button>
  </section>}
  {!loading&&!error&&<>
   {issue&&<p role="alert" className="lemma-log-warning mb-4">{issue}</p>}
   <section aria-label="Review counts" className="notebook-review-summary">
    <p className="notebook-eyebrow">A SMALL SESSION, LASTING IDEAS</p>
    <h2><span aria-label="Cards in this round">{result.batch.length}</span> cards for today</h2>
    <p className="notebook-review-estimate">{result.batch.length?'About '+minutes+' min · at your pace':'Nothing selected for this round'}</p>
    {active?<button type="button" className="notebook-primary"
     onClick={()=>navigate('/review/run?run='+encodeURIComponent(active.id))}>
     <Play size={20} aria-hidden="true"/>Resume saved run · {active.progress.position+1} of {active.progress.total}
    </button>:
    <button type="button" aria-label={'Start '+result.batch.length+' cards'} className="notebook-primary disabled:opacity-60"
     disabled={result.batch.length===0||busy||!!active} onClick={()=>{void start()}}>
     <Play size={20} aria-hidden="true"/>{busy?'Starting…':'Start review'}</button>}
    <div className="notebook-budget-row">
     <span><strong>Today’s batch</strong><small>Daily review limit: {Math.max(0,quota)}</small></span>
     <Link to="/settings" className="notebook-text-button inline-flex items-center">Change</Link>
    </div>
   </section>
   <details className="notebook-options-details" open={search?true:undefined}>
    <summary className="notebook-options-row mt-6">
     <span><strong>Decks &amp; options</strong><small>{selectedDecks} of {nodes.length} decks selected · Mixed order</small></span>
     <span aria-hidden="true">›</span>
    </summary>
    <div className="flex flex-col gap-3 py-4">
   {nodes.length===0?<p role="status">No cards due. Your Review queue is clear.</p>:<>
    <label className="flex flex-col gap-1 text-label font-semibold text-ink-2">Find a deck or checkpoint
     <input aria-label="Find a deck or checkpoint" type="search" value={search}
      onChange={event=>setSearch(event.target.value)}
      className="min-h-11 rounded-[8px] border border-[var(--control-edge)] bg-[var(--paper)] px-3 text-body text-ink"/>
    </label>
    {search&&visible.length===0&&<p role="status">No matching decks or checkpoints.</p>}
    {result.eligible===0&&<p role="status">No cards in this selection. Choose another deck or checkpoint.</p>}
    <section aria-label="Review deck selection" className="flex flex-col gap-3">
     {visible.map(project=>{
      const keys=keysFor(project),every=keys.every(key=>enabled.has(key));
      const some=keys.some(key=>enabled.has(key));
      const q=search.trim().toLocaleLowerCase();
      const shown=project.children.filter(child=>child.due>0&&
       (!q||project.label.toLocaleLowerCase().includes(q)||child.label.toLocaleLowerCase().includes(q)));
      const opened=!collapsed.has(project.key)||!!q;
      return <section key={project.key} aria-label={'Deck '+project.label}
       className="border-b border-[var(--hair)] py-2">
       <div className="flex min-w-0 items-center gap-2">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
         <input type="checkbox" aria-label={'Include deck '+project.label} className="size-5 shrink-0 accent-[var(--accent)]"
          checked={every} ref={input=>{if(input)input.indeterminate=some&&!every;}}
          onChange={event=>toggleProject(project,event.target.checked)}/>
         <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] text-body font-semibold">
          <FastTex source={project.label} className="break-words [overflow-wrap:anywhere]"/></span>
         <span className="text-label tabular-nums text-ink-2">{project.due} due</span>
        </label>
        {shown.length>0&&<button type="button" className={button}
         aria-label={(opened?'Collapse ':'Expand ')+project.label} aria-expanded={opened}
         onClick={()=>setCollapsed(previous=>{
          const next=new Set(previous);if(next.has(project.key))next.delete(project.key);else next.add(project.key);return next;
         })}>{opened?'Less':'More'}</button>}
       </div>
       {opened&&shown.length>0&&<ul className="mt-1 ml-3 flex flex-col gap-1 border-l border-edge pl-3">
        {shown.map(child=><li key={child.key}>
         <label className="flex min-h-11 min-w-0 items-center gap-3">
          <input type="checkbox" className="size-5 shrink-0 accent-[var(--accent)]"
           aria-label={'Include '+project.label+' / '+child.label}
           checked={enabled.has(child.key)} onChange={event=>toggleChild(project,child,event.target.checked)}/>
          <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] text-label">
           <FastTex source={child.label} className="break-words [overflow-wrap:anywhere]"/></span>
          <span className="shrink-0 text-label tabular-nums text-ink-2">{child.due} due</span>
         </label>
        </li>)}
       </ul>}
      </section>;
     })}
    </section>
   </>}
    </div>
   </details>
   <details className="notebook-queue-details mt-6">
    <summary>Queue details · {result.allDue.toLocaleString()} due across all decks</summary>
    <p>All due: <strong className="tabular-nums">{result.allDue}</strong> · Selected eligible: <strong className="tabular-nums">{result.eligible}</strong> · This round: <strong className="tabular-nums">{result.batch.length}</strong></p>
   </details>
  </>}
 </main>;
}
