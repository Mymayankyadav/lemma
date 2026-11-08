import {useState,type FormEvent} from 'react';
import {getApi} from '../../../data';
import type {AtlasGraph} from '../../../data/types';
import type {AtlasLinkKind,AtlasMergePreview} from '../../../data/api';

type Mode='create'|'update'|'reparent'|'link'|'unlink'|'merge';
const control='min-h-11 rounded-ctl border border-edge bg-[var(--paper)] px-3 py-2 text-label text-ink';
type Concept=AtlasGraph['concepts'][number]&{version?:number};
/** A saved edit is always an audited N105.1 owner command, never direct DML. */
export default function AtlasCommands({graph,sourceId,onClose,onSaved}:{
 graph:AtlasGraph;sourceId:string|null;onClose:()=>void;onSaved:()=>Promise<void>|void
}){
 const source=sourceId?graph.concepts.find(c=>c.id===sourceId) as Concept|undefined:null;
 const choices=graph.concepts.filter(c=>c.id!==sourceId&&
  (!source||c.subjectId===source.subjectId));
 const [mode,setMode]=useState<Mode>(source?'update':'create');
 const [name,setName]=useState(source?.name??'');
 const [blurb,setBlurb]=useState(source?.blurb??'');
 const [subjectId,setSubjectId]=useState(source?.subjectId??graph.subjects[0]?.id??'');
 const [targetId,setTargetId]=useState(choices[0]?.id??'');
 const [kind,setKind]=useState<AtlasLinkKind>('prereq');
 const [preview,setPreview]=useState<(AtlasMergePreview&{keepId:string})|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState<string|null>(null);
 const change=(next:Mode)=>{setMode(next);setMessage(null);setPreview(null)};
 const selectedVersion=async()=>{
  if(!source)return 0;
  const version=(source as Concept).version;
  if(typeof version==='number'&&Number.isSafeInteger(version)&&version>0)return version;
  return getApi().getConceptVersion(source.id);
 };
 const inspect=async()=>{
  if(!source||!targetId)return;
  setBusy(true);setMessage(null);setPreview(null);
  try{
   const details=await getApi().previewConceptMerge(source.id,targetId);
   setPreview({...details,keepId:targetId});
  }catch(error){setMessage(error instanceof Error?error.message:'Merge preview failed')}
  finally{setBusy(false)}
 };
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(busy)return;
  setBusy(true);setMessage(null);
  try{
   const api=getApi();
   if(mode==='create'){
    if(!subjectId||!name.trim())throw Error('Choose a subject and enter an idea');
    await api.createConcept({subjectId,name:name.trim(),blurb:blurb||null});
   }else{
    if(!source)throw Error('Select an existing idea');
    const version=await selectedVersion();
    if(mode==='update'){
     await api.updateConcept(source.id,version,{name:name.trim(),blurb});
    }else if(mode==='reparent'){
     await api.reparentConcept(source.id,version,targetId||null);
    }else if(mode==='link'){
     if(!targetId)throw Error('Choose another concept');
     await api.linkConcept(source.id,version,targetId,kind);
    }else if(mode==='unlink'){
     if(!targetId)throw Error('Choose another concept');
     await api.unlinkConcept(source.id,version,targetId,kind);
    }else if(mode==='merge'){
     if(!preview||preview.keepId!==targetId)
      throw Error('Preview this exact merge before confirming');
     // Both versions come from the owner RPC preview, not from UI guesses.
     await api.mergeConcept(source.id,preview.sourceVersion,targetId,preview.keepVersion);
    }
   }
   await onSaved();onClose();
  }catch(error){
   setMessage(error instanceof Error?error.message:'Could not save Atlas change');
  }finally{setBusy(false)}
 };
 const targetLabel=mode==='reparent'?'New parent concept':
  mode==='merge'?'Keep this concept':'Target concept';
 return <dialog open aria-label={source?'Edit Atlas idea '+source.name:'Create Atlas idea'}
  onCancel={event=>{event.preventDefault();if(!busy)onClose()}}
  onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();if(!busy)onClose()}}}
  className="fixed inset-0 z-50 m-auto max-h-[90vh] w-[min(95vw,540px)] overflow-y-auto rounded-ctl border border-edge bg-[var(--paper)] p-4 text-ink shadow-lg">
  <form onSubmit={event=>void submit(event)}>
   <h2 className="text-headline font-semibold">{source?'Edit '+source.name:'Create idea'}</h2>
   {source&&<label className="mt-3 block text-label">Action
    <select aria-label="Atlas edit operation" className={control+' mt-1 w-full'}
     value={mode} onChange={e=>change(e.target.value as Mode)}>
     <option value="update">Edit name or description</option>
     <option value="reparent">Change parent</option>
     <option value="link">Add link</option>
     <option value="unlink">Remove link</option>
     <option value="merge">Merge into another concept</option>
    </select>
   </label>}
   {mode==='create'&&<label className="mt-3 block text-label">Subject
    <select aria-label="Atlas subject" className={control+' mt-1 w-full'}
     value={subjectId} onChange={e=>setSubjectId(e.target.value)}>
     {graph.subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
   </label>}
   {(mode==='create'||mode==='update')&&<>
    <label className="mt-3 block text-label">Idea name
     <input aria-label="Atlas idea name" className={control+' mt-1 w-full'}
      value={name} onChange={e=>setName(e.target.value)} maxLength={60} required/>
    </label>
    <label className="mt-3 block text-label">Description
     <textarea aria-label="Atlas idea description" className={control+' mt-1 w-full'}
      value={blurb} onChange={e=>setBlurb(e.target.value)} maxLength={200} rows={3}/>
    </label>
   </>}
   {['reparent','link','unlink','merge'].includes(mode)&&<>
    <label className="mt-3 block text-label">{targetLabel}
     <select aria-label="Atlas target concept" className={control+' mt-1 w-full'}
      value={targetId} onChange={e=>{setTargetId(e.target.value);setPreview(null)}}>
      {mode==='reparent'&&<option value="">No parent (root)</option>}
      {choices.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
     </select>
    </label>
    {(mode==='link'||mode==='unlink')&&<label className="mt-3 block text-label">Link type
     <select aria-label="Atlas link kind" className={control+' mt-1 w-full'}
      value={kind} onChange={e=>setKind(e.target.value as AtlasLinkKind)}>
      <option value="prereq">Prerequisite</option>
      <option value="related">Related</option>
     </select>
    </label>}
   </>}
   {mode==='merge'&&<div className="mt-3">
    <button type="button" className={control} disabled={busy||!targetId}
     onClick={()=>void inspect()}>Preview merge impact</button>
    {preview&&preview.keepId===targetId&&<section aria-label="Server merge impact"
     className="mt-2 rounded-ctl border border-edge p-3 text-label">
     <p>Owner-verified preview · source v{preview.sourceVersion}, kept v{preview.keepVersion}</p>
     <dl className="mt-2 grid grid-cols-2 gap-2 text-caption">
      <div><dt>Children</dt><dd>{preview.impact.childConcepts}</dd></div>
      <div><dt>Prerequisites in</dt><dd>{preview.impact.incomingPrerequisites}</dd></div>
      <div><dt>Prerequisites out</dt><dd>{preview.impact.outgoingPrerequisites}</dd></div>
      <div><dt>Related links</dt><dd>{preview.impact.relatedConcepts}</dd></div>
      <div><dt>Notes/cards</dt><dd>{preview.impact.notesAndCards}</dd></div>
      <div><dt>Checkpoints</dt><dd>{preview.impact.checkpointRefs}</dd></div>
     </dl>
     <p className="mt-2">Merge moves linked evidence and removes the source idea; it is auditable and undoable.</p>
    </section>}
   </div>}
   {message&&<p role="alert" className="mt-3 text-label text-red-600">{message}</p>}
   <div className="mt-4 flex justify-end gap-2">
    <button type="button" className={control} disabled={busy} onClick={onClose}>Cancel</button>
    <button type="submit" className={control+' font-semibold'}
     disabled={busy||(mode==='merge'&&(!preview||preview.keepId!==targetId))||
      (mode==='create'&&!subjectId)}>
     {busy?'Saving…':mode==='merge'?'Confirm merge':'Save Atlas change'}
    </button>
   </div>
  </form>
 </dialog>;
}
