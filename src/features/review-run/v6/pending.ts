// A review grade is irreversible until the user explicitly undoes it.
// Persist its receipt BEFORE advancing the run, so a reload never grades twice.
const KEY='lemma.v6.pending-review-advance.v1';
export interface PendingGrade{runId:string;itemId:string;reviewId:number}
export function pendingGrade():PendingGrade|null{
 try{
  const item=JSON.parse(sessionStorage.getItem(KEY)??'null') as PendingGrade|null;
  return item&&typeof item.runId==='string'&&typeof item.itemId==='string'&&
   Number.isSafeInteger(item.reviewId)&&item.reviewId>0?item:null;
 }catch{return null;}
}
export function writePendingGrade(item:PendingGrade):void{
 sessionStorage.setItem(KEY,JSON.stringify(item));
}
export function clearPendingGrade():void{
 sessionStorage.removeItem(KEY);
}
