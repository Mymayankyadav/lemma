import {beforeAll,describe,expect,it,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {ActionTokenError,signActionToken,verifyActionToken,verifyCronHeader} from '../../../supabase/functions/notify/action-token';

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
  await expect(verifyActionToken(token,secret+'different',now)).rejects.toMatchObject({status:401});
 });
 it('rejects tampered owner, action and notification id, even if base64 JSON is well-formed',async()=>{
  const token=await signActionToken(basic,secret,now);
  const [payload,mac]=token.split('.');
  const data=JSON.parse(Buffer.from(payload,'base64url').toString());
  for(const edit of [{u:other},{a:'undo'},{n:43}]){
   const forged=Buffer.from(JSON.stringify({...data,...edit})).toString('base64url')+'.'+mac;
   await expect(verifyActionToken(forged,secret,now)).rejects.toMatchObject({status:401});
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
  await expect(signActionToken({...approved,x:{ids:[card,card]}},secret,now)).rejects.toMatchObject({status:400});
  await expect(signActionToken({...approved,x:{ids:[card,card.toUpperCase()]}},secret,now)).rejects.toMatchObject({status:400});
  await expect(signActionToken({...approved,x:{ids:[]}},secret,now)).rejects.toMatchObject({status:400});
  // Sparse arrays skip Array.prototype.some(), but JSON serializes holes as
  // null. Never sign an approval token that verification will reject.
  for(const ids of [new Array<string>(1),[card,,card],Array.from({length:2},()=>card).map((id,i)=>i?id:undefined)]){
   await expect(signActionToken({...approved,x:{ids:ids as string[]}},secret,now))
    .rejects.toMatchObject({status:400});
  }
  await expect(signActionToken({...basic,a:'undo',x:{action:0}},secret,now)).rejects.toMatchObject({status:400});
  expect((await verifyActionToken(await signActionToken({...basic,a:'undo',x:{action:123}},secret,now),secret,now)).x?.action).toBe(123);
 });
 it('binds each extra field to its own action instead of accepting ignored signed instructions',async()=>{
  const hold={...basic,a:'later' as const,x:{scope:'due:project'}};
  expect((await verifyActionToken(await signActionToken(hold,secret,now),secret,now)).x?.scope).toBe('due:project');
  const today={...basic,a:'not_today' as const,x:{scope:'tutor'}};
  expect((await verifyActionToken(await signActionToken(today,secret,now),secret,now)).x?.scope).toBe('tutor');
  for(const invalid of [
   {...basic,x:{ids:[card]}},
   {...basic,a:'dismiss',x:{action:17}},
   {...basic,a:'later',x:{ids:[card]}},
   {...basic,a:'not_today',x:{action:17}},
   {...basic,a:'approve_cards',x:{ids:[card],action:17}},
   {...basic,a:'approve_cards',x:{ids:[card],scope:'due'}},
   {...basic,a:'undo',x:{action:17,ids:[card]}},
   {...basic,a:'undo',x:{action:17,scope:'due'}},
  ]){
   await expect(signActionToken(invalid as unknown as typeof basic,secret,now)).rejects.toMatchObject({status:400});
  }
 });
 it('rejects unknown actions, unknown fields, unsafe IDs, malformed payloads and oversized tokens',async()=>{
  for(const invalid of [
   {...basic,a:'delete'}, {...basic,n:0}, {...basic,n:Number.MAX_SAFE_INTEGER+1},
   {...basic,u:'bad'}, {...basic,exp:now+0.5}, {...basic,x:{scope:'x'.repeat(121)}},
   {...basic,x:{extra:true}},
   {...basic,a:'later',x:{scope:'  '}},
   {...basic,a:'later',x:{scope:'due:\nspoof'}},
   {...basic,a:'not_today',x:{scope:'tutor\u0000hidden'}},
  ]){
   await expect(signActionToken(invalid as unknown as typeof basic,secret,now)).rejects.toMatchObject({status:400});
  }
  await expect(verifyActionToken('x'.repeat(4097),secret,now)).rejects.toMatchObject({status:400});
  await expect(verifyActionToken('bad.token.with.dots',secret,now)).rejects.toMatchObject({status:400});
  await expect(signActionToken(basic,'short',now)).rejects.toBeInstanceOf(ActionTokenError);
 });
});

describe('NOTIF-4a cron secret header',()=>{
 it('accepts the exact secret and rejects missing, wrong, empty or oversized headers',async()=>{
  expect(await verifyCronHeader(secret,secret)).toBe(true);
  expect(await verifyCronHeader(null,secret)).toBe(false);
  expect(await verifyCronHeader('',secret)).toBe(false);
  expect(await verifyCronHeader(secret+'x',secret)).toBe(false);
  expect(await verifyCronHeader(secret.slice(0,-1),secret)).toBe(false);
  expect(await verifyCronHeader('x'.repeat(513),secret)).toBe(false);
  expect(await verifyCronHeader(secret,'')).toBe(false);
  expect(await verifyCronHeader('weak','weak')).toBe(false);
 });
});
