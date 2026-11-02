import {beforeAll,describe,expect,it,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {verifyActionToken} from '../../../supabase/functions/notify/action-token';
import {attachPassiveReceipts} from '../../../supabase/functions/notify/passive-receipts';

beforeAll(()=>vi.stubGlobal('crypto',webcrypto));
const secret='test-only-notification-hmac-secret-longer-than-32-bytes';
const owner='123e4567-e89b-42d3-a456-426614174000';
const now=1793527200;
const base={
 v:1 as const,id:42,kind:'due',tag:'due',title:'23 cards due',
 body:'Start with five?',url:'#/review?start=5',
 actions:[
  {action:'review_5',title:'Review 5',url:'#/review?start=5'},
  {action:'later',title:'Later',token:'abc.def'},
 ],
 ts:now*1000,
};
const sign=(payload:unknown,change:Record<string,unknown>={})=>
 attachPassiveReceipts(JSON.stringify(payload),{
  ownerId:owner,secret,expiresAt:now+3600,nowSeconds:now,...change,
 });

describe('FIX-714a passive receipt producer signing',()=>{
 it('signs open and dismiss for the same owner and row without a third visible action',async()=>{
  const encoded=await sign(base);
  const payload=JSON.parse(encoded);
  expect(payload.v).toBe(1);
  expect(payload.id).toBe(42);
  expect(payload.actions).toEqual(base.actions);
  expect(payload.actions).toHaveLength(2);
  expect(Object.keys(payload).sort()).toEqual([
   'actions','body','dismissToken','id','kind','openToken','tag','title','ts','url','v',
  ]);
  expect(new TextEncoder().encode(encoded).length).toBeLessThanOrEqual(3072);
  expect(encoded).not.toContain(secret);
  expect(payload.openToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  expect(payload.dismissToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  expect(await verifyActionToken(payload.openToken,secret,now)).toEqual({
   u:owner,n:42,a:'open',exp:now+3600,
  });
  expect(await verifyActionToken(payload.dismissToken,secret,now)).toEqual({
   u:owner,n:42,a:'dismiss',exp:now+3600,
  });
  await expect(verifyActionToken(payload.openToken,secret+'wrong',now))
   .rejects.toMatchObject({status:401});
 });
 it('rejects a payload whose two signed receipts exceed the 3KB UTF-8 budget',async()=>{
  const near={...base,body:'x'.repeat(2700)};
  expect(new TextEncoder().encode(JSON.stringify(near)).length).toBeLessThan(3072);
  await expect(sign(near)).rejects.toThrow(/3 KB/);
 });
 it('measures the entire signed payload in UTF-8 bytes, not JS characters',async()=>{
  const unicode={...base,body:'∑'.repeat(900)};
  const raw=JSON.stringify(unicode);
  expect(raw.length).toBeLessThan(3072);
  expect(new TextEncoder().encode(raw).length).toBeLessThan(3072);
  await expect(sign(unicode)).rejects.toThrow(/3 KB/);
 });
 it('fails closed on missing or unsafe row identity and extra visible actions',async()=>{
  for(const invalid of [
   {...base,id:0},
   {...base,id:'9223372036854775807'},
   {...base,id:'0042'},
   {...base,actions:[...base.actions,{action:'open',title:'Open'}]},
   {...base,openToken:'unsigned'},
   {...base,dismissToken:'unsigned'},
   {...base,v:2},
  ])await expect(sign(invalid)).rejects.toThrow();
  await expect(attachPassiveReceipts('{bad',{
   ownerId:owner,secret,expiresAt:now+3600,nowSeconds:now,
  })).rejects.toThrow();
 });
 it('rejects invalid owner, expired tokens and expiry beyond 48 hours',async()=>{
  await expect(sign(base,{ownerId:'not-a-uuid'})).rejects.toThrow();
  await expect(sign(base,{expiresAt:now})).rejects.toThrow();
  await expect(sign(base,{expiresAt:now+48*3600+1})).rejects.toThrow();
 });
});
