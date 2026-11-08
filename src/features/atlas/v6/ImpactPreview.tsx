import {useMemo,useState} from 'react';
import type {AtlasGraph} from '../../../data/types';
import {checkAtlasLink,describeAtlasMergeImpact,type AtlasEditNode} from './impact';

/** Read-only plan for an Atlas edit. The currently available LemmaApi cannot
 * create/edit/reparent/link/merge concepts, so never pretend to save changes. */
export default function AtlasImpactPreview({
 graph,sourceId,onClose,
}:{graph:AtlasGraph;sourceId:string;onClose:()=>void}){
 const source=graph.concepts.find(c=>c.id===sourceId);
 const [targetId,setTargetId]=useState(
  graph.concepts.find(c=>c.id!==sourceId)?.id??'');
 const [kind,setKind]=useState<'parent'|'prerequisite'>('parent');
 const nodes=useMemo(()=>{
  const prerequisites=new Map<string,string[]>();
  for(const link of graph.links)if(link.kind==='prereq'){
   const list=prerequisites.get(link.toId)??[];
   list.push(link.fromId);prerequisites.set(link.toId,list);
  }
  return graph.concepts.map((concept):AtlasEditNode=>({
   id:concept.id,parentId:concept.parentId??null,
   prerequisiteIds:prerequisites.get(concept.id)??[],
  }));
 },[graph]);
 const choice=targetId?graph.concepts.find(c=>c.id===targetId):null;
 const cycle=choice?checkAtlasLink(nodes,sourceId,targetId,kind):null;
 const related=graph.links.filter(link=>link.kind==='related')
  .map(link=>({leftId:link.fromId,rightId:link.toId}));
 const impact=choice?describeAtlasMergeImpact(nodes,sourceId,targetId,related):null;
 if(!source)return null;
 return <dialog open aria-label={'Preview Atlas edits for '+source.name}
  onCancel={e=>{e.preventDefault();onClose()}}
  onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();onClose()}}}
  className="fixed inset-0 z-50 m-auto w-[min(94vw,540px)] rounded-ctl border border-edge bg-[var(--paper)] p-4 text-ink shadow-lg">
  <h2 className="text-headline font-semibold">Preview changes to {source.name}</h2>
  <p className="mt-2 text-label text-ink-2">
   Preview only. A verified owner edit command is not available for these changes yet.
  </p>
  <label className="mt-3 block text-label">Target concept
   <select aria-label="Target concept" value={targetId}
    onChange={e=>setTargetId(e.target.value)}
    className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3">
    {graph.concepts.filter(c=>c.id!==sourceId).map(c=>
     <option key={c.id} value={c.id}>{c.name}</option>)}
   </select>
  </label>
  <label className="mt-3 block text-label">Preview link type
   <select aria-label="Preview link type" value={kind}
    onChange={e=>setKind(e.target.value as 'parent'|'prerequisite')}
    className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3">
    <option value="parent">Parent</option>
    <option value="prerequisite">Prerequisite</option>
   </select>
  </label>
  {cycle&&<p role="status" className="mt-3 text-label font-semibold">
   {cycle.ok?'No cycle detected in current data.':cycle.reason}
  </p>}
  {impact&&<section aria-label="Merge impact preview" className="mt-3 rounded-ctl border border-edge p-3">
   <h3 className="text-label font-semibold">If this concept were merged into {choice?.name}</h3>
   <dl className="mt-2 grid grid-cols-2 gap-2 text-caption">
    <div><dt>Child concepts</dt><dd>{impact.childConcepts}</dd></div>
    <div><dt>Incoming prerequisites</dt><dd>{impact.incomingPrerequisites}</dd></div>
    <div><dt>Outgoing prerequisites</dt><dd>{impact.outgoingPrerequisites}</dd></div>
    <div><dt>Related links</dt><dd>{impact.relatedConcepts}</dd></div>
   </dl>
  </section>}
  <div className="mt-4 flex justify-end">
   <button type="button" onClick={onClose}
    className="min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold">Close preview</button>
  </div>
 </dialog>;
}
