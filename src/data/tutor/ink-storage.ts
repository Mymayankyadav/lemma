import type {PadStrokes} from '../../ui/v7/ink/ink';
import {readTutorAcceptedSpans, referencedImageIds, type TutorAcceptedSpan} from '../../../supabase/functions/_shared/tutor-answer';
import {IMAGE_ONLY_ANSWER,TUTOR_ATTACHMENT_COUNT,unresolvedTutorImageIds,type TutorAttachment,type TutorDrawingInk,type TutorImageDraft} from './attachment-types';
import {authGeneration,onAccountChange} from '../authBoundary';
import {getDemoProfile,getMode,type DemoProfile} from '../mode';
import {subscribeTutorLocalCleanup,tutorLocalScopeActive,tutorOwnerDeleted,tutorStorageOwner} from './local-storage';

export type InkDraft={
  drawingId?:string;strokes:PadStrokes;width:number;accent:boolean;queuedText?:string;
  queuedAcceptedSpans?:readonly TutorAcceptedSpan[];
  inlineImages?:true;
  editingDrawing?:TutorDrawingInk&{id:string};
  /** A durable image whose answer reference is being inserted. The working vectors survive until publication. */
  stagedDrawing?:{id:string;replacesId?:string};
  /** Encoded attachments, including finished drawings. Keep the key used by older device drafts. */
  photos:TutorImageDraft[];
};
export const emptyInk:InkDraft={strokes:[],photos:[],width:3,accent:false};
export type InkRecovery={draft:InkDraft;status:'loading'|'failed'|'ready';textOnly?:true};
export type TutorInkScope=({ownerId:string;generation:number}|{profile:DemoProfile})&{pathId:string;checkpointId:string};

export const inkIssueText={
  loading:'Restoring the images in your answer…',
  failed:'The saved images could not be opened.',
  missing:'An inserted image could not be found. Remove the unavailable image or try restoring it again.',
  unavailable:'Images are unavailable here. Remove the image references to send this answer.',
  limit:'An answer can have up to three images.',
};

export function tutorInkIssue(text:string,ink?:InkRecovery):keyof typeof inkIssueText|undefined {
  const ids=referencedImageIds(text);
  if(!ink)return ids.length?'unavailable':undefined;
  if(ink.status!=='ready')return !ink.textOnly||ids.length?ink.status:undefined;
  if(!ids.length)return;
  if(ids.length>TUTOR_ATTACHMENT_COUNT)return 'limit';
  if(unresolvedTutorImageIds(text,ink.draft.photos.filter(image=>image.blob instanceof Blob&&image.blob.size>0)).length)return 'missing';
}

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

function answerIdentity(text:string,spans?:readonly TutorAcceptedSpan[]):string {
  const question=text.trim()||IMAGE_ONLY_ANSWER,offset=text.length-text.trimStart().length;
  const accepted=readTutorAcceptedSpans(question,spans?.map(span=>({...span,start:span.start-offset,end:span.end-offset})));
  return JSON.stringify([question,accepted.map(({start,end,text,source,aidId,aidVersion})=>[start,end,text,source,aidId,aidVersion])]);
}

export function removeSubmittedInk(draft:InkDraft,submitted:ReadonlySet<string>,
  answer?:{question:string;acceptedSpans?:readonly TutorAcceptedSpan[]}):InkDraft {
  const queued=draft.queuedText!==undefined,refs=referencedImageIds(draft.queuedText??'');
  const legacy=refs.length===0&&!draft.inlineImages;
  const queuedIds=legacy?[...draft.photos.map(photo=>photo.id),...(draft.drawingId&&draft.strokes.length?[draft.drawingId]:[])]:refs;
  const clearQueue=queued&&!!answer&&queuedIds.length>0&&queuedIds.every(id=>submitted.has(id))&&
    (!legacy||!draft.strokes.length||!!draft.drawingId)&&
    answerIdentity(draft.queuedText!,draft.queuedAcceptedSpans)===answerIdentity(answer.question,answer.acceptedSpans);
  // A later answer can reuse an already-sent image. Preserve both its text and
  // its bytes until the confirmed submission matches the queued answer itself.
  const retained=new Set(queued&&!clearQueue?queuedIds:[]);
  const removable=(id:string)=>submitted.has(id)&&!retained.has(id);
  const staged=draft.stagedDrawing;
  const current=staged&&removable(staged.id)?finishStagedDrawing(draft,staged.id):draft;
  const drawing=!!current.drawingId&&removable(current.drawingId);
  const photos=current.photos.filter(photo=>!removable(photo.id));
  if(current===draft&&!drawing&&photos.length===draft.photos.length&&!clearQueue)return draft;
  return {...current,photos,...(clearQueue&&{queuedText:undefined,queuedAcceptedSpans:undefined}),
    ...(drawing&&{strokes:[],drawingId:undefined})};
}

const DRAFTS='drafts',DELETED_OWNERS='deleted-owners';
const accountChanged=()=>new Error('The account changed. Reopen the tutor.');
const storageUnavailable=()=>new Error('Tutor image storage is unavailable.');

export function assertTutorInkScope(scope:TutorInkScope):void {
  if('ownerId' in scope ? !tutorLocalScopeActive(scope) : getMode()!=='demo'||getDemoProfile()!==scope.profile)throw accountChanged();
}

