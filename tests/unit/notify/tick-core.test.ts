import {afterEach,describe,expect,it,vi} from 'vitest';
import {runNotifyTick,type TickAdapters} from '../../../supabase/functions/notify/tick-core';

const A='11111111-1111-1111-1111-111111111111';
const B='22222222-2222-2222-2222-222222222222';
const NOW=1793527200000;
const facts=()=>({
 candidates:[{kind:'due' as const,key:'due:today',cardsDue:20,threshold:10}],
 context:{
  now:NOW,timeZone:'UTC',quietStart:'00:00',quietEnd:'00:00',
  mode:'as-happens' as const,dailyCap:3,sendsToday:0,
 },
});
const adapters=(owners:readonly string[]=[A]):TickAdapters=>({
 listEnabledOwners:vi.fn(async()=>owners),
 load:vi.fn(async()=>facts()),
 queue:vi.fn(async()=>1),
 deliver:vi.fn(async()=>({attempted:1,sent:1,failed:0})),
});
afterEach(()=>vi.useRealTimers());

describe('NOTIF-4b6b owner-scoped tick core',()=>{
 it('passes the owner UUID to every read/write/send and uses the existing rules',async()=>{
  const deps=adapters([A,B,A.toUpperCase()]);
  const result=await runNotifyTick(deps,{now:NOW});
  expect(result).toMatchObject({owners:2,queued:2,sent:2,skipped:0,failed:0,timedOut:false});
  expect(deps.load).toHaveBeenCalledTimes(2);
  expect(deps.load).toHaveBeenNthCalledWith(1,A,NOW,expect.any(AbortSignal));
  expect(deps.load).toHaveBeenNthCalledWith(2,B,NOW,expect.any(AbortSignal));
  expect(deps.queue).toHaveBeenCalledTimes(2);
  for(const [index,user] of [A,B].entries()){
   const [owner,decisions,signal]=vi.mocked(deps.queue).mock.calls[index];
   expect(owner).toBe(user);
   expect(decisions).toHaveLength(1);
   expect(decisions[0].status).toBe('send');
   expect(signal).toBeInstanceOf(AbortSignal);
   expect(vi.mocked(deps.deliver).mock.calls[index][0]).toBe(user);
  }
  expect(result.ms).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(result)).not.toMatch(/endpoint|token|secret|subscription/i);
 });
 it('never exceeds 50 attempted sends globally even when adapters return large batches',async()=>{
  const deps=adapters([A,B]);
  vi.mocked(deps.deliver).mockResolvedValueOnce({attempted:50,sent:45,failed:5});
  const result=await runNotifyTick(deps,{now:NOW,maxSends:500});
  expect(deps.deliver).toHaveBeenCalledTimes(1);
  expect(deps.deliver).toHaveBeenCalledWith(A,50,expect.any(AbortSignal));
  expect(deps.queue).toHaveBeenCalledTimes(2);
  expect(result).toMatchObject({owners:2,queued:2,sent:45,failed:5});
 });
 it('does not deliver previously queued rows after reminders are turned off',async()=>{
  const deps=adapters();
  vi.mocked(deps.load).mockResolvedValue({
   ...facts(),context:{...facts().context,mode:'off'},
  });
  const result=await runNotifyTick(deps,{now:NOW});
  expect(result).toMatchObject({owners:1,queued:1,sent:0,skipped:1,failed:0});
  expect(deps.deliver).not.toHaveBeenCalled();
 });
 it('allows a queue-only tick with zero sends while still persisting decisions',async()=>{
  const deps=adapters([A,B]);
  const result=await runNotifyTick(deps,{now:NOW,maxSends:0});
  expect(result).toMatchObject({owners:2,queued:2,sent:0,failed:0});
  expect(deps.queue).toHaveBeenCalledTimes(2);
  expect(deps.deliver).not.toHaveBeenCalled();
 });
 it('isolates owner errors and rejects malformed counts without reporting false success',async()=>{
  const deps=adapters([A,B]);
  vi.mocked(deps.load).mockRejectedValueOnce(Error('private endpoint and secret'));
  expect(await runNotifyTick(deps,{now:NOW})).toMatchObject({
   owners:2,queued:1,sent:1,failed:1,
  });
  const malformed=adapters([A]);
  vi.mocked(malformed.deliver).mockResolvedValue({attempted:51,sent:51,failed:0});
  expect(await runNotifyTick(malformed,{now:NOW})).toMatchObject({
   owners:1,queued:1,sent:0,failed:1,
  });
 });
 it('ignores duplicate/invalid owner IDs and does not call owner adapters for them',async()=>{
  const deps=adapters(['not-a-uuid',A,A.toUpperCase(),'']);
  const result=await runNotifyTick(deps,{now:NOW});
  expect(result.owners).toBe(1);
  expect(result.failed).toBe(2);
  expect(deps.load).toHaveBeenCalledTimes(1);
 });
 it('returns promptly on deadline and aborts a stalled adapter without false sends',async()=>{
  vi.useFakeTimers();
  const deps=adapters([A]);
  let entered!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve});
  vi.mocked(deps.load).mockImplementation(async()=>{
   entered();
   return new Promise<ReturnType<typeof facts>>(()=>{});
  });
  const pending=runNotifyTick(deps,{now:NOW,maxMs:10});
  await started;
  expect(deps.load).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(10);
  const result=await pending;
  expect(result).toMatchObject({owners:1,queued:0,sent:0,timedOut:true});
  expect(deps.queue).not.toHaveBeenCalled();
  expect(deps.deliver).not.toHaveBeenCalled();
  const signal=vi.mocked(deps.load).mock.calls[0][2];
  expect(signal.aborted).toBe(true);
 });
 it('does not start writes or sends after cancellation during an owner read',async()=>{
  const controller=new AbortController();
  const deps=adapters([A]);
  vi.mocked(deps.load).mockImplementation(async()=>{
   controller.abort();
   return facts();
  });
  const result=await runNotifyTick(deps,{now:NOW,signal:controller.signal});
  expect(result).toMatchObject({owners:1,queued:0,sent:0,timedOut:false});
  expect(deps.queue).not.toHaveBeenCalled();
  expect(deps.deliver).not.toHaveBeenCalled();
 });
 it('honors external cancellation before enumerating owners',async()=>{
  const controller=new AbortController();
  controller.abort();
  const deps=adapters();
  const result=await runNotifyTick(deps,{signal:controller.signal});
  expect(result).toMatchObject({owners:0,queued:0,sent:0,timedOut:false});
  expect(deps.listEnabledOwners).not.toHaveBeenCalled();
 });
 it('accepts idempotent zero-row inserts without treating them as failures',async()=>{
  const deps=adapters();
  vi.mocked(deps.queue).mockResolvedValue(0);
  const result=await runNotifyTick(deps,{now:NOW});
  expect(result).toMatchObject({queued:0,failed:0,sent:1});
 });
 it('never starts delivery when cancellation races an idempotent queue result',async()=>{
  const controller=new AbortController();
  const deps=adapters([A]);
  vi.mocked(deps.queue).mockImplementation(async()=>{
   controller.abort();
   return 1;
  });
  const result=await runNotifyTick(deps,{now:NOW,signal:controller.signal});
  expect(result).toMatchObject({owners:1,sent:0,timedOut:false});
  expect(deps.deliver).not.toHaveBeenCalled();
 });
 it('does not report delivery counts after external cancellation',async()=>{
  const controller=new AbortController();
  const deps=adapters([A]);
  vi.mocked(deps.deliver).mockImplementation(async()=>{
   controller.abort();
   return {attempted:1,sent:1,failed:0};
  });
  const result=await runNotifyTick(deps,{now:NOW,signal:controller.signal});
  expect(result).toMatchObject({owners:1,sent:0,failed:0,timedOut:false});
  expect(vi.mocked(deps.deliver)).toHaveBeenCalledTimes(1);
 });

});
