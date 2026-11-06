// N30.2: the Review start view behind v6Shell. No changes to the legacy runner.
import {useMemo,useState} from 'react';
import {useNavigate} from 'react-router';
import {BookOpen,Play} from 'lucide-react';
import {useDeckTree,useReviewItems,useSettings} from '../../../data/hooks';
import type {DeckNode,QueueFilter,ReviewItem} from '../../../data/types';
import {buildQueue} from '../../../lib/queue';
import {Button} from '../../../ui/Button';
import {Check} from '../../../ui/Check';
import {Screen} from '../../../ui/Screen';
import {Slab} from '../../../ui/Slab';
import {useReviewSession} from '../../review-run/store';
import {defaultSelection,reviewBatch} from './selection';

const allFilter:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};
const control='min-h-11 min-w-11 rounded-ctl px-3 text-label font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber';

export default function V6ReviewStart(){
 const navigate=useNavigate();
 const decks=useDeckTree();
 const cards=useReviewItems(allFilter);
 const settings=useSettings();
 const [picked,setPicked]=useState<Set<string>|null>(null);
 const [expanded,setExpanded]=useState<Set<string>>(()=>new Set());
 const nodes=useMemo(()=> (decks.data??[]).filter(n=>n.due>0||n.children.some(c=>c.due>0)),[decks.data]);
 const selected=picked??defaultSelection(nodes);
 const preview=useMemo(()=>reviewBatch(nodes,cards.data??[],selected,settings.data?.reviewsPerDay??0),
   [nodes,cards.data,selected,settings.data?.reviewsPerDay]);
 // The runner applies dueToday, sibling deduplication and owner quota inside
 // buildQueue. Preview that exact operation, not the raw selected due count.
 const prepared=useMemo(()=>settings.data?buildQueue(preview.batch,settings.data):null,
   [preview.batch,settings.data]);
 const queueItems=useMemo<ReviewItem[]>(()=>prepared?[
   ...prepared.learning,...prepared.reviews,...prepared.fresh,
 ]:[],[prepared]);
 const roundCount=prepared?.total??0;
 const pending=decks.isPending||cards.isPending||settings.isPending;
 const failed=Boolean(decks.error||cards.error||settings.error);
 const selectedChildren=(node:DeckNode)=>node.children.filter(child=>child.due>0);
 function setProject(node:DeckNode,value:boolean){
  const next=new Set(selected);
  for(const key of [node.key,...selectedChildren(node).map(x=>x.key)])
   if(value)next.add(key);else next.delete(key);
  setPicked(next);
 }
 function setChild(project:DeckNode,child:DeckNode,value:boolean){
  const next=new Set(selected);
  if(value)next.add(child.key);else next.delete(child.key);
  if(selectedChildren(project).every(x=>next.has(x.key)))next.add(project.key);
  else next.delete(project.key);
  setPicked(next);
 }
 function start(){
  if(!settings.data||!decks.data||!cards.data||roundCount===0)return;
  // Initialize exactly the same prefiltered pool used for the round count.
  // The runner rebuilds the queue using the same settings on this call.
  useReviewSession.getState().initialize(queueItems,settings.data,allFilter);
  if(useReviewSession.getState().total!==roundCount)return;
  navigate('/review/run');
 }
 function reload(){
  void Promise.all([decks.refetch(),cards.refetch(),settings.refetch()]);
 }
 return <Screen title="Review" tabBar className="min-w-0 gap-4">
  {pending?<p role="status" className="rounded-ctl bg-fill-1 p-4 text-body text-ink-2">
   Loading your review decks…
  </p>:failed?<section role="alert" className="rounded-ctl border border-edge bg-fill-1 p-4">
   <p className="text-body text-ink">Review data could not be loaded.</p>
   <button type="button" className={control} onClick={reload}>Try again</button>
  </section>:<>
   <Slab as="section" aria-label="Review batch" className="flex flex-col gap-3 p-4">
    <div className="flex items-center gap-2">
     <BookOpen size={22} aria-hidden="true" className="text-amber"/>
     <h2 className="text-title-s font-semibold text-ink">Review today</h2>
    </div>
    <div className="grid grid-cols-3 gap-2 text-center">
     <div className="min-w-0 rounded-ctl bg-fill-1 p-2">
      <strong data-all-due className="block text-title tabular-nums text-ink">{preview.allDue}</strong>
      <span className="text-caption text-ink-2">All due</span>
     </div>
     <div className="min-w-0 rounded-ctl bg-fill-1 p-2">
      <strong data-eligible className="block text-title tabular-nums text-ink">{preview.eligible}</strong>
      <span className="text-caption text-ink-2">Selected eligible</span>
     </div>
     <div className="min-w-0 rounded-ctl bg-amber-tint p-2">
      <strong data-in-round className="block text-title tabular-nums text-ink">{roundCount}</strong>
      <span className="text-caption text-ink-2">In this round</span>
     </div>
    </div>
    <p className="text-label text-ink-2">Choose projects and checkpoints. Your daily review limit and note-sibling rules apply to the round.</p>
    <Button type="button" icon={Play} onClick={start} disabled={roundCount===0}
      className="w-full">Start {roundCount} {roundCount===1?'card':'cards'}</Button>
   </Slab>
   <section aria-label="Choose review decks" className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <h2 className="text-title-s font-semibold text-ink">Choose decks</h2>
     <div className="flex flex-wrap gap-2">
      <button type="button" className={control} onClick={()=>setPicked(defaultSelection(nodes))}>Select all</button>
      <button type="button" className={control} onClick={()=>setPicked(new Set())}>Clear</button>
     </div>
    </div>
    {nodes.length===0?<p className="rounded-ctl bg-fill-1 p-4 text-body text-ink-2">No reviews due today.</p>:
     nodes.map(node=>{
      const children=selectedChildren(node);
      const checked=children.length?children.every(child=>selected.has(child.key)):selected.has(node.key);
      const mixed=children.length>0&&!checked&&children.some(child=>selected.has(child.key));
      const isExpanded=expanded.has(node.key);
      const toggle=()=>{
       const next=new Set(expanded);
       if(isExpanded)next.delete(node.key);else next.add(node.key);
       setExpanded(next);
      };
      return <Slab as="section" key={node.key} className="min-w-0 p-3">
       <div className="flex min-w-0 flex-wrap items-center gap-2 [overflow-wrap:anywhere]">
        <div className="min-w-0 flex-1">
         <Check label={'Include '+node.label+' ('+node.due+' due)'}
          checked={mixed?'mixed':checked} onChange={v=>setProject(node,v)}/>
        </div>
        {children.length>0&&<button type="button" className={control} aria-expanded={isExpanded}
          aria-controls={'review-children-'+node.key.replace(/[^a-z0-9_-]/gi,'-')}
          onClick={toggle}>{isExpanded?'Hide':'Show'} checkpoints for {node.label}</button>}
       </div>
       {children.length>0&&isExpanded&&<div id={'review-children-'+node.key.replace(/[^a-z0-9_-]/gi,'-')}
         className="mt-3 flex flex-col gap-1 border-l border-edge pl-3">
        {children.map(child=><div key={child.key}
          className="min-w-0 rounded-ctl py-1 text-label text-ink [overflow-wrap:anywhere]">
         <Check label={'Include '+node.label+' — '+child.label+' ('+child.due+' due)'}
          checked={selected.has(child.key)} onChange={v=>setChild(node,child,v)}/>
        </div>)}
       </div>}
      </Slab>;
     })}
   </section>
   {nodes.length>0&&roundCount===0&&<p role="status" className="text-body text-ink-2">
    {preview.eligible===0?'No cards due in the selected decks. Select another deck.':
     'No cards available in today’s review quota.'}
   </p>}
  </>}
 </Screen>;
}
