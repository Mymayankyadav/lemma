import {useState,type FormEvent} from 'react';
import type {AtlasGraph} from '../../../data/types';
import {getApi} from '../../../data';
import type {AtlasConceptInput} from '../../../data/atlas-command';
const control='min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold disabled:opacity-50';
type Concept=AtlasGraph['concepts'][number];
export default function AtlasEditor({graph,concept,onSaved,onClose}:{
 graph:AtlasGraph;concept:Concept|null;onSaved:()=>Promise<void>;onClose:()=>void;
}){
 const [subjectId,setSubjectId]=useState(concept?.subjectId??graph.subjects[0]?.id??'');
 const [name,setName]=useState(concept?.name??'');
 const [blurb,setBlurb]=useState(concept?.blurb??'');
 const [parentId,setParentId]=useState(concept?.parentId??'');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const editing=concept!==null;
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  setBusy(true);setError('');
  try{
   const api=getApi();
   if(editing){
    if(!Number.isSafeInteger(concept.version)||Number(concept.version)<1)
     throw Error('Concept version unavailable; reload Atlas before editing.');
    if(name.trim()!==concept.name||blurb!==concept.blurb)
     await api.updateAtlasConcept(concept.id,concept.version!,{name,blurb});
    if(parentId!==(concept.parentId??'')){
     // Use the fresh returned version after a preceding content update.
     const latest=await api.getAtlas(),record=latest.concepts.find(c=>c.id===concept.id);
     if(!record||!record.version)throw Error('Concept changed; reload before moving it.');
     await api.reparentAtlasConcept(concept.id,record.version,parentId||null);
    }
   }else{
    const payload:AtlasConceptInput={subjectId,name,blurb,
      ...(parentId?{parentId}:{}),
    };
    await api.createAtlasConcept(payload);
   }
   await onSaved();
  }catch(e){setError(e instanceof Error?e.message:'Could not save idea.');}
  finally{setBusy(false)}
 }
 const parents=graph.concepts.filter(c=>c.subjectId===subjectId&&c.id!==concept?.id);
 return <dialog open aria-label={editing?'Edit Atlas idea':'Create Atlas idea'}
  onCancel={e=>{e.preventDefault();if(!busy)onClose()}}
  className="fixed inset-0 z-50 m-auto w-[min(94vw,540px)] rounded-ctl border border-edge bg-[var(--paper)] p-4 text-ink shadow-lg">
  <h2 className="text-headline font-semibold">{editing?'Edit idea':'New idea'}</h2>
  <form onSubmit={e=>{void submit(e)}} className="mt-3 space-y-3">
   <label className="block text-label">Subject
    <select aria-label="Idea subject" value={subjectId}
     disabled={editing||busy} onChange={e=>{setSubjectId(e.target.value);setParentId('')}}
     className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3">
     {graph.subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
   </label>
   <label className="block text-label">Idea name
    <input aria-label="Idea name" required maxLength={160}
     value={name} disabled={busy} onChange={e=>setName(e.target.value)}
     className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3"/>
   </label>
   <label className="block text-label">Description
    <textarea aria-label="Idea description" maxLength={2000}
     value={blurb??''} disabled={busy} onChange={e=>setBlurb(e.target.value)}
     className="mt-1 min-h-20 w-full rounded-ctl border border-edge bg-fill-1 p-3"/>
   </label>
   <label className="block text-label">Parent idea
    <select aria-label="Idea parent" value={parentId} disabled={busy}
     onChange={e=>setParentId(e.target.value)}
     className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3">
     <option value="">No parent</option>
     {parents.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
   </label>
   {error&&<p role="alert" className="text-label text-ink">{error}</p>}
   <div className="flex flex-wrap justify-end gap-2">
    <button type="button" className={control} disabled={busy} onClick={onClose}>Cancel</button>
    <button type="submit" className={control} disabled={busy||!name.trim()||!subjectId}>
     {busy?'Saving…':editing?'Save idea':'Create idea'}
    </button>
   </div>
  </form>
 </dialog>;
}