function openInkDb():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('lemma-tutor-ink',2);
    let blocked=false;
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(DRAFTS))db.createObjectStore(DRAFTS);
      if(!db.objectStoreNames.contains(DELETED_OWNERS))db.createObjectStore(DELETED_OWNERS);
    };
    request.onblocked=()=>{blocked=true;reject(storageUnavailable());};
    request.onsuccess=()=>{
      const db=request.result;
      db.onversionchange=()=>db.close();
      if(blocked)db.close();
      else resolve(db);
    };
    request.onerror=()=>reject(request.error??storageUnavailable());
  });
}

async function persist<T>(scope:TutorInkScope,mode:IDBTransactionMode,operation:(store:IDBObjectStore,key:string)=>IDBRequest<T>,
  change?:(value:T,store:IDBObjectStore,key:string)=>T):Promise<T> {
  assertTutorInkScope(scope);
  const live='ownerId' in scope;
  const key=(live?'lemma.tutor.draft:':'lemma.demo-tutor:')+JSON.stringify([live?scope.ownerId:scope.profile,scope.pathId,scope.checkpointId])+':ink';
  const db=await openInkDb();
  try {
    assertTutorInkScope(scope);
    return await new Promise<T>((resolve,reject)=>{
      const tx=db.transaction(live?[DRAFTS,DELETED_OWNERS]:DRAFTS,mode);
      let result:T,failure:unknown;
      function guard(step:()=>void) {
        try {assertTutorInkScope(scope);step();} catch(error) {
          failure=error;
          try {tx.abort();} catch {/* Completion still checks the account before returning. */}
        }
      }
      const account=live?onAccountChange(()=>guard(()=>{})):undefined;
      const cleanup=live?subscribeTutorLocalCleanup(()=>guard(()=>{})):undefined;
      const unsubscribe=()=>{account?.();cleanup?.();};
      tx.onabort=()=>{unsubscribe();reject(failure??tx.error??storageUnavailable());};
      tx.oncomplete=()=>{
        unsubscribe();
        try {assertTutorInkScope(scope);if(failure)throw failure;resolve(result);} catch(error) {reject(error);}
      };
      function access() {
        const store=tx.objectStore(DRAFTS),request=operation(store,key);
        request.onsuccess=()=>guard(()=>{result=change?change(request.result,store,key):request.result;});
      }
      // The owner marker and draft share one transaction with deletion, including across tabs.
      guard(()=>{
        if(!live){access();return;}
        const marker=tx.objectStore(DELETED_OWNERS).get(scope.ownerId);
        marker.onsuccess=()=>guard(()=>{if(marker.result)throw accountChanged();access();});
      });
    });
  } finally {
    db.close();
  }
}

export async function removeDeletedOwnerInk(ownerId:string):Promise<void> {
  if(!tutorOwnerDeleted(ownerId))throw accountChanged();
  if(typeof indexedDB==='undefined')return;
  const db=await openInkDb();
  try {
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction([DRAFTS,DELETED_OWNERS],'readwrite'),store=tx.objectStore(DRAFTS);
      tx.oncomplete=()=>resolve();
      tx.onabort=()=>reject(tx.error??storageUnavailable());
      tx.objectStore(DELETED_OWNERS).put(true,ownerId);
      const keys=store.openKeyCursor();
      keys.onsuccess=()=>{
        const cursor=keys.result;
        if(!cursor)return;
        const key=cursor.primaryKey;
        if(typeof key==='string'&&key.endsWith(':ink')&&key.startsWith('lemma.tutor.draft:')&&tutorStorageOwner(key)===ownerId)store.delete(key);
        cursor.continue();
      };
    });
  } finally {db.close();}
}

function checkedInkDraft(draft:InkDraft|undefined):InkDraft {
  if(draft&&(!Array.isArray(draft.strokes)||!Array.isArray(draft.photos)||draft.photos.some(image=>typeof image?.id!=='string')))
    throw storageUnavailable();
  if (!draft) return emptyInk;
  if (!draft.queuedAcceptedSpans) return draft;
  const spans = readTutorAcceptedSpans(draft.queuedText ?? '', draft.queuedAcceptedSpans);
  return {...draft, queuedAcceptedSpans: spans.length ? spans : undefined};
}
export async function readInkDraft(scope:TutorInkScope):Promise<InkDraft> {
  return checkedInkDraft(await persist({...scope},'readonly',(store,key)=>store.get(key)));
}
export function writeInkDraft(scope:TutorInkScope,draft:InkDraft) {
  return persist({...scope},'readwrite',(store,key)=>store.put(draft,key));
}
/** Apply selective cleanup to the latest row in the same transaction as the write. */
export function updateInkDraft(scope:TutorInkScope,change:(draft:InkDraft)=>InkDraft):Promise<InkDraft> {
  return persist({...scope},'readwrite',(store,key)=>store.get(key),(raw,store,key)=>{
    const before=checkedInkDraft(raw),next=checkedInkDraft(change(before));
    if(next!==before)store.put(next,key);
    return next;
  });
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
  if(getMode()==='demo'&&attachment.localData)return attachment.localData;
  const scope={ownerId:owner,generation:authGeneration()};
  const assertCurrent=()=>{if(!tutorLocalScopeActive(scope))throw accountChanged();};
  assertCurrent();
  const {liveClient}=await import('../live/client');
  assertCurrent();
  const {data,error}=await liveClient().storage.from('tutor-ink').download(owner+'/'+attachment.id);
  assertCurrent();
  if(error||!data)throw new Error('Could not open the image.');
  return URL.createObjectURL(data);
}
