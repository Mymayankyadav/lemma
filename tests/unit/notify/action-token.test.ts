import {beforeAll,describe,expect,it,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {ActionTokenError,signActionToken,verifyActionToken} from '../../../supabase/functions/notify/action-token';

beforeAll(()=>vi.stubGlobal('crypto',webcrypto));
const secret='a-local-test-only-secret-that-is-at-least-32-bytes-long';
const now=1793527200;
const user='123e4567-e89b-42d3-a456-426614174000';
const other='123e4567-e89b-42d3-a456-426614174001';
const card='123e4567-e89b-42d3-a456-426614174002';
const basic={u:user,n:42,a:'open' as const,exp:now+3600};
describe('NOTIF-4a authenticated action links',()=>{
 it('signs and verifies owner-bound HMAC with no secret in the token',async()=>{
  const token=await signActionToken(basic,secret,now);
  expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  expect(token).not.toContain(secret);
  expect(await verifyActionToken(token,secret,now)).toEqual(basic);
  await expect(verifyActionToken(token,secret+'different',now)).rejects.toMatchObject({status:400});
 });
 it('rejects tampered owner, action and notification id, even if base64 JSON is well-formed',async()=>{
  const token=await signActionToken(basic,secret,now);
  const [payload,mac]=token.split('.');
  const data=JSON.parse(Buffer.from(payload,'base64url').toString());
  for(const edit of [{u:other},{a:'undo'},{n:43}]){
   const forged=Buffer.from(JSON.stringify({...data,...edit})).toString('base64url')+'.'+mac;
   await expect(verifyActionToken(forged,secret,now)).rejects.toMatchObject({status:400});
  }
  await expect(verifyActionToken(token.slice(0,-1)+'?',secret,now)).rejects.toMatchObject({status:400});
 });
 it('expires at the exact deadline and rejects any expiry beyond 48h',async()=>{
  const token=await signActionToken(basic,secret,now);
  await expect(verifyActionToken(token,secret,now+3600)).rejects.toMatchObject({status:410});
  await expect(signActionToken({...basic,exp:now},secret,now)).rejects.toMatchObject({status:410});
  await expect(signActionToken({...basic,exp:now+48*3600+1},secret,now)).rejects.toMatchObject({status:400});
  const max=await signActionToken({...basic,exp:now+48*3600},secret,now);
  expect((await verifyActionToken(max,secret,now)).exp).toBe(now+48*3600);
 });
 it('bounds approvals to 50 valid UUIDs and undo to a positive safe action number',async()=>{
  const approved={...basic,a:'approve_cards' as const,x:{ids:[card]}};
  expect((await verifyActionToken(await signActionToken(approved,secret,now),secret,now)).x?.ids).toEqual([card]);
  await expect(signActionToken({...approved,x:{ids:Array(51).fill(card)}},secret,now)).rejects.toMatchObject({status:400});
  await expect(signActionToken({...approved,x:{ids:['bad-id']}},secret,now)).rejects.toMatchObject({status:400});
  await expect(signActionToken({...approved,x:{ids:[]}},secret,now)).rejects.toMatchObject({status:400});
  await expect(signActionToken({...basic,a:'undo',x:{action:0}},secret,now)).rejects.toMatchObject({status:400});
  expect((await verifyActionToken(await signActionToken({...basic,a:'undo',x:{action:123}},secret,now),secret,now)).x?.action).toBe(123);
 });
 it('rejects unknown actions, unknown fields, unsafe IDs, malformed payloads and oversized tokens',async()=>{
  for(const invalid of [
   {...basic,a:'delete'}, {...basic,n:0}, {...basic,n:Number.MAX_SAFE_INTEGER+1},
   {...basic,u:'bad'}, {...basic,exp:now+0.5}, {...basic,x:{scope:'x'.repeat(121)}},
   {...basic,x:{extra:true}},
  ]){
   await expect(signActionToken(invalid as typeof basic,secret,now)).rejects.toMatchObject({status:400});
  }
  await expect(verifyActionToken('x'.repeat(4097),secret,now)).rejects.toMatchObject({status:400});
  await expect(verifyActionToken('bad.token.with.dots',secret,now)).rejects.toMatchObject({status:400});
  await expect(signActionToken(basic,'short',now)).rejects.toBeInstanceOf(ActionTokenError);
 });
});
