import type {PadStrokes} from '../../ui/v7/ink/ink';
import type {TutorAttachment,TutorImageDraft} from './attachment-types';
import {getMode} from '../mode';

export type InkDraft={drawingId?:string;strokes:PadStrokes;photos:TutorImageDraft[];width:number;accent:boolean;queuedText?:string};
export const emptyInk:InkDraft={strokes:[],photos:[],width:3,accent:false};

async function persist<T>(mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T> {
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('lemma-tutor-ink',1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('drafts');};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
  try {
    return await new Promise<T>((resolve,reject)=>{
      const tx=db.transaction('drafts',mode),request=operation(tx.objectStore('drafts'));
      tx.oncomplete=()=>resolve(request.result);
      tx.onabort=()=>reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function readInkDraft(key:string):Promise<InkDraft> {
  return (await persist('readonly',store=>store.get(key))) ?? emptyInk;
}
export function writeInkDraft(key:string,draft:InkDraft) {
  return persist('readwrite',store=>store.put(draft,key));
}
export function imageData(blob:Blob) {
  return new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result));
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function uploadTutorImage(owner:string,file:TutorImageDraft,assertCurrent:()=>void):Promise<TutorAttachment> {
  const {blob,...attachment}=file;
  if(getMode()==='demo') return {...attachment,localData:await imageData(blob)};
  const {liveClient}=await import('../live/client');
  assertCurrent();
  const bucket=liveClient().storage.from('tutor-ink'),path=owner+'/'+file.id;
  const {error}=await bucket.upload(path,blob,{contentType:file.mimeType,upsert:false});
  assertCurrent();
  if(error){
    const existing=await bucket.info(path);
    assertCurrent();
    if(existing.error||existing.data?.size!==blob.size)throw error;
  }
  return attachment;
}

export async function readTutorImage(owner:string,attachment:TutorAttachment) {
  if(attachment.localData) return attachment.localData;
  const {liveClient}=await import('../live/client');
  const {data,error}=await liveClient().storage.from('tutor-ink').download(owner+'/'+attachment.id);
  if(error||!data)throw new Error('Could not open the image.');
  return URL.createObjectURL(data);
}
