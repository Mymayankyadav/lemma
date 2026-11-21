import type {PadStrokes} from '../../ui/v7/ink/ink';
import {TUTOR_ATTACHMENT_COUNT,type TutorAttachment,type TutorDrawingInk,type TutorImageDraft} from './attachment-types';
import {getMode} from '../mode';

export type InkDraft={
  drawingId?:string;strokes:PadStrokes;width:number;accent:boolean;queuedText?:string;
  inlineImages?:true;
  editingDrawing?:TutorDrawingInk&{id:string};
  /** A durable image whose answer reference is being inserted. The working vectors survive until publication. */
  stagedDrawing?:{id:string;replacesId?:string};
  /** Encoded attachments, including finished drawings. Keep the key used by older device drafts. */
  photos:TutorImageDraft[];
};
export const emptyInk:InkDraft={strokes:[],photos:[],width:3,accent:false};

export function finishStagedDrawing(draft:InkDraft,id:string):InkDraft {
  const staged=draft.stagedDrawing;
  if(staged?.id!==id)return draft;
  if(!staged.replacesId)return {...draft,stagedDrawing:undefined,strokes:[],drawingId:undefined};
  const editingDrawing=draft.editingDrawing?.id===staged.replacesId?undefined:draft.editingDrawing;
  return {...draft,stagedDrawing:undefined,editingDrawing};
}

const UNREFERENCED_IMAGE_LIMIT=12;
export function keepDraftImage(draft:InkDraft,image:TutorImageDraft,referenced:readonly string[]):TutorImageDraft[] {
  const keep=new Set(referenced);
  const images=[...draft.photos.filter(item=>item.id!==image.id),image];
  const recent=new Set(images.filter(item=>!keep.has(item.id)).slice(-UNREFERENCED_IMAGE_LIMIT).map(item=>item.id));
  return images.filter(item=>keep.has(item.id)||recent.has(item.id));
}

/** Validate a learner edit against the latest draft, after asynchronous image preparation. */
export function editInkDraft(draft:InkDraft,edit:(draft:InkDraft)=>InkDraft,referenced?:readonly string[]):InkDraft {
  if(draft.queuedText!==undefined)return draft;
  const next=edit(draft);
  const count=(referenced===undefined?next.photos.length:new Set(referenced).size)+Number(next.strokes.length>0);
  return count<=TUTOR_ATTACHMENT_COUNT?next:draft;
}

export function removeSubmittedInk(draft:InkDraft,submitted:ReadonlySet<string>):InkDraft {
  const staged=draft.stagedDrawing;
  const current=staged&&submitted.has(staged.id)?finishStagedDrawing(draft,staged.id):draft;
  const drawing=!!current.drawingId&&submitted.has(current.drawingId);
  const photos=current.photos.filter(photo=>!submitted.has(photo.id));
  if(current===draft&&!drawing&&photos.length===draft.photos.length)return draft;
  return {...current,photos,queuedText:undefined,...(drawing&&{strokes:[],drawingId:undefined})};
}

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
  const {blob,id,kind,mimeType}=file;
  const attachment={id,kind,mimeType};
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
