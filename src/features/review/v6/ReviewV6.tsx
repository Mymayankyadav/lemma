import {useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router';
import {useDeckTree,useReviewItems,useSettings} from '../../../data/hooks';
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
 return <main aria-label="Review" className="flex min-w-0 flex-col gap-4 pb-24 text-ink">
  <header className="flex flex-col gap-1">
   <h1 className="text-title-s font-semibold">Review</h1>
   <p className="text-label text-ink-2">Choose decks and checkpoints for this round.</p>
  </header>
  {loading&&<p role="status">Loading review decks…</p>}
  {!loading&&error&&<section role="alert" className="rounded-ctl border border-edge p-4">
   <p>Could not load your review decks.</p>
   <button type="button" className={button} onClick={()=>{
    void decks.refetch();void cards.refetch();void settings.refetch();
   }}>Retry review data</button>
  </section>}
  {!loading&&!error&&<>
   {issue&&<p role="alert" className="text-label text-ink-2">{issue}</p>}
   {active&&<button type="button" className={button+' w-full'}
    onClick={()=>navigate('/review/run?run='+encodeURIComponent(active.id))}>
    Resume saved run · {active.progress.position+1} of {active.progress.total}
   </button>}
   <section aria-label="Review counts" className="rounded-ctl border border-edge bg-fill-1 p-4">
    <div className="grid grid-cols-3 gap-2 text-center">
     <div><strong className="block text-title-s tabular-nums">{result.allDue}</strong><span className="text-caption text-ink-2">All due</span></div>
     <div><strong className="block text-title-s tabular-nums">{result.eligible}</strong><span className="text-caption text-ink-2">Selected eligible</span></div>
     <div><strong className="block text-title-s tabular-nums" aria-label="Cards in this round">{result.batch.length}</strong><span className="text-caption text-ink-2">This round</span></div>
    </div>
    <p className="mt-2 text-label text-ink-2">Daily review limit: {Math.max(0,quota)}</p>
    <button type="button" aria-label={'Start '+result.batch.length+' cards'}
     className={button+' mt-3 w-full bg-amber font-semibold text-amber-ink'}
     disabled={result.batch.length===0||busy||!!active} onClick={()=>{void start()}}>
     {busy?'Starting…':'Start '+result.batch.length+' cards'}</button>
   </section>
   {nodes.length===0?<p role="status">No cards due. Your Review queue is clear.</p>:<>
    <label className="flex flex-col gap-1 text-label font-semibold text-ink-2">Find a deck or checkpoint
     <input aria-label="Find a deck or checkpoint" type="search" value={search}
      onChange={event=>setSearch(event.target.value)}
      className="min-h-11 rounded-ctl border border-edge bg-fill-1 px-3 text-body text-ink"/>
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
       className="rounded-ctl border border-edge bg-[var(--paper)] p-3">
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
  </>}
 </main>;
}
