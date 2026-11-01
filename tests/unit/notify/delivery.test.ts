import {beforeEach,describe,expect,it,vi} from 'vitest';
import {sendWebPush,type DeliveryRequest} from '../../../supabase/functions/notify/delivery';

const prepare=vi.hoisted(()=>vi.fn());
vi.mock('../../../supabase/functions/_shared/webpush',()=>({
 prepareWebPush:prepare,
}));
const base:DeliveryRequest={
 subscription:{endpoint:'https://push.example.test/sub/123',keys:{p256dh:'test-key',auth:'test-auth'}},
 payload:{v:1,id:42,kind:'due',tag:'due',title:'23 cards due',body:'Start with five?',url:'#/review'},
 vapid:{publicKey:'public',privateKey:'private',subject:'mailto:test@example.test'},
 kind:'due',tag:'due',
};
const response=(status:number)=>({status}) as Response;
const fetcher=vi.fn();
beforeEach(()=>{
 prepare.mockReset();
 fetcher.mockReset();
 prepare.mockResolvedValue({body:new Uint8Array([1,2,3]),headers:{
  'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',
  Authorization:'vapid token',
 }});
});
describe('NOTIF-4b2 bounded Web Push delivery',()=>{
 it('sends the encrypted bytes with exact TTL, urgency and topic headers',async()=>{
  fetcher.mockResolvedValue(response(201));
  expect(await sendWebPush(base,fetcher)).toEqual({status:'sent',httpStatus:201});
  expect(prepare).toHaveBeenCalledWith(base.subscription,JSON.stringify(base.payload),base.vapid);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url,init]=fetcher.mock.calls[0] as [string,RequestInit];
  expect(url).toBe(base.subscription.endpoint);
  expect(init.method).toBe('POST');
  expect(init.body).toEqual(new Uint8Array([1,2,3]));
  expect(init.headers).toMatchObject({
   'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',
   Authorization:'vapid token',TTL:'21600',Urgency:'normal',Topic:'due',
  });
 });
 it('uses 24h low-urgency weekly digest and 10m confirmation TTL',async()=>{
  fetcher.mockResolvedValue(response(201));
  await sendWebPush({...base,kind:'digest',tag:'digest'},fetcher);
  expect(fetcher.mock.calls[0][1].headers).toMatchObject({TTL:'86400',Urgency:'low',Topic:'digest'});
  await sendWebPush({...base,kind:'confirm',tag:'confirm'},fetcher);
  expect(fetcher.mock.calls[1][1].headers).toMatchObject({TTL:'600',Urgency:'normal',Topic:'confirm'});
  await sendWebPush({...base,kind:'rhythm',tag:'rhythm'},fetcher);
  expect(fetcher.mock.calls[2][1].headers).toMatchObject({TTL:'21600',Urgency:'low',Topic:'rhythm'});
 });
 it('disables gone subscriptions on 404/410 without retry',async()=>{
  for(const code of [404,410]){
   fetcher.mockResolvedValueOnce(response(code));
   expect(await sendWebPush(base,fetcher)).toEqual({status:'gone',httpStatus:code});
  }
 });
 it('retries 429 and 5xx only on the next two ticks, never indefinitely',async()=>{
  for(const code of [429,500,503]){
   for(const priorFailures of [0,1,2]){
    fetcher.mockResolvedValueOnce(response(code));
    expect(await sendWebPush({...base,priorFailures},fetcher)).toEqual({
     status:priorFailures<2?'retry':'failed',httpStatus:code,
    });
   }
  }
  fetcher.mockRejectedValueOnce(Error('private endpoint'));
  expect(await sendWebPush(base,fetcher)).toEqual({status:'retry'});
  fetcher.mockRejectedValueOnce(Error('private endpoint'));
  expect(await sendWebPush({...base,priorFailures:2},fetcher)).toEqual({status:'failed'});
 });
 it('fails on 413 and other unexpected statuses without retry or leaking response bodies',async()=>{
  for(const code of [200,204,400,401,403,413]){
   fetcher.mockResolvedValueOnce(response(code));
   expect(await sendWebPush(base,fetcher)).toEqual({status:'failed',httpStatus:code});
  }
 });
 it('never makes a network request for invalid endpoints, topics or oversized JSON',async()=>{
  for(const change of [
   {subscription:{...base.subscription,endpoint:'http://push.example.test/sub'}},
   {subscription:{...base.subscription,endpoint:'https://user:pass@push.example.test/sub'}},
   {tag:'bad topic'},
   {tag:'x'.repeat(33)},
   {payload:{...base.payload,body:'x'.repeat(3100)}},
  ]){
   expect(await sendWebPush({...base,...change},fetcher)).toEqual({status:'failed'});
  }
  expect(fetcher).not.toHaveBeenCalled();
 });
 it('does not call the push service when encryption or VAPID preparation fails',async()=>{
  prepare.mockRejectedValueOnce(Error('secret or key details'));
  expect(await sendWebPush(base,fetcher)).toEqual({status:'failed'});
  expect(fetcher).not.toHaveBeenCalled();
 });
 it('forwards the caller cancellation signal and never exposes endpoint or credentials in results',async()=>{
  const controller=new AbortController();
  fetcher.mockRejectedValueOnce(Error('sensitive endpoint details'));
  const result=await sendWebPush({...base,signal:controller.signal},fetcher);
  expect(fetcher.mock.calls[0][1].signal).toBe(controller.signal);
  expect(JSON.stringify(result)).not.toMatch(/sensitive|endpoint|vapid|private/i);
 });
});
