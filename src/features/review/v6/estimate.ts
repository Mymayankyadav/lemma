import {useQuery} from '@tanstack/react-query';
import {getApi} from '../../../data';
import {estimatedReviewMinutes} from '../../../lib/insights';

/** N121 C4: the owner's real average review time (from the last 30 days), 25 s per card without history.
 * Today enables it only after first paint; until it loads the caller shows the count without a time. */
export function useReviewEstimate(count:number,enabled=true):number|null{
 const insights=useQuery({queryKey:['insights',30],queryFn:()=>getApi().getInsightData(30),
  enabled:enabled&&count>0,staleTime:300_000});
 if(count<=0)return 0;
 if(!insights.data)return insights.isError?Math.max(1,estimatedReviewMinutes(count)):null;
 return Math.max(1,estimatedReviewMinutes(count,insights.data.reviews));
}
