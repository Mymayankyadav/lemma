import {MathPreview} from '../../ui/MathPreview';
import {useCallback,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {AlertTriangle,Check,Copy,FileText,Plus,Trash2} from 'lucide-react';
import {useAddSource,useCreateProjectDraft} from '../../data/hooks';
import type {IngestProgress,Project} from '../../data/types';
import {planPrompt} from '../../lib/chat';
import {isSourceFile} from '../../pdf/ingest';
import {Screen} from '../../ui/Screen';
import {Sheet} from '../../ui/Sheet';
import {Button} from '../../ui/Button';
import {Rail} from '../../ui/Rail';
import {useToast} from '../../ui/Toast';

type UploadState='queued'|'reading'|'uploading'|'saving'|'ready'|'failed';
type QueueItem={id:number;file:File|null;name:string;size:number;status:UploadState;progress:IngestProgress|null;error:string|null;sha256:string|null};
const MAX_PDF_BYTES=50*1024*1024;
const validPdf=(file:File)=>isSourceFile(file)&&file.size>0&&file.size<=MAX_PDF_BYTES;
const bytes=(size:number)=>size>=1048576?(size/1048576).toFixed(1)+' MB':Math.ceil(size/1024)+' KB';
async function fingerprint(file:File):Promise<string>{
 const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export default function Page(){
 const navigate=useNavigate(),notify=useToast(),create=useCreateProjectDraft(),addSource=useAddSource();
 const [name,setName]=useState(''),[items,setItems]=useState<QueueItem[]>([]),[error,setError]=useState<string|null>(null),
  [saving,setSaving]=useState(false),[created,setCreated]=useState<Project|null>(null);
 const input=useRef<HTMLInputElement>(null),nextId=useRef(0);
 const close=useCallback(()=>navigate('/projects'),[navigate]);
 function enqueue(files:FileList|File[]){
  const incoming=Array.from(files),accepted:QueueItem[]=[],invalid:string[]=[];
  for(const file of incoming){
   if(!validPdf(file)){invalid.push(file.name);continue}
   accepted.push({id:++nextId.current,file,name:file.name,size:file.size,status:'queued',progress:null,error:null,sha256:null});
  }
  setItems(previous=>[...previous,...accepted]);
  setError(invalid.length?'Sources must be PDF, .tex or .md files, nonempty and at most 50 MB: '+invalid.join(', '):null);
 }
 function patch(id:number,change:Partial<QueueItem>){
  setItems(previous=>previous.map(item=>item.id===id?{...item,...change}:item));
 }
 async function submit(event:React.FormEvent){
  event.preventDefault();
  if(saving||!name.trim())return;
  setSaving(true);setError(null);
  let project=created;
  try{
   if(!project){
    project=await create.mutateAsync({title:name.trim()});
    setCreated(project);
   }
   const hashes=new Set(items.filter(item=>item.status==='ready'&&item.sha256).map(item=>item.sha256));
   let failed=false;
   for(const item of items){
    if(item.status==='ready')continue;
    try{
     const file=item.file;
     if(!file)throw new Error('File no longer available. Remove and reselect it.');
     patch(item.id,{status:'reading',error:null});
     const hash=await fingerprint(file);
     if(hashes.has(hash)){
      patch(item.id,{status:'failed',error:'Already added',sha256:hash});failed=true;continue;
     }
     await addSource.mutateAsync({projectId:project.id,file,onProgress:progress=>{
      patch(item.id,{progress,status:progress.phase==='done'?'saving':progress.phase==='failed'?'failed':progress.phase});
     }});
     hashes.add(hash);
     // Keep only display metadata and the digest; release the uploaded Blob reference.
     patch(item.id,{status:'ready',file:null,sha256:hash,error:null});
    }catch(cause){
     patch(item.id,{status:'failed',error:cause instanceof Error?cause.message:'Upload failed'});
     failed=true;
    }
   }
   if(failed){
    notify('Project saved. Retry or remove failed files to continue.',{tone:'danger'});
    return;
   }
   notify('Project created. Tell your tutor: '+planPrompt(project.title),{tone:'success'});
   navigate('/p/'+project.slug+'?tab=sources');
  }catch(cause){
   setError(cause instanceof Error?cause.message:'Could not create project');
   notify('Could not save your project',{tone:'danger'});
  }finally{setSaving(false)}
 }
 const remaining=items.filter(item=>item.status!=='ready').length;
 return <>
  {/* The route always opens this modal. The full Paths library behind it is
      inert and inaccessible, so don't evaluate its 60-project selectors,
      KaTeX rows, mutation hooks or Atlas/Cards prefetch on cold entry.
      Dismissing the sheet navigates to /projects and mounts the real list. */}
  <div data-new-project-backdrop data-sheet-background aria-hidden="true" inert>
   <Screen tabBar className="gap-4">
    <header className="flex min-h-11 items-center">
     <h1 className="font-[var(--font-display)] text-title-s font-semibold">Paths</h1>
    </header>
   </Screen>
  </div>
  <h1 className="sr-only">New project</h1>
  <Sheet open onClose={close} title="New project">
   <form onSubmit={event=>{void submit(event)}} className="flex flex-col gap-5">
    <section className="flex flex-col gap-2">
     <label htmlFor="project-title" className="text-label font-medium text-ink-2">Name</label>
     <input id="project-title" required maxLength={100} autoFocus autoComplete="off"
      value={name} onChange={event=>setName(event.target.value)} disabled={saving||!!created}
      placeholder="Real Analysis" className="min-h-12 w-full rounded-ctl border border-edge-2 bg-well px-3 text-headline text-ink"/>
     <MathPreview source={name}/>
     <p className="text-label text-ink-2">Your tutor fills in the subject, goal, teaching style and study plan.</p>
    </section>
    <section aria-label="Sources" className="flex flex-col gap-3"
     onDragOver={event=>event.preventDefault()}
     onDrop={event=>{event.preventDefault();if(!saving)enqueue(event.dataTransfer.files)}}>
     <div className="flex items-center justify-between gap-2">
      <h3 className="text-body font-semibold text-ink-2">Sources (optional)</h3>
      <span className="text-label text-ink-3">PDF, .tex, .md · 50 MB each</span>
     </div>
     <input ref={input} hidden type="file" multiple accept=".pdf,application/pdf,.tex,.latex,.ltx,application/x-tex,text/x-tex,.md,.markdown,text/markdown"
      onChange={event=>{if(event.currentTarget.files)enqueue(event.currentTarget.files);event.currentTarget.value=''}}/>
     <button type="button" disabled={saving} onClick={()=>input.current?.click()}
      className="flex min-h-24 items-center justify-center gap-2 rounded-slab border border-dashed border-edge-3 bg-fill-1 text-body text-ink-2">
      <Plus size={20} className="text-ink-2"/>Add PDFs, .tex or .md files
     </button>
     <ul aria-label="Upload queue" className="flex flex-col gap-2">
      {items.map(item=><li key={item.id} className="flex min-w-0 items-start gap-3 rounded-slab border border-edge bg-raised p-3">
       <FileText size={19} className="mt-1 shrink-0 text-ink-2" aria-hidden="true"/>
       <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold">{item.name}</p>
        <p className="text-label text-ink-3">{bytes(item.size)} · {item.status}{item.progress?.pageCount?' · '+item.progress.page+'/'+item.progress.pageCount+' pages':''}</p>
        {item.progress&&item.status!=='ready'&&<Rail className="mt-2" value={item.progress.pageCount?item.progress.page/item.progress.pageCount:0} label={'Progress for '+item.name}/>}
        {item.error&&<p role="alert" className="text-label text-again">{item.error}</p>}
       </div>
       {item.status==='ready'?<Check size={18} className="text-easy"/>:
        !saving&&<button type="button" aria-label={'Remove '+item.name} onClick={()=>setItems(previous=>previous.filter(x=>x.id!==item.id))}
         className="flex size-11 shrink-0 items-center justify-center text-ink-3"><Trash2 size={17}/></button>}
      </li>)}
     </ul>
    </section>
    {error&&<p role="alert" className="flex gap-2 text-label text-again"><AlertTriangle size={16}/>{error}</p>}
    <Button size="xl" className="w-full" type="submit" variant={saving||!name.trim()?'ghost':'lit'} disabled={saving||!name.trim()} loading={saving}>
     {saving?'Saving project and sources':created&&remaining?'Retry remaining uploads':'Create project'}
    </Button>
    <button type="button" className="flex min-h-11 items-center justify-center gap-2 text-label text-ink-2 underline-offset-4 hover:underline focus-visible:underline"
     onClick={()=>{void navigator.clipboard.writeText(planPrompt(name.trim()||'your project')).then(()=>notify('Prompt copied',{tone:'success'})).catch(()=>notify('Copy unavailable',{tone:'danger'}))}}>
     <Copy size={15}/>Tell your tutor: {planPrompt(name.trim()||'your project')}
    </button>
   </form>
  </Sheet>
 </>;
}
