// N83 durable review run projections: count completed and skipped cards
// independently from the in-memory review queue after a page reload.
export type RunItemState='pending'|'current'|'graded'|'skipped';
export interface DurableRunItem{
 position:number;status:RunItemState;grade?:number|null;
}
export interface DurableRunProgress{
 position:number;total:number;graded:number;skipped:number;remaining:number;done:boolean;
}
export function summarizeDurableRun(items:readonly DurableRunItem[]):DurableRunProgress{
 const seen=new Set<number>();
 for(const item of items){
  if(!Number.isSafeInteger(item.position)||item.position<0||
   seen.has(item.position)||!['pending','current','graded','skipped'].includes(item.status))
   throw new Error('Invalid or duplicated review-run position');
  seen.add(item.position);
 }
 const ordered=[...items].sort((a,b)=>a.position-b.position);
 const next=ordered.find(item=>item.status==='current'||item.status==='pending');
 const graded=ordered.filter(item=>item.status==='graded').length;
 const skipped=ordered.filter(item=>item.status==='skipped').length;
 return {position:next?.position??ordered.length,total:ordered.length,
  graded,skipped,remaining:ordered.length-graded-skipped,
  done:!next};
}
