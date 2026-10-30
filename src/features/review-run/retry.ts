import type {CardState,Rating,ReviewItem} from '../../data/types'
import type {ReviewQueue} from '../../lib/queue'

export interface RetryEntry {item:ReviewItem;remaining:number}

/** Again is a second pass of this round, not a new FSRS scheduling rule.
 * Persisted FSRS intervals remain untouched; the local retry becomes eligible
 * after two other answers (or sooner when the deck would otherwise be empty).
 */
export function afterRoundGrade(
 queue:ReviewQueue,
 pending:readonly RetryEntry[],
 card:ReviewItem,
 next:CardState,
 rating:Rating,
 now=Date.now(),
):{queue:ReviewQueue;pending:RetryEntry[]} {
 let waiting=pending.map(entry=>({...entry,remaining:entry.remaining-1}))
 let learning=queue.learning
 if(rating===1){
  // advanceQueue already scheduled the FSRS relearning state; replace its
  // in-round copy rather than reviewing it twice.
  learning=learning.filter(item=>item.cardId!==card.cardId)
  waiting=[...waiting,{item:{...card,state:{...next,due:new Date(now).toISOString()}},remaining:2}]
 }
 const ready=waiting.filter(entry=>entry.remaining<=0)
 let rest=waiting.filter(entry=>entry.remaining>0)
 const otherEligible=learning.some(item=>Date.parse(item.state.due)<=now+queue.settings.learnAheadMinutes*60000)
 if(!ready.length&&!otherEligible&&!queue.reviews.length&&!queue.fresh.length&&rest.length){
  ready.push(rest[0])
  rest=rest.slice(1)
 }
 return {queue:{...queue,learning:[...ready.map(entry=>entry.item),...learning]},pending:rest}
}
