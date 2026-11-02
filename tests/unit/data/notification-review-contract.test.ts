import {describe,expect,it} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import type {LiveAdapter} from '../../../src/data/live/adapter';
import type {LemmaApi} from '../../../src/data/api';
import type {QueueFilter,ReviewItem} from '../../../src/data/types';

const filter:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};

// Compile-time guard: both adapters must implement the additive, bounded
// read without changing the ordinary getReviewItems(filter) signature.
type NotificationRead=(filter:QueueFilter,count:number)=>Promise<ReviewItem[]>;
const demoMethod:NotificationRead=DemoAdapter.prototype.getNotificationReviewItems;
const _liveMethod:NotificationRead=null as unknown as LiveAdapter['getNotificationReviewItems'];
const _apiMethod:NotificationRead=null as unknown as LemmaApi['getNotificationReviewItems'];

describe('CONTRACT NOTIF-7 one-shot queue',()=>{
 it('does not accidentally expose an unimplemented notification read as an ordinary due queue',async()=>{
  // A prototype call avoids constructing the large demo fixture; the
  // contract stub must fail explicitly until NOTIF-7 implements it.
  const demo=Object.create(DemoAdapter.prototype) as DemoAdapter;
  await expect(demoMethod.call(demo,filter,5)).rejects.toMatchObject({
   code:'not_implemented',message:'getNotificationReviewItems is not implemented yet',
  });
  expect(typeof _liveMethod).toBe('undefined');
  expect(typeof _apiMethod).toBe('undefined');
 });
});
