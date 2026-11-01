import {useEffect,useRef,useState} from 'react';
import {Tex} from '../../ui/Tex';
import {MathPreview} from '../../ui/MathPreview';
import {Check,FileText,Plus,Trash2} from 'lucide-react';
import {useAddSource,useDeleteSource,useUpdateSource,useSourceTranscriptionStats} from '../../data/hooks';
import {SourceTranscriptionView} from './SourceTranscriptionView';
import type {IngestProgress,Source,SourceKind} from '../../data/types';
import {cancelIngest,isSourceFile,resetIngestCancellation} from '../../pdf/ingest';
import {Rail} from '../../ui/Rail';
import {visibleUploadQueue} from './uploadQueue';
import {useToast} from '../../ui/Toast';
import {useOnlineStatus,networkWritable} from '../../ui/useOnlineStatus';

type QueueEntry={id:number;file:File|null;name:string;bytes:number;pagesRead:number;phase:'queued'|'reading'|'uploading'|'saving'|'ready'|'failed'|'cancelled';progress:IngestProgress|null;error:string|null};
const kinds:SourceKind[]=['book','notes','slides','problems','syllabus','exam','other'];
const limit=50*1024*1024;
const formatSize=(bytes:number)=>bytes<=0?'0 KB':bytes>=1024*1024?(bytes/1024/1024).toFixed(1)+' MB':Math.max(1,Math.ceil(bytes/1024))+' KB';
const storageLimit=1024*1024*1024;
export function SourcesPanel({projectId,sources}:{projectId:string;sources:Source[]}){
 const add=useAddSource(),update=useUpdateSource(),remove=useDeleteSource(),notify=useToast();
 const online=useOnlineStatus();
 const transcriptStats=useSourceTranscriptionStats(projectId);
 const summary=new Map((transcriptStats.data??[]).map(item=>[item.sourceId,item]));
 const picker=useRef<HTMLInputElement>(null),running=useRef(false),id=useRef(0),cancelled=useRef(new Set<number>());
 const [queue,setQueue]=useState<QueueEntry[]>([]),[tick,setTick]=useState(0),[editing,setEditing]=useState<string|null>(null),
  [title,setTitle]=useState(''),[kind,setKind]=useState<SourceKind>('other'),[confirm,setConfirm]=useState<string|null>(null),[sourcePages,setSourcePages]=useState<Record<string,number>>({}),[openKind,setOpenKind]=useState<SourceKind|'none'|null>(null);
 const patch=(entryId:number,changes:Partial<QueueEntry>)=>setQueue(old=>old.map(x=>x.id===entryId?{
   ...x,...changes,
   pagesRead:changes.progress?Math.max(x.pagesRead,changes.progress.phase==='reading'||changes.progress.phase==='done'?changes.progress.page:0):x.pagesRead
  }:x));
 function enqueue(files:FileList|File[]){
  if(!networkWritable()){notify('Needs a connection');return}
  const accepted:QueueEntry[]=[];
  for(const file of Array.from(files)){
   if(!isSourceFile(file)||!file.size||file.size>limit){notify('Choose a nonempty PDF, .tex or .md file under 50 MB: '+file.name,{tone:'danger'});continue}
   accepted.push({id:++id.current,file,name:file.name,bytes:file.size,pagesRead:0,phase:'queued',progress:null,error:null});
  }
  setQueue(old=>[...old,...accepted]);
 }
 useEffect(()=>{
  if(running.current)return;
  const next=queue.find(x=>x.phase==='queued'&&x.file);
  if(!next)return;
  if(!networkWritable()){patch(next.id,{phase:'failed',error:'Needs a connection'});return}
  const file=next.file!;
  cancelled.current.delete(next.id);
  resetIngestCancellation(file);
  running.current=true;
  const upload=async()=>{
   patch(next.id,{phase:'reading',error:null});
   try{
    // SHA-256 catches same-content PDFs with different filenames.
    const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
    const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    if(sources.some(source=>source.sha256===hash)){
     patch(next.id,{phase:'failed',file:null,error:'Already added'});return;
    }
    if(!networkWritable())throw Error('Needs a connection');
    await add.mutateAsync({projectId,file,onProgress:p=>{
     patch(next.id,{progress:p,phase:p.phase==='done'?'saving':p.phase==='failed'?'failed':p.phase});
    }});
    if(cancelled.current.has(next.id))return;
    patch(next.id,{phase:'ready',file:null,error:null});notify('PDF added',{tone:'success'});
   }catch(error){
    const message=error instanceof Error?error.message:'Upload failed';
    if(cancelled.current.has(next.id))patch(next.id,{phase:'cancelled',file:null,error:null});
    else patch(next.id,{phase:'failed',file:/Already added/i.test(message)?null:file,error:message});
   }finally{running.current=false;setTick(n=>n+1)}
  };
  void upload();
 // A single queue entry is consumed at a time; tick schedules the next queued file after completion.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[queue,projectId,tick]);
 async function save(source:Source){
  if(!networkWritable()){notify('Needs a connection');return}
  try{await update.mutateAsync({id:source.id,patch:{title:title.trim()||source.title,kind}});setEditing(null);notify('Source updated',{tone:'success'})}
  catch(error){notify(error instanceof Error?error.message:'Could not update source',{tone:'danger'})}
 }
 async function erase(source:Source){
  if(!networkWritable()){notify('Needs a connection');return}
  try{await remove.mutateAsync(source.id);setConfirm(null);notify('Source deleted (undo available in history)',{tone:'success'})}
  catch(error){notify(error instanceof Error?error.message:'Could not delete source',{tone:'danger'})}
 }
 function cancel(entry:QueueEntry){
  cancelled.current.add(entry.id);
  if(entry.file)cancelIngest(entry.file);
  patch(entry.id,{phase:'cancelled',file:null,error:null});
 }
 const grouped=kinds.map(value=>({kind:value,rows:sources.filter(s=>(s.kind??'other')===value).sort((a,b)=>Date.parse(b.addedAt??b.createdAt)-Date.parse(a.addedAt??a.createdAt))})).filter(g=>g.rows.length);
 const visibleKind=(value:SourceKind)=>sources.length<=10?(openKind===null||openKind===value):(openKind??grouped[0]?.kind)===value;
 // The 1 GB quota is for stored PDF binaries, not .tex/.md page text in Postgres.
 // Source.bytes records the original upload size for both kinds; only PDFs
 // consume the storage bucket. Keep unknown PDF sizes explicit.
 const pdfSources=sources.filter(source=>/\.pdf$/i.test(source.filename));
 const sized=pdfSources.filter(source=>typeof source.bytes==='number'&&Number.isFinite(source.bytes)&&source.bytes>=0);
 const storageBytes=sized.reduce((total,source)=>total+source.bytes!,0),unknownSizes=pdfSources.length-sized.length;
 const storagePct=Math.min(100,storageBytes/storageLimit*100);
 const visibleQueue=visibleUploadQueue(queue);
 return <section aria-label="Sources" className="flex flex-col gap-4">
  <div role="group" aria-label="Source storage" className="flex flex-col gap-1.5">
   <div className="flex items-center justify-between gap-2 text-label text-ink-3">
    <span className="min-w-0 tabular-nums">{sources.length} {sources.length===1?'source':'sources'} · {formatSize(storageBytes)} of 1 GB{unknownSizes>0?' · '+unknownSizes+' '+(unknownSizes===1?'size':'sizes')+' unknown':''}</span>
   </div>
   <div role="progressbar" aria-label="PDF storage used" aria-valuemin={0} aria-valuemax={100}
    aria-valuenow={Math.round(storagePct)} aria-valuetext={(unknownSizes?'At least ':'')+formatSize(storageBytes)+' of 1 GB'}
    className="h-1.5 overflow-hidden rounded-full bg-fill-2">
    <div data-source-storage-fill className="h-full rounded-full bg-[var(--ink-2)]" style={{width:storagePct+'%'}}/>
   </div>
  </div>
  {grouped.map(group=><div key={group.kind} className="overflow-hidden rounded-slab border border-edge bg-[var(--paper)]">
   <h3 className="text-label font-semibold text-ink-2"><button type="button" aria-expanded={visibleKind(group.kind)} className="flex min-h-11 w-full items-center justify-between gap-2 text-left" onClick={()=>setOpenKind(visibleKind(group.kind)?'none':group.kind)}><span>{group.kind.charAt(0).toUpperCase()+group.kind.slice(1)} · {group.rows.length}</span><span data-source-fold className="text-ink-2">{visibleKind(group.kind)?'Fold':'Open'}</span></button></h3>
   {visibleKind(group.kind)&&group.rows.slice((sourcePages[group.kind]??0)*10,(sourcePages[group.kind]??0)*10+10).map(source=><div key={source.id} data-source-row role="group" aria-label={source.title} className="flex flex-col gap-2 border-t border-[var(--hair)] px-3 py-3">
    <div className="flex items-center gap-3">
     <FileText data-source-icon size={20} className="shrink-0 text-ink-2"/>
     <div className="min-w-0 flex-1">
      <strong className="block truncate text-body-l"><Tex source={source.title}/></strong>
      <p className="text-label text-ink-3">{source.pageCount??'—'} pages · {new Date(source.addedAt??source.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'})} · {source.status}</p>
      {source.planCheckedAt===null&&<span data-source-new className="text-label font-semibold text-ink-2">New · not yet used in a plan</span>}
     </div>
     <button type="button" data-source-edit className="min-h-11 min-w-11 px-2 text-label text-ink-2" onClick={()=>{setEditing(source.id);setTitle(source.title);setKind(source.kind??'other');setConfirm(null)}}>Edit</button>
     <button type="button" aria-label={'Delete '+source.title} className="flex size-11 items-center justify-center text-ink-3" onClick={()=>{setConfirm(source.id);setEditing(null)}}><Trash2 size={17}/></button>
    </div>
    {editing===source.id&&<div className="flex flex-col gap-2">
     <label className="text-label text-ink-2">Title<input aria-label="Source title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={150} className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-well p-2 text-ink"/></label>
     <MathPreview source={title}/>
     <label className="text-label text-ink-2">Kind<select aria-label="Source kind" value={kind} onChange={e=>setKind(e.target.value as SourceKind)} className="mt-1 min-h-11 w-full rounded-ctl border border-edge bg-well p-2 text-ink">{kinds.map(k=><option key={k} value={k}>{k}</option>)}</select></label>
     <div className="flex gap-3"><button type="button" className="min-h-11 min-w-11 px-2 text-label text-amber" aria-disabled={!online||undefined} disabled={update.isPending} onClick={()=>{void save(source)}}>Save</button><button type="button" className="min-h-11 min-w-11 px-2 text-label text-ink-2" onClick={()=>setEditing(null)}>Cancel</button></div>
    </div>}
    {confirm===source.id&&<div role="group" aria-label={'Confirm deletion of '+source.title} className="flex flex-wrap items-center gap-2">
     <span className="min-w-0 flex-1 basis-40 text-label text-ink-2">Delete this source and its pages?</span>
     <button type="button" className="min-h-11 min-w-11 px-2 text-label text-again" aria-disabled={!online||undefined} disabled={remove.isPending} onClick={()=>{void erase(source)}}>Delete</button>
     <button type="button" className="min-h-11 min-w-11 px-2 text-label text-ink-2" onClick={()=>setConfirm(null)}>Cancel</button>
    </div>}
    <SourceTranscriptionView source={source} stat={summary.get(source.id)}/>
   </div>)}
  {visibleKind(group.kind)&&group.rows.length>10&&<div className="flex items-center justify-between gap-2 text-label text-ink-3">
   <button type="button" disabled={!(sourcePages[group.kind]??0)} data-source-page className="min-h-11 px-3 text-ink-2 disabled:opacity-40" onClick={()=>setSourcePages(p=>({...p,[group.kind]:Math.max(0,(p[group.kind]??0)-1)}))}>Previous</button>
   <span>{Math.min(group.rows.length,(sourcePages[group.kind]??0)*10+1)}–{Math.min(group.rows.length,((sourcePages[group.kind]??0)+1)*10)} of {group.rows.length}</span>
   <button type="button" disabled={((sourcePages[group.kind]??0)+1)*10>=group.rows.length} data-source-page className="min-h-11 px-3 text-ink-2 disabled:opacity-40" onClick={()=>setSourcePages(p=>({...p,[group.kind]:(p[group.kind]??0)+1}))}>More</button>
  </div>}
  </div>)}
  <input ref={picker} hidden type="file" multiple accept=".pdf,application/pdf,.tex,.latex,.ltx,application/x-tex,text/x-tex,.md,.markdown,text/markdown" onChange={e=>{if(e.currentTarget.files)enqueue(e.currentTarget.files);e.currentTarget.value=''}}/>
  <div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();enqueue(e.dataTransfer.files)}}>
   <button type="button" aria-disabled={!online||undefined} onClick={()=>{if(!networkWritable()){notify("Needs a connection");return}picker.current?.click()}} className="flex min-h-24 w-full items-center justify-center gap-2 rounded-slab border border-dashed border-edge-3 bg-fill-1 text-body text-ink-2">
    <Plus size={22} className="text-amber"/>Add sources · PDF, .tex or .md
   </button>
  </div>
  {queue.length>0&&<ul aria-label="Source upload queue" className="flex flex-col gap-2">
   {visibleQueue.map(item=><li key={item.id} className="rounded-slab border border-edge bg-raised p-3">
    <div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-body">{item.name}</span>
     <span aria-label={'Upload status: '+item.phase} className="flex shrink-0 items-center gap-1 text-label text-ink-2">{item.phase==='ready'?<><Check size={17} className="text-easy"/>Ready</>:item.phase}</span></div>
    <p className="mt-1 text-caption text-ink-3">{formatSize(item.bytes)}{item.progress?.pageCount?' · '+item.pagesRead+'/'+item.progress.pageCount+' pages read':''}</p>
    {(item.phase==='queued'||item.phase==='reading')&&<button type="button" className="min-h-11 px-3 text-label font-semibold text-ink-2" onClick={()=>cancel(item)}>Cancel reading</button>}
    {item.progress?.pageCount&&item.progress.pageCount>1200&&<p role="alert" className="mt-1 text-label text-[var(--late)]">This PDF has {item.progress.pageCount} pages. Reading may be slow; consider splitting it by chapter.</p>}
    {item.progress&&item.phase!=='ready'&&item.phase!=='cancelled'&&<Rail className="mt-2" value={item.progress.pageCount?item.progress.page/item.progress.pageCount:0} label={'Upload '+item.name}/>}
    {item.error&&<p role="alert" className="text-label text-again">{item.error} {item.file&&<button type="button" className="min-h-11 min-w-11 px-2 text-ink-2" onClick={()=>patch(item.id,{phase:'queued',error:null})}>Retry</button>}</p>}
   </li>)}
  {queue.length>visibleQueue.length&&<p className="text-label text-ink-3">{queue.length-visibleQueue.length} earlier queue entries hidden.</p>}
  </ul>}
 </section>;
}

