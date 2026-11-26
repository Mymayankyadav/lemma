// A review grade is irreversible until the user explicitly undoes it.
// Persist its receipt BEFORE advancing the run, so a reload never grades twice.
const LEGACY_KEY='lemma.v6.pending-review-advance.v1';
const RECEIPTS_KEY='lemma.v6.pending-review-advance.v2';
export interface PendingGrade{runId:string;itemId:string;reviewId:number}
function read(key:string):unknown{
 try{return JSON.parse(sessionStorage.getItem(key)??'null');}
 catch{return null;}
}
function isReceipt(value:unknown):value is PendingGrade{
 const item=value as PendingGrade|null;
 return !!item&&typeof item.runId==='string'&&typeof item.itemId==='string'&&
  Number.isSafeInteger(item.reviewId)&&item.reviewId>0;
}
function receipts():PendingGrade[]{
 const current=read(RECEIPTS_KEY);
 return Array.isArray(current)?current.filter(isReceipt):[];
}
function legacyReceipt():PendingGrade|null{
 const legacy=read(LEGACY_KEY);
 return isReceipt(legacy)?legacy:null;
}
export function pendingGrade(runId?:string):PendingGrade|null{
 const current=receipts(),match=runId===undefined?current.at(-1):current.find(receipt=>receipt.runId===runId);
 if(match)return match;
 const legacy=legacyReceipt();
 return runId===undefined||legacy?.runId===runId?legacy:null;
}
export function writePendingGrade(item:PendingGrade):void{
 const current=receipts().filter(receipt=>receipt.runId!==item.runId);
 sessionStorage.setItem(RECEIPTS_KEY,JSON.stringify([...current,item]));
 if(legacyReceipt()?.runId===item.runId)sessionStorage.removeItem(LEGACY_KEY);
}
export function clearPendingGrade(expected:PendingGrade|null=pendingGrade()):void{
 if(!expected)return;
 const matches=(stored:PendingGrade|null)=>stored?.runId===expected.runId&&stored.itemId===expected.itemId&&stored.reviewId===expected.reviewId;
 const current=receipts(),remaining=current.filter(receipt=>!matches(receipt));
 if(remaining.length!==current.length){
  if(remaining.length)sessionStorage.setItem(RECEIPTS_KEY,JSON.stringify(remaining));
  else sessionStorage.removeItem(RECEIPTS_KEY);
 }
 if(matches(legacyReceipt()))sessionStorage.removeItem(LEGACY_KEY);
}
