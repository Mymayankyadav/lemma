import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {createDemoReviewRunApi} from '../../../src/data/review-runs/demo';
import type {ReviewRunRecord,ReviewRunItemRecord} from '../../../src/data/review-runs/contract';
const KEY='lemma.v6.demo.review-runs.v1';
const uuid=(n:number)=>'11111111-1111-4111-8111-'+n.toString(16).padStart(12,'0');
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
 it('walks >50 run and item records with exact totals, independent cursor locks and immutable pages',async()=>{
  createDemoReviewRunApi();
  const stored=JSON.parse(sessionStorage.getItem(KEY)!) as {
   schema:1;runs:ReviewRunRecord[];items:ReviewRunItemRecord[]
  };
  const base=stored.runs[0],baseItem=stored.items[0];
  const runs=Array.from({length:55},(_,n)=>({
   ...base,id:uuid(100+n),createdAt:new Date(Date.parse(base.createdAt)+n*60_000).toISOString(),
  }));
  const items=Array.from({length:57},(_,n)=>({
   ...baseItem,id:uuid(1000+n),runId:runs[0].id,position:n,cardId:uuid(2000+n),
  }));
  sessionStorage.setItem(KEY,JSON.stringify({schema:1,runs,items}));
  const api=createDemoReviewRunApi();
  const seen:string[]=[];let cursor:string|null=null;
  for(let step=0;step<10;step++){
   const page=await api.listRuns({limit:7,cursor});
   expect(page.total).toBe(55);
   seen.push(...page.items.map(r=>r.id));
   cursor=page.nextCursor;
   if(cursor===null)break;
  }
  expect(seen).toHaveLength(55);
  expect(new Set(seen).size).toBe(55);
  const first=await api.listRunItems(runs[0].id,{limit:50});
  expect(first).toMatchObject({total:57});
  expect(first.items).toHaveLength(50);
  expect(first.nextCursor).not.toBeNull();
  const second=await api.listRunItems(runs[0].id,{limit:50,cursor:first.nextCursor});
  expect(second.items).toHaveLength(7);
  expect(new Set([...first.items,...second.items].map(i=>i.id)).size).toBe(57);
  await expect(api.listRunItems(runs[1].id,{cursor:first.nextCursor}))
   .rejects.toMatchObject({code:'invalid'});
  const firstRunPage=await api.listRuns({limit:1});
  await expect(api.listRuns({status:['paused'],limit:1,cursor:firstRunPage.nextCursor}))
   .rejects.toMatchObject({code:'invalid'});
  first.items[0].state='stale';
  expect((await api.listRunItems(runs[0].id,{limit:1})).items[0].state)
   .toBe('pending');
  const paused=await api.pauseRun(runs[0].id,1);
  expect(paused.record.version).toBe(2);
  expect((await api.listRunItems(runs[1].id)).total).toBe(0);
  expect((await createDemoReviewRunApi().getRun(runs[0].id))?.status).toBe('paused');
 });
 it('rejects corrupt persisted owner fields rather than exposing them through demo APIs',async()=>{
  createDemoReviewRunApi();
  const snapshot=JSON.parse(sessionStorage.getItem(KEY)!);
  snapshot.runs[0].userId=uuid(901);
  sessionStorage.setItem(KEY,JSON.stringify(snapshot));
  const restarted=createDemoReviewRunApi();
  const records=await restarted.listRuns();
  expect(records.total).toBe(2);
  expect(records.items[0]).not.toHaveProperty('userId');
  expect(sessionStorage.getItem(KEY)).not.toContain('userId');
  const again=JSON.parse(sessionStorage.getItem(KEY)!);
  again.items[0].user_id=uuid(902);
  sessionStorage.setItem(KEY,JSON.stringify(again));
  const next=createDemoReviewRunApi();
  expect((await next.listRunItems(again.runs[0].id)).items[0])
   .not.toHaveProperty('user_id');
 });

});
