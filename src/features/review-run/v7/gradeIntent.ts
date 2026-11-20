import {authGeneration,authOwner} from '../../../data/authBoundary';
import {liveClient} from '../../../data/live/client';
import {cardStateDb,checked,owner} from '../../../data/live/helpers';
import type {RecordReviewInput} from '../../../data/types';
import {readDurableRun,type DurableRun} from '../v6/transport';

export type GradeIntent=RecordReviewInput&{
 operationId:string; ownerId:string; runId:string; runVersion:number; itemId:string; expectedVersion:number;
};
const storageKey=(ownerId:string,runId:string)=>'lemma.study.grade.v1.'+ownerId+'.'+runId;

export function savedGrade(ownerId:string,runId:string):GradeIntent|null{
 const raw=localStorage.getItem(storageKey(ownerId,runId));
 if(!raw)return null;
 const value=JSON.parse(raw) as GradeIntent;
 if(value.ownerId!==ownerId||value.runId!==runId||typeof value.operationId!=='string'||
    typeof value.itemId!=='string'||typeof value.cardId!=='string'||!value.next||
    !Number.isSafeInteger(value.runVersion)||!Number.isSafeInteger(value.expectedVersion))
  throw Error('The saved grade could not be read. Reload this round before grading.');
 return value;
}

/** Freeze the exact schedule and key before a network request. A lost response must replay both. */
export function saveGrade(run:DurableRun,input:RecordReviewInput):GradeIntent{
 const ownerId=authOwner(),item=run.items[run.position];
 if(!ownerId||!item||item.cardId!==input.cardId)throw Error('Reload the signed-in review round.');
 const previous=savedGrade(ownerId,run.id);
 if(previous)return previous;
 const intent={...input,operationId:crypto.randomUUID(),ownerId,runId:run.id,runVersion:run.version,
  itemId:item.id,expectedVersion:item.expectedCardVersion};
 localStorage.setItem(storageKey(ownerId,run.id),JSON.stringify(intent));
 return intent;
}
function clearGrade(intent:GradeIntent){
 if(savedGrade(intent.ownerId,intent.runId)?.operationId===intent.operationId)
  localStorage.removeItem(storageKey(intent.ownerId,intent.runId));
}

/** Reading the durable run is part of confirmation. Keep the intent through a lost RPC or read response. */
export async function confirmGrade(intent:GradeIntent):Promise<{run:DurableRun;applied:boolean}>{
 const generation=authGeneration(),db=liveClient();
 const assertOwner=()=>{
  if(authGeneration()!==generation||authOwner()!==intent.ownerId)throw Error('The signed-in account changed.');
 };
 assertOwner();
 if(await owner(db)!==intent.ownerId)throw Error('The signed-in account changed.');
 assertOwner();
 const result=checked(await db.rpc('grade_study_run_item',{
  p_operation_id:intent.operationId,p_run:intent.runId,p_item:intent.itemId,p_card:intent.cardId,
  p_run_version:intent.runVersion,p_card_version:intent.expectedVersion,p_rating:intent.rating,
  p_confidence:intent.confidence,p_duration_ms:intent.durationMs,p_next:cardStateDb(intent.next),
 }));
 assertOwner();
 if(!result||result.operationId!==intent.operationId||!['applied','conflict'].includes(result.status))
  throw Error('The grade receipt could not be verified.');
 const run=await readDurableRun(intent.runId);
 assertOwner();
 if(!run)throw Error('The graded round could not be reopened.');
 if(result.status==='applied'){
  const item=run.items.find(row=>row.id===intent.itemId);
  if(result.runId!==run.id||result.itemId!==intent.itemId||result.cardId!==intent.cardId||
     !Number.isSafeInteger(result.reviewId)||!Number.isSafeInteger(result.runVersion)||run.version<result.runVersion||
     !item||item.cardId!==intent.cardId||run.version===result.runVersion&&item.reviewId!==result.reviewId)
   throw Error('The graded item could not be verified.');
 }
 clearGrade(intent);
 return {run,applied:result.status==='applied'};
}
