import type {ProjectDetail} from '../../data/types';
import {scheduleForProject,type CompletionEvent} from '../../ui/timeline/progress';

/** The checkpoint sheet, project Route and stage list render the same plan.
 * Cache its immutable React Query snapshot for one minute so cold entry does
 * not build the same schedule three times (or again under StrictMode).
 * A new project/events snapshot or minute always recalculates.
 */
const scheduleCache=new WeakMap<ProjectDetail,{
 events:readonly CompletionEvent[]|undefined;
 minute:number;
 result:ReturnType<typeof scheduleForProject>;
}>();

export function scheduleForVisibleProject(
 detail:ProjectDetail,
 events?:readonly CompletionEvent[],
 now=Date.now(),
):ReturnType<typeof scheduleForProject>{
 const minute=Math.floor(now/60_000);
 const cached=scheduleCache.get(detail);
 if(cached&&cached.events===events&&cached.minute===minute)return cached.result;
 const result=scheduleForProject(detail,events,now);
 scheduleCache.set(detail,{events,minute,result});
 return result;
}
