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
});
