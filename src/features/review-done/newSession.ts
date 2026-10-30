import type {LemmaApi} from '../../data/api';
import type {QueueFilter,ReviewItem} from '../../data/types';
import type {QueueSettings} from '../../lib/queue';

/** Start a separate new-only session round, never reusing the completed queue. */
export async function prepareSessionNewRound(
 api:Pick<LemmaApi,'getReviewItems'>,
 settings:QueueSettings,
 filter:QueueFilter,
 initialize:(items:ReviewItem[],settings:QueueSettings,filter:QueueFilter)=>void,
):Promise<boolean>{
 if(!filter.sessionId)return false;
 const nextFilter:QueueFilter={...filter,includeNew:true,newOnly:true};
 const cards=(await api.getReviewItems(nextFilter)).filter(card=>card.state.state===0);
 if(!cards.length)return false;
 initialize(cards,settings,nextFilter);
 return true;
}
