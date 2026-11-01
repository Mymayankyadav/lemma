import {beforeEach,describe,expect,it,vi} from 'vitest';
import {sendWebPush,type DeliveryRequest} from '../../../supabase/functions/notify/delivery';

const prepare=vi.hoisted(()=>vi.fn());
vi.mock('../../../supabase/functions/_shared/webpush',()=>({
 prepareWebPush:prepare,
}));
const base:DeliveryRequest={
 subscription:{endpoint:'https://push.example.test/sub/123',keys:{p256dh:'test-key',auth:'test-auth'}},
 payload:{v:1,id:42,kind:'due',tag:'due',title:'23 cards due',body:'Start with five?',url:'#/review',actions:[],ts:1793527200000},
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
  expect(init.redirect).toBe('error');
  expect(init.body).toEqual(new Uint8Array([1,2,3]));
  expect(init.headers).toMatchObject({
   'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',
   Authorization:'vapid token',TTL:'21600',Urgency:'normal',Topic:'due',
  });
 });
 it('uses 24h low-urgency weekly digest and 10m confirmation TTL',async()=>{
  fetcher.mockResolvedValue(response(201));
  await sendWebPush({...base,kind:'digest',tag:'digest',payload:{...base.payload,kind:'digest',tag:'digest'}},fetcher);
  expect(fetcher.mock.calls[0][1].headers).toMatchObject({TTL:'86400',Urgency:'low',Topic:'digest'});
  await sendWebPush({...base,kind:'confirm',tag:'confirm',payload:{...base.payload,kind:'confirm',tag:'confirm'}},fetcher);
  expect(fetcher.mock.calls[1][1].headers).toMatchObject({TTL:'600',Urgency:'normal',Topic:'confirm'});
  await sendWebPush({...base,kind:'rhythm',tag:'rhythm',payload:{...base.payload,kind:'rhythm',tag:'rhythm'}},fetcher);
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
   {subscription:{...base.subscription,endpoint:'https://localhost/push'}},
   {subscription:{...base.subscription,endpoint:'https://localhost./push'}},
   {subscription:{...base.subscription,endpoint:'https://127.0.0.1/push'}},
   {subscription:{...base.subscription,endpoint:'https://[::1]/push'}},
   {tag:'bad topic'},
   {tag:'x'.repeat(33)},
   {kind:'unexpected' as DeliveryRequest['kind']},
   {kind:'digest'},
   {tag:'another'},
   {payload:{...base.payload,kind:undefined}},
   {payload:{...base.payload,tag:undefined}},
   {payload:{...base.payload,v:2}},
   {payload:{...base.payload,id:0}},
   {payload:{...base.payload,title:'x'.repeat(49)}},
   {payload:{...base.payload,body:'x'.repeat(141)}},
   {payload:{...base.payload,url:'javascript:alert(1)'}},
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
 it('rejects push-service redirects rather than following a POST to a second destination',async()=>{
  fetcher.mockImplementationOnce(async(_url:string,init:RequestInit)=>{
   expect(init.redirect).toBe('error');
   // Real fetch with redirect:error rejects before issuing a second request.
   throw new TypeError('redirect blocked');
  });
  expect(await sendWebPush(base,fetcher)).toEqual({status:'retry'});
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValueOnce(response(307));
  expect(await sendWebPush(base,fetcher)).toEqual({status:'failed',httpStatus:307});
  expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('rejects missing, malformed or extra fields in the exact v1 envelope before encryption',async()=>{
  const invalid=[
   {actions:undefined},{ts:undefined},{actions:null},{actions:'not-an-array'},
   {actions:Array(3).fill({action:'open',title:'Open'})},
   {actions:[{action:'not valid',title:'Open'}]},
   {actions:[{action:'open',title:'Open',secret:'unexpected'}]},
   {actions:[{action:'open',title:'Open',url:'https://evil.example/'}]},
   {actions:[{action:'later',title:'Later',token:'not a token'}]},
   {actions:[{action:'later',title:'Later',title2:'private'}]},
   {ts:0},{ts:Infinity},{ts:1.5},{id:'9223372036854775808'},
   {url:'https://evil.example/redirect'},{url:'//evil.example/path'},
   {url:'#/review\nother'},{secret:'unexpected'},
  ];
  for(const change of invalid){
   expect(await sendWebPush({...base,payload:{...base.payload,...change}},fetcher),JSON.stringify(change))
    .toEqual({status:'failed'});
  }
  expect(fetcher).not.toHaveBeenCalled();
  expect(prepare).not.toHaveBeenCalled();
 });

});
