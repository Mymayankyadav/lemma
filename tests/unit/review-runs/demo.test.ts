import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {createDemoReviewRunApi} from '../../../src/data/review-runs/demo';
const KEY='lemma.v6.demo.review-runs.v1';
beforeEach(()=>{sessionStorage.clear();vi.useFakeTimers();
 vi.setSystemTime(new Date('2026-11-07T12:00:00Z'))});
afterEach(()=>{sessionStorage.clear();vi.useRealTimers()});
describe('N62.2 persisted demo review runs',()=>{
 it('has representative pending, graded, stale and paused sample records',async()=>{
  const api=createDemoReviewRunApi();
  expect(api.mode).toBe('demo');
  const list=await api.listRuns();
  expect(list.total).toBe(2);
  const running=list.items.find(r=>r.status==='running')!;
  const paused=list.items.find(r=>r.status==='paused')!;
  expect(paused.pausedAt).not.toBeNull();
  expect((await api.listRunItems(running.id)).items.map(i=>i.state))
   .toEqual(['pending','graded','stale']);
  expect((await api.listRunItems(paused.id)).total).toBe(1);
  expect((await api.getRun(running.id))?.version).toBe(1);
 });
 it('persists transitions across instances and conflicts on stale versions',async()=>{
  const a=createDemoReviewRunApi(),b=createDemoReviewRunApi();
  const running=(await a.listRuns({status:['running']})).items[0];
  const paused=await a.pauseRun(running.id,1);
  expect(paused.record).toMatchObject({status:'paused',version:2});
  await expect(b.pauseRun(running.id,1)).rejects.toMatchObject({code:'conflict'});
  expect((await b.getRun(running.id))?.status).toBe('paused');
  expect((await b.resumeRun(running.id,2)).record.status).toBe('running');
  await expect(a.completeRun(running.id,2)).rejects.toMatchObject({code:'conflict'});
  expect((await a.abandonRun(running.id,3)).record.status).toBe('abandoned');
  await expect(b.resumeRun(running.id,4)).rejects.toMatchObject({code:'conflict'});
 });
 it('links an external grade receipt exactly once, never grades cards itself',async()=>{
  const api=createDemoReviewRunApi();
  const running=(await api.listRuns({status:['running']})).items[0];
  const first=(await api.listRunItems(running.id)).items[0];
  const receipt=await api.advanceRun(running.id,1,{
   kind:'graded',itemId:first.id,reviewId:'9223372036854775807'});
  expect(receipt.record.item.reviewId).toBe('9223372036854775807');
  expect(receipt.record.run.position).toBe(1);
  await expect(api.advanceRun(running.id,2,{
   kind:'graded',itemId:first.id,reviewId:'5'})).rejects.toMatchObject({code:'conflict'});
  expect((await api.listRunItems(running.id)).items[0].version).toBe(2);
  expect(sessionStorage.getItem(KEY)).toContain('9223372036854775807');
 });
 it('rejects owner filters, changed run cursors, invalid draft and deep-copy mutation',async()=>{
  const api=createDemoReviewRunApi();
  await expect(api.listRuns({userId:'forged'} as never))
   .rejects.toMatchObject({code:'invalid'});
  await expect(api.listRunItems('wrong')).rejects.toMatchObject({code:'invalid'});
  await expect(api.startRun({settingsVersion:0,schedulerVersion:'x'}))
   .rejects.toMatchObject({code:'invalid'});
  const first=await api.listRuns({limit:1});
  expect(first.nextCursor).not.toBeNull();
  await expect(api.listRuns({status:['paused'],cursor:first.nextCursor}))
   .rejects.toMatchObject({code:'invalid'});
  first.items[0].filters.kind='changed';
  expect((await api.getRun(first.items[0].id))?.filters.kind).not.toBe('changed');
  const newRun=await api.startRun({settingsVersion:1,schedulerVersion:'fsrs-5'});
  expect(newRun.record).toMatchObject({status:'exhausted',endedAt:expect.any(String)});
  expect((await createDemoReviewRunApi().getRun(newRun.record.id))?.status)
   .toBe('exhausted');
 });
});
