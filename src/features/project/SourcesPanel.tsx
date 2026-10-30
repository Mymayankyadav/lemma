import {useEffect,useRef,useState} from 'react';
import {Check,FileText,Plus,Trash2} from 'lucide-react';
import {useAddSource,useDeleteSource,useUpdateSource} from '../../data/hooks';
import type {IngestProgress,Source,SourceKind} from '../../data/types';
import {isPdfFile} from '../../pdf/ingest';
import {Rail} from '../../ui/Rail';
import {Tile} from '../../ui/Tile';
import {useToast} from '../../ui/Toast';

type QueueEntry={id:number;file:File;phase:'queued'|'reading'|'uploading'|'saving'|'ready'|'failed';progress:IngestProgress|null;error:string|null};
const kinds:SourceKind[]=['book','notes','slides','problems','syllabus','exam','other'];
const limit=50*1024*1024;
export function SourcesPanel({projectId,sources}:{projectId:string;sources:Source[]}){
 const add=useAddSource(),update=useUpdateSource(),remove=useDeleteSource(),notify=useToast();
 const picker=useRef<HTMLInputElement>(null),running=useRef(false),id=useRef(0);
 const [queue,setQueue]=useState<QueueEntry[]>([]),[editing,setEditing]=useState<string|null>(null),
  [title,setTitle]=useState(''),[kind,setKind]=useState<SourceKind>('other'),[confirm,setConfirm]=useState<string|null>(null);
 const patch=(entryId:number,changes:Partial<QueueEntry>)=>setQueue(old=>old.map(x=>x.id===entryId?{...x,...changes}:x));
 function enqueue(files:FileList|File[]){
  const accepted:QueueEntry[]=[];
  for(const file of Array.from(files)){
   if(!isPdfFile(file)||!file.size||file.size>limit){notify('Choose a nonempty PDF under 50 MB: '+file.name,{tone:'danger'});continue}
   accepted.push({id:++id.current,file,phase:'queued',progress:null,error:null});
  }
  setQueue(old=>[...old,...accepted]);
 }
 useEffect(()=>{
  if(running.current)return;
  const next=queue.find(x=>x.phase==='queued');
  if(!next)return;
  running.current=true;
  let cancelled=false;
  const upload=async()=>{
   patch(next.id,{phase:'reading',error:null});
   try{
    // SHA-256 catches same-content PDFs with different filenames.
    const digest=await crypto.subtle.digest('SHA-256',await next.file.arrayBuffer());
    const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    if(sources.some(source=>source.sha256===hash)){
     patch(next.id,{phase:'failed',error:'Already added'});return;
    }
    await add.mutateAsync({projectId,file:next.file,onProgress:p=>{
     if(!cancelled)patch(next.id,{progress:p,phase:p.phase==='done'?'saving':p.phase==='failed'?'failed':p.phase});
    }});
    if(!cancelled){patch(next.id,{phase:'ready',error:null});notify('PDF added',{tone:'success'})}
   }catch(error){
    if(!cancelled)patch(next.id,{phase:'failed',error:error instanceof Error?error.message:'Upload failed'});
   }finally{running.current=false}
  };
  void upload();
  return()=>{cancelled=true};
 // A single queue entry is consumed at a time. A change of sources does not restart an in-flight upload.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[queue,projectId]);
 async function save(source:Source){
  try{await update.mutateAsync({id:source.id,patch:{title:title.trim()||source.title,kind}});setEditing(null);notify('Source updated',{tone:'success'})}
  catch(error){notify(error instanceof Error?error.message:'Could not update source',{tone:'danger'})}
 }
 async function erase(source:Source){
  try{await remove.mutateAsync(source.id);setConfirm(null);notify('Source deleted (undo available in history)',{tone:'success'})}
  catch(error){notify(error instanceof Error?error.message:'Could not delete source',{tone:'danger'})}
 }
 const grouped=kinds.map(value=>({kind:value,rows:sources.filter(s=>(s.kind??'other')===value).sort((a,b)=>Date.parse(b.addedAt??b.createdAt)-Date.parse(a.addedAt??a.createdAt))})).filter(g=>g.rows.length);
 return <section aria-label="Sources" className="flex flex-col gap-4">
  <p className="text-label text-ink-3">{sources.length} sources · Free plan storage limit 1 GB</p>
  {grouped.map(group=><div key={group.kind} className="flex flex-col gap-2">
   <h3 className="text-label font-semibold uppercase tracking-wider text-ink-2">{group.kind}</h3>
   {group.rows.map(source=><Tile key={source.id} className="flex flex-col gap-2 p-3">
    <div className="flex items-center gap-3">
     <FileText size={20} className="shrink-0 text-amber"/>
     <div className="min-w-0 flex-1">
      <strong className="block truncate text-body-l">{source.title}</strong>
      <p className="text-label text-ink-3">{source.pageCount??'—'} pages · {new Date(source.addedAt??source.createdAt).toLocaleDateString()} · {source.status}</p>
      {source.planCheckedAt===null&&<span className="text-label font-semibold text-amber">New · not yet used in a plan</span>}
     </div>
     <button type="button" className="min-h-11 px-2 text-label text-amber" onClick={()=>{setEditing(source.id);setTitle(source.title);setKind(source.kind??'other');setConfirm(null)}}>Edit</button>
     <button type="button" aria-label={'Delete '+source.title} className="flex size-11 items-center justify-center text-ink-3" onClick={()=>{setConfirm(source.id);setEditing(null)}}><Trash2 size={17}/></button>
    </div>
    {editing===source.id&&<div className="flex flex-col gap-2">
     <label className="text-label text-ink-2">Title<input aria-label="Source title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={150} className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-well p-2 text-ink"/></label>
     <label className="text-label text-ink-2">Kind<select aria-label="Source kind" value={kind} onChange={e=>setKind(e.target.value as SourceKind)} className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-well p-2 text-ink">{kinds.map(k=><option key={k} value={k}>{k}</option>)}</select></label>
     <div className="flex gap-3"><button type="button" className="min-h-11 text-label text-amber" disabled={update.isPending} onClick={()=>{void save(source)}}>Save</button><button type="button" className="min-h-11 text-label text-ink-2" onClick={()=>setEditing(null)}>Cancel</button></div>
    </div>}
    {confirm===source.id&&<div role="group" aria-label={'Confirm deletion of '+source.title} className="flex items-center gap-3">
     <span className="text-label text-ink-2">Delete this source and its pages?</span>
     <button type="button" className="min-h-11 text-label text-again" disabled={remove.isPending} onClick={()=>{void erase(source)}}>Delete</button>
     <button type="button" className="min-h-11 text-label text-ink-2" onClick={()=>setConfirm(null)}>Cancel</button>
    </div>}
   </Tile>)}
  </div>)}
  <input ref={picker} hidden type="file" multiple accept=".pdf,application/pdf" onChange={e=>{if(e.currentTarget.files)enqueue(e.currentTarget.files);e.currentTarget.value=''}}/>
  <div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();enqueue(e.dataTransfer.files)}}>
   <button type="button" onClick={()=>picker.current?.click()} className="flex min-h-24 w-full items-center justify-center gap-2 rounded-slab border border-dashed border-edge-3 bg-fill-1 text-body text-ink-2">
    <Plus size={22} className="text-amber"/>Add sources · select or drop PDFs
   </button>
  </div>
  {queue.length>0&&<ul aria-label="Source upload queue" className="flex flex-col gap-2">
   {queue.map(item=><li key={item.id} className="rounded-slab border border-edge bg-raised p-3">
    <div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-body">{item.file.name}</span>
     <span className="text-label text-ink-2">{item.phase==='ready'?<Check size={17} className="text-easy"/>:item.phase}</span></div>
    {item.progress&&item.phase!=='ready'&&<Rail className="mt-2" value={item.progress.pageCount?item.progress.page/item.progress.pageCount:0} label={'Upload '+item.file.name}/>}
    {item.error&&<p role="alert" className="text-label text-again">{item.error} <button type="button" className="min-h-11 text-amber" onClick={()=>patch(item.id,{phase:'queued',error:null})}>Retry</button></p>}
   </li>)}
  </ul>}
 </section>;
}
