/** Browser-safe contracts. No Edge runtime or privileged client imports belong here. */
export type PracticeDelivery =
  | {status:'unavailable'}
  | {status:'available';question:string;arm:string;itemId:string;itemVersion:number;requestId:string;projectId:string};

export interface PracticeOutcome {
  result:'ok'|'fail';
  hintLevel:number;
  novelty:'novel'|'familiar'|'seen_solution';
  minutes?:number;
  sessionId?:string;
}
export interface PracticeScoreRequest {
  operationId:string;
  requestId:string;
  /** A tutor may relay the learner's explicit assessment, never infer one. */
  learnerConfirmed:true;
  outcome:PracticeOutcome;
}
export interface PracticeScoreReceipt {
  status:'ok';operationId:string;requestId:string;attemptId:string;actionNo:number;
}
/** A narrowly recognized pre-write rejection, never an uncertain acknowledgement. */
export interface PracticeScoreRejection {
  status:'rejected';code:'practice_session_unavailable';operationId:string;requestId:string;
}
export class PracticeScoreRejectedError extends Error {
  constructor(readonly rejection:PracticeScoreRejection){
    super('This study session is no longer available. Your result was not saved. Choose another open session or practice outside a session, then save again.');
    this.name='PracticeScoreRejectedError';
  }
}
export const validPracticeRequest=(id:unknown):id is string=>
  typeof id==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function validPracticeOutcome(value:unknown):value is PracticeOutcome {
  if(!object(value)||Object.keys(value).some(k=>!['result','hintLevel','novelty','minutes','sessionId'].includes(k)))return false;
  return (value.result==='ok'||value.result==='fail')&&Number.isInteger(value.hintLevel)&&Number(value.hintLevel)>=0&&Number(value.hintLevel)<=4&&
    ['novel','familiar','seen_solution'].includes(String(value.novelty))&&
    (!('minutes' in value)||typeof value.minutes==='number'&&Number.isFinite(value.minutes)&&value.minutes>=0&&value.minutes<=600)&&
    (!('sessionId' in value)||validPracticeRequest(value.sessionId));
}
export function validPracticeScore(value:unknown):value is PracticeScoreRequest {
  return object(value)&&Object.keys(value).every(k=>['operationId','requestId','learnerConfirmed','outcome'].includes(k))&&
    validPracticeRequest(value.operationId)&&validPracticeRequest(value.requestId)&&value.learnerConfirmed===true&&validPracticeOutcome(value.outcome);
}
export function validPracticeScoreRejection(value:unknown):value is PracticeScoreRejection {
  return object(value)&&Object.keys(value).every(k=>['status','code','operationId','requestId'].includes(k))&&
    value.status==='rejected'&&value.code==='practice_session_unavailable'&&
    validPracticeRequest(value.operationId)&&validPracticeRequest(value.requestId);
}
