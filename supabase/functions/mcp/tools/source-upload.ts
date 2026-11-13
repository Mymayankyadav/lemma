import {Context} from '../db.ts';
import {project,source} from '../resolve.ts';

/** N160 (area 21): the original file of a source, uploaded from a chat client.
 * Text still arrives through save_pages (the transcription path); this stores the
 * PDF itself beside it, in the owner's own folder, exactly where the app puts it. */
export const SOURCE_BUCKET='sources';
export const MAX_SOURCE_BYTES=52428800;
const store=(c:Context)=>(c.db as unknown as {storage:{from(b:string):any}}).storage.from(SOURCE_BUCKET);
export const sourcePath=(owner:string,sourceId:string)=>owner+'/'+sourceId+'.pdf';

export async function signedSourceUpload(c:Context,a:{project?:string;id?:string}):Promise<string>{
 if(!c.userId)throw new Error('Authenticated owner required');
 if(!a.id)throw new Error('Provide the source short name as id');
 const p=await project(c,a.project);
 const src=await source(c,p,a.id);
 if(src.storage_path)throw new Error(src.short+' already has its original file; delete the source to replace it');
 const path=sourcePath(c.userId,src.id);
 const {data,error}=await store(c).createSignedUploadUrl(path);
 if(error)throw new Error(error.message);
 return JSON.stringify({source:src.short,path,method:'PUT',uploadUrl:data.signedUrl,token:data.token,
  contentType:'application/pdf',maxBytes:MAX_SOURCE_BYTES,
  next:'Upload the PDF to uploadUrl, then call edit with target "book:'+src.short+'" and set {"uploaded":true}.'});
}

/** Check that the object is really there, owner-folder and PDF-sized, before the row says so. */
export async function confirmedSourceUpload(c:Context,src:{id:string;short:string}):Promise<{storage_path:string;bytes:number}>{
 const path=sourcePath(c.userId,src.id);
 const {data,error}=await store(c).list(c.userId,{search:src.id+'.pdf',limit:2});
 if(error)throw new Error(error.message);
 const found=(data||[]).find((x:any)=>x.name===src.id+'.pdf');
 if(!found)throw new Error('No uploaded file found for '+src.short+'; upload it to the signed URL first');
 const bytes=Number(found.metadata?.size);
 if(!Number.isSafeInteger(bytes)||bytes<1||bytes>MAX_SOURCE_BYTES)throw new Error('Uploaded file must be 1 byte to 50 MB');
 return {storage_path:path,bytes};
}
export async function pageCount(c:Context,sourceId:string):Promise<number>{
 const {count,error}=await c.db.from('source_pages').select('page',{count:'exact',head:true}).eq('user_id',c.userId).eq('source_id',sourceId);
 if(error)throw new Error(error.message);
 return count||0;
}
