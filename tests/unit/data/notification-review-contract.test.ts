import {describe,expect,it} from 'vitest';
import {DemoAdapter,demoSeedFixture} from '../../../src/data/demo/adapter';
import type {QueueFilter} from '../../../src/data/types';

const filter:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};

describe('NOTIF-7 bounded one-shot Review N',()=>{
 it('returns five due cards with a saved daily goal of three without changing settings',async()=>{
  const fixture=structuredClone(demoSeedFixture);
  fixture.settings.reviewsPerDay=3;
  fixture.reviews=fixture.reviews.filter(r=>!r.reviewedAt.startsWith('@day:0:'));
  const api=new DemoAdapter({fixture,ownedFixture:true});
  const ordinary=await api.getReviewItems(filter);
  const linked=await api.getNotificationReviewItems(filter,5);
  expect(ordinary).toHaveLength(3);
  expect(linked).toHaveLength(5);
  expect(linked.slice(0,3).map(x=>x.cardId)).toEqual(ordinary.map(x=>x.cardId));
  expect((await api.getSettings()).reviewsPerDay).toBe(3);
  expect((await api.getReviewItems(filter)).map(x=>x.cardId)).toEqual(ordinary.map(x=>x.cardId));
 });
 it('bounds both adapters to an explicit integer 1–50 and leaves normal Start unchanged',async()=>{
  const api=new DemoAdapter();
  await expect(api.getNotificationReviewItems(filter,0)).rejects.toMatchObject({code:'invalid'});
  await expect(api.getNotificationReviewItems(filter,51)).rejects.toMatchObject({code:'invalid'});
  await expect(api.getNotificationReviewItems(filter,NaN)).rejects.toMatchObject({code:'invalid'});
  const {LiveAdapter}=await import('../../../src/data/live/adapter');
  const live=Object.create(LiveAdapter.prototype) as InstanceType<typeof LiveAdapter>;
  await expect(live.getNotificationReviewItems(filter,0)).rejects.toMatchObject({code:'invalid'});
 });
});
