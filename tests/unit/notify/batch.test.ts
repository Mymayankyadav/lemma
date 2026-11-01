import {afterEach,describe,expect,it,vi} from 'vitest';
import {sendPushBatch} from '../../../supabase/functions/notify/batch';
import type {DeliveryRequest} from '../../../supabase/functions/notify/delivery';

const send=vi.hoisted(()=>vi.fn());
vi.mock('../../../supabase/functions/notify/delivery',()=>({sendWebPush:send}));
const request=(i:number):DeliveryRequest=>({
 subscription:{endpoint:'https://push.example.test/'+i,keys:{p256dh:'public',auth:'auth'}},
 payload:{v:1,id:i},vapid:{publicKey:'pub',privateKey:'priv',subject:'mailto:test@example.test'},
 kind:'due',tag:'due',
});
afterEach(()=>{vi.useRealTimers();send.mockReset()});
describe('NOTIF-4b2 50-send/20-second bounded batch',()=>{
 it('never starts more than 50 sends and preserves input-index results',async()=>{
  send.mockResolvedValue({status:'sent',httpStatus:201});
  const result=await sendPushBatch(Array.from({length:55},(_,i)=>request(i)));
  expect(send).toHaveBeenCalledTimes(50);
  expect(result).toMatchObject({attempted:50,deferred:5,timedOut:false});
  expect(result.results).toHaveLength(50);
  expect(result.results.map(r=>r.index)).toEqual(Array.from({length:50},(_,i)=>i));
 });
 it('limits concurrent encrypted requests to four and forwards one abort signal',async()=>{
  let active=0,peak=0;
  const signals=new Set<AbortSignal>();
  send.mockImplementation(async(req:DeliveryRequest)=>{
   active++;peak=Math.max(peak,active);
   signals.add(req.signal!);
   await Promise.resolve();
   active--;
   return {status:'sent'};
  });
  const result=await sendPushBatch(Array.from({length:20},(_,i)=>request(i)));
  expect(result).toMatchObject({attempted:20,deferred:0,timedOut:false});
  expect(peak).toBeLessThanOrEqual(4);
  expect(signals.size).toBe(1);
 });
 it('aborts by the strict deadline and never claims unfinished sends succeeded',async()=>{
  vi.useFakeTimers();
  send.mockImplementation(()=>new Promise(()=>{}));
  const pending=sendPushBatch(Array.from({length:9},(_,i)=>request(i)),{maxMs:100});
  await vi.advanceTimersByTimeAsync(100);
  const result=await pending;
  expect(result).toMatchObject({attempted:4,deferred:9,timedOut:true,results:[]});
  expect(send).toHaveBeenCalledTimes(4);
  expect((send.mock.calls[0][0] as DeliveryRequest).signal?.aborted).toBe(true);
 });
 it('returns empty results without any network work for an empty batch',async()=>{
  const result=await sendPushBatch([]);
  expect(result).toEqual({attempted:0,deferred:0,timedOut:false,results:[]});
  expect(send).not.toHaveBeenCalled();
 });
 it('clamps caller-requested 500 sends and 100 workers to the hard limits',async()=>{
  let active=0,peak=0;
  send.mockImplementation(async()=>{
   active++;peak=Math.max(peak,active);
   await Promise.resolve();
   active--;
   return {status:'sent'};
  });
  const result=await sendPushBatch(Array.from({length:60},(_,i)=>request(i)),{
   maxSends:500,concurrency:100,
  });
  expect(result).toMatchObject({attempted:50,deferred:10,timedOut:false});
  expect(peak).toBeLessThanOrEqual(4);
 });
 it('never leaks an unexpected transport exception or claims it was sent',async()=>{
  send.mockRejectedValueOnce(Error('secret endpoint credential'));
  send.mockResolvedValue({status:'sent'});
  const result=await sendPushBatch([request(0),request(1)]);
  expect(result.attempted).toBe(2);
  expect(result.results[0].result).toEqual({status:'retry'});
  expect(JSON.stringify(result)).not.toMatch(/secret|endpoint|credential/i);
 });
 it('respects caller cancellation without waiting for the full tick deadline',async()=>{
  const controller=new AbortController();
  controller.abort();
  expect(await sendPushBatch([request(0)],{signal:controller.signal}))
   .toEqual({attempted:0,deferred:1,timedOut:false,results:[]});
  expect(send).not.toHaveBeenCalled();

  const second=new AbortController();
  send.mockImplementation(()=>new Promise(()=>{}));
  const pending=sendPushBatch([request(0),request(1),request(2)],{signal:second.signal});
  second.abort();
  const result=await pending;
  expect(result).toMatchObject({timedOut:false,deferred:3,results:[]});
  expect(send).toHaveBeenCalledTimes(3);
 });
 it('caps an oversized requested deadline at 19.5 seconds',async()=>{
  vi.useFakeTimers();
  send.mockImplementation(()=>new Promise(()=>{}));
  const pending=sendPushBatch([request(0)],{maxMs:60_000});
  await vi.advanceTimersByTimeAsync(19_500);
  const result=await pending;
  expect(result).toMatchObject({attempted:1,deferred:1,timedOut:true,results:[]});
 });
});
