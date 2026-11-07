// N83 durable review progress. The server position and immutable item states,
// not the browser's in-memory queue, determine progress after navigation.
export type RunItemState='pending'|'graded'|'stale';
export interface DurableRunItem{
 position:number;state:RunItemState;reviewId?:number|null;staleReason?:string|null;
}
export interface DurableRunProgress{
 position:number;total:number;graded:number;skipped:number;remaining:number;done:boolean;
}
/** Project exactly what N62's owner-scoped review_run_items and review_runs record. */
export function summarizeDurableRun(items:readonly DurableRunItem[],
 serverPosition:number):DurableRunProgress{
 if(!Number.isSafeInteger(serverPosition)||serverPosition<0||
  serverPosition>items.length)throw new Error('Invalid persisted review-run position');
 const seen=new Set<number>();
 for(const item of items){
  if(!Number.isSafeInteger(item.position)||item.position<0||
   item.position>=items.length||seen.has(item.position)||
   !['pending','graded','stale'].includes(item.state))
   throw new Error('Invalid or duplicated review-run item');
  seen.add(item.position);
  if(item.position<serverPosition&&item.state==='pending')
   throw new Error('Already advanced run item remains pending');
  if(item.position>=serverPosition&&item.state!=='pending')
   throw new Error('Unadvanced run item already settled');
  if(item.state==='graded'&&
   (item.reviewId==null||!Number.isSafeInteger(item.reviewId)||item.reviewId<1))
   throw new Error('Graded run item lacks a committed review');
  if(item.state==='stale'&&
   (!item.staleReason||!item.staleReason.trim()))
   throw new Error('Stale run item lacks an explanation');
 }
 return {position:serverPosition,total:items.length,
  graded:items.filter(item=>item.state==='graded').length,
  skipped:items.filter(item=>item.state==='stale').length,
  remaining:items.length-serverPosition,done:serverPosition===items.length};
}
