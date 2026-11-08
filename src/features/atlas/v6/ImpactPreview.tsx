import {useMemo,useState} from 'react';
import type {AtlasGraph} from '../../../data/types';
import type {AtlasMergePreview,AtlasLinkKind} from '../../../data/atlas-command';
import {getApi} from '../../../data';
import {checkAtlasLink,describeAtlasMergeImpact,type AtlasEditNode} from './impact';

const control='min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold disabled:opacity-50';
/** N105.2: every write is versioned and sent via the audited Atlas command. */
export default function AtlasImpactPreview({
 graph,sourceId,onClose,onSaved,
}:{graph:AtlasGraph;sourceId:string;onClose:()=>void;onSaved?:()=>Promise<void>}){
 const source=graph.concepts.find(c=>c.id===sourceId);
 const [targetId,setTargetId]=useState(graph.concepts.find(c=>c.id!==sourceId)?.id??'');
 const [kind,setKind]=useState<'parent'|'prerequisite'|'related'|'merge'>('parent');
 const [preview,setPreview]=useState<AtlasMergePreview|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
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
 const cycle=choice&&(kind==='parent'||kind==='prerequisite')?
  checkAtlasLink(nodes,sourceId,targetId,kind):null;
 const isLinked=choice&&graph.links.some(l=>l.fromId===sourceId&&l.toId===choice.id&&
  l.kind===(kind==='related'?'related':'prereq'));
 const invalid=source&&choice&&source.subjectId!==choice.subjectId;
 async function act(action:'preview'|'link'|'unlink'|'reparent'|'merge'){
  if(!source||!choice||busy)return;
  setError('');setBusy(true);
  try{
   const api=getApi();
   if(action==='preview'){
    setPreview(await api.previewAtlasMerge(source.id,choice.id));
    return;
   }
   if(action==='merge'){
    if(!preview)throw Error('Preview merge impact before confirming.');
    await api.mergeAtlasConcept(source.id,preview.sourceVersion,choice.id,preview.keepVersion);
   }else{
    if(!Number.isSafeInteger(source.version)||Number(source.version)<1)
     throw Error('Current idea version unavailable; reload Atlas.');
    if(action==='reparent')await api.reparentAtlasConcept(source.id,source.version!,choice.id);
    else {
     const linkKind:AtlasLinkKind=kind==='related'?'related':'prereq';
     if(action==='unlink')await api.unlinkAtlasConcept(source.id,source.version!,choice.id,linkKind);
     else await api.linkAtlasConcept(source.id,source.version!,choice.id,linkKind);
    }
   }
   if(onSaved)await onSaved();
   onClose();
  }catch(e){setError(e instanceof Error?e.message:'Atlas edit failed');}
  finally{setBusy(false)}
 }
 if(!source)return null;
 // Preserve N86's read-only preview contract when no authorized onSaved
 // mutation callback is supplied (legacy/test surfaces stay non-writing).
 if(!onSaved){
  const related=graph.links.filter(link=>link.kind==='related')
   .map(link=>({leftId:link.fromId,rightId:link.toId}));
  const impact=choice?describeAtlasMergeImpact(nodes,sourceId,targetId,related):null;
  return <dialog open aria-label={'Preview Atlas edits for '+source.name}
   onCancel={e=>{e.preventDefault();onClose()}}
   className="fixed inset-0 z-50 m-auto w-[min(94vw,540px)] rounded-ctl border border-edge bg-[var(--paper)] p-4 text-ink shadow-lg">
   <h2 className="text-headline font-semibold">Preview changes to {source.name}</h2>
   <p className="mt-2 text-label text-ink-2">Preview only. A verified owner edit command is not available for these changes yet.</p>
   <label className="mt-3 block text-label">Target concept
    <select aria-label="Target concept" value={targetId} onChange={e=>setTargetId(e.target.value)}
     className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3">
     {graph.concepts.filter(c=>c.id!==sourceId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
   </label>
   <label className="mt-3 block text-label">Preview link type
    <select aria-label="Preview link type" value={kind}
     onChange={e=>setKind(e.target.value as typeof kind)}
     className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3">
     <option value="parent">Parent</option><option value="prerequisite">Prerequisite</option>
    </select>
   </label>
   {cycle&&<p role="status" className="mt-3 text-label font-semibold">
    {cycle.ok?'No cycle detected in current data.':cycle.reason}</p>}
   {impact&&<section aria-label="Merge impact preview"
    className="mt-3 rounded-ctl border border-edge p-3">
    <h3 className="text-label font-semibold">If this concept were merged into {choice?.name}</h3>
    <dl className="mt-2 grid grid-cols-2 gap-2 text-caption">
     <div><dt>Child concepts</dt><dd>{impact.childConcepts}</dd></div>
     <div><dt>Incoming prerequisites</dt><dd>{impact.incomingPrerequisites}</dd></div>
     <div><dt>Outgoing prerequisites</dt><dd>{impact.outgoingPrerequisites}</dd></div>
     <div><dt>Related links</dt><dd>{impact.relatedConcepts}</dd></div>
    </dl>
   </section>}
   <div className="mt-4 flex justify-end">
    <button type="button" className={control} onClick={onClose}>Close preview</button>
   </div>
  </dialog>;
 }
 return <dialog open aria-label={'Preview Atlas edits for '+source.name}
  onCancel={e=>{e.preventDefault();if(!busy)onClose()}}
  onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();if(!busy)onClose()}}}
  className="fixed inset-0 z-50 m-auto w-[min(94vw,540px)] rounded-ctl border border-edge bg-[var(--paper)] p-4 text-ink shadow-lg">
  <h2 className="text-headline font-semibold">Edit links for {source.name}</h2>
  <p className="mt-2 text-label text-ink-2">
   Changes are owner-checked, versioned and journalled. Merge requires a fresh impact preview.
  </p>
  <label className="mt-3 block text-label">Target concept
   <select aria-label="Target concept" value={targetId} disabled={busy}
    onChange={e=>{setTargetId(e.target.value);setPreview(null);setError('')}}
    className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3">
    {graph.concepts.filter(c=>c.id!==sourceId).map(c=>
     <option key={c.id} value={c.id}>{c.name}</option>)}
   </select>
  </label>
  <label className="mt-3 block text-label">Action
   <select aria-label="Atlas edit action" value={kind} disabled={busy}
    onChange={e=>{setKind(e.target.value as typeof kind);setPreview(null);setError('')}}
    className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3">
    <option value="parent">Change parent</option>
    <option value="prerequisite">Prerequisite link</option>
    <option value="related">Related link</option>
    <option value="merge">Merge into target</option>
   </select>
  </label>
  {invalid&&<p role="alert">Choose an idea in the same subject for this edit.</p>}
  {cycle&&<p role="status" className="mt-3 text-label font-semibold">
   {cycle.ok?'No cycle detected in current data.':cycle.reason}
  </p>}
  {kind==='merge'&&<section aria-label="Merge impact preview"
   className="mt-3 rounded-ctl border border-edge p-3">
   <h3 className="text-label font-semibold">Merge into {choice?.name??'another idea'}</h3>
   {preview?<dl className="mt-2 grid grid-cols-2 gap-2 text-caption">
    <div><dt>Child ideas</dt><dd>{preview.impact.childConcepts}</dd></div>
    <div><dt>Incoming prerequisites</dt><dd>{preview.impact.incomingPrerequisites}</dd></div>
    <div><dt>Outgoing prerequisites</dt><dd>{preview.impact.outgoingPrerequisites}</dd></div>
    <div><dt>Related links</dt><dd>{preview.impact.relatedConcepts}</dd></div>
    <div><dt>Notes/cards</dt><dd>{preview.impact.notesAndCards}</dd></div>
    <div><dt>Checkpoint links</dt><dd>{preview.impact.checkpointRefs}</dd></div>
   </dl>:<p className="text-label text-ink-2">No merge is authorized until its current server impact is shown.</p>}
  </section>}
  {error&&<p role="alert" className="mt-3 text-label">{error}</p>}
  <div className="mt-4 flex flex-wrap justify-end gap-2">
   <button type="button" onClick={onClose} disabled={busy} className={control}>Close</button>
   {choice&&!invalid&&kind==='merge'?<>
    <button type="button" disabled={busy} className={control}
     onClick={()=>{void act('preview')}}>Preview merge</button>
    <button type="button" disabled={busy||!preview} className={control}
     onClick={()=>{void act('merge')}}>Confirm merge</button>
   </>:choice&&!invalid&&(!cycle||cycle.ok)&&kind==='parent'?
    <button type="button" disabled={busy} className={control}
     onClick={()=>{void act('reparent')}}>Move under idea</button>:
    choice&&!invalid&&(!cycle||cycle.ok)?<>
     {!isLinked&&<button type="button" className={control} disabled={busy}
       onClick={()=>{void act('link')}}>Add link</button>}
     {isLinked&&<button type="button" className={control} disabled={busy}
       onClick={()=>{void act('unlink')}}>Remove link</button>}
    </>:null}
  </div>
 </dialog>;
}
