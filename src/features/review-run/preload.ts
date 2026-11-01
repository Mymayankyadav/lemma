import {getApi} from '../../data';
import type {QueueFilter,ReviewItem} from '../../data/types';

/** Direct cold demo Review-run may start its first bounded read while the
 * route chunk is downloading. Only the first matching query consumes this
 * promise; all later reads (and filtered reads) go through the normal API.
 * No global cache, live-user prefetch, storage or network analytics.
 */
const key=(filter:QueueFilter)=>JSON.stringify([
 filter.decks,filter.sessionId,filter.conceptSlug,filter.includeNew,filter.newOnly,
]);

export function createOneShotReviewPrefetch<T>(load:(filter:QueueFilter)=>Promise<T>){
 let pending:{key:string;promise:Promise<T>}|null=null;
 let consumed=false;
 return {
  warm(filter:QueueFilter):void{
   if(consumed||pending)return;
   const promise=Promise.resolve().then(()=>load(filter));
   pending={key:key(filter),promise};
   // A failed speculative read must never poison the real route query.
   void promise.catch(()=>{if(pending?.promise===promise)pending=null});
  },
  take(filter:QueueFilter):Promise<T>{
   consumed=true;
   if(pending?.key===key(filter)){
    const promise=pending.promise;
    pending=null;
    return promise;
   }
   pending=null;
   return load(filter);
  },
 };
}

export const defaultReviewRunFilter:QueueFilter={
 decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false,
};
const firstRead=createOneShotReviewPrefetch<ReviewItem[]>(
 filter=>getApi().getReviewItems(filter),
);
export const warmReviewRun=(filter:QueueFilter)=>firstRead.warm(filter);
export const getReviewRunItems=(filter:QueueFilter)=>firstRead.take(filter);
