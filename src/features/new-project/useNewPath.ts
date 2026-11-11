import {useRef,useState} from 'react';
import {useAddSource,useCreateProjectDraft} from '../../data/hooks';
import type {IngestProgress,Project} from '../../data/types';
import {isSourceFile} from '../../pdf/validate';

export type UploadState='queued'|'reading'|'uploading'|'saving'|'ready'|'failed';
export type QueueItem={id:number;file:File|null;name:string;size:number;status:UploadState;progress:IngestProgress|null;error:string|null;sha256:string|null};
export const MAX_PDF_BYTES=50*1024*1024;
export const validPdf=(file:File)=>isSourceFile(file)&&file.size>0&&file.size<=MAX_PDF_BYTES;
export const bytes=(size:number)=>size>=1048576?(size/1048576).toFixed(1)+' MB':Math.ceil(size/1024)+' KB';
async function fingerprint(file:File):Promise<string>{
 const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export type SubmitResult={kind:'created';project:Project}|{kind:'partial';project:Project}|{kind:'failed';message:string}|{kind:'idle'};

/** Create a path by name, then upload its sources one by one with de-duplication by content hash. A retry reuses the
 *  created path and only uploads what is not ready yet. Shared by the v6/legacy page and the v7 sheet. */
export function useNewPath(){
 const create=useCreateProjectDraft(),addSource=useAddSource();
 const [name,setName]=useState(''),[items,setItems]=useState<QueueItem[]>([]),[error,setError]=useState<string|null>(null),
  [saving,setSaving]=useState(false),[created,setCreated]=useState<Project|null>(null);
 const nextId=useRef(0);
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
 const remove=(id:number)=>setItems(previous=>previous.filter(item=>item.id!==id));
 async function submit():Promise<SubmitResult>{
  if(saving||!name.trim())return {kind:'idle'};
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
   return failed?{kind:'partial',project}:{kind:'created',project};
  }catch(cause){
   const message=cause instanceof Error?cause.message:'Could not create project';
   setError(message);
   return {kind:'failed',message};
  }finally{setSaving(false)}
 }
 const remaining=items.filter(item=>item.status!=='ready').length;
 return {name,setName,items,error,saving,created,remaining,enqueue,remove,submit};
}
