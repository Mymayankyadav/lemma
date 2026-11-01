import {beforeAll,describe,expect,it,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {signActionToken,verifyActionToken} from '../../../supabase/functions/notify/action-token';
import {handleActionRequest} from '../../../supabase/functions/notify/action-handler';

beforeAll(()=>vi.stubGlobal('crypto',webcrypto));
const secret='local-test-only-action-secret-longer-than-32-characters';
const now=1793527200;
const user='123e4567-e89b-42d3-a456-426614174000';
const card='123e4567-e89b-42d3-a456-426614174002';
const signed=async(a:'open'|'undo'|'approve_cards'='open',x?:{ids?:string[];action?:number})=>
 signActionToken({u:user,n:42,a,exp:now+3600,...(x?{x}:{})},secret,now);

// Regression-first: the handler must not expose an unverified service-role RPC.
describe('NOTIF-4b1 atomic /act handler',()=>{
 it('verifies before exactly one owner-bound notify_act call',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:{status:'done',kind:'due'},error:null});
  const response=await handleActionRequest({token:await signed()}, {secret,rpc,nowSeconds:now});
  expect(response).toEqual({status:200,body:{status:'done',kind:'due'}});
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith({p_user:user,p_notification:42,p_action:'open',p_extra:{}});
 });
 it('rejects malformed, tampered and expired tokens without calling the database',async()=>{
  const rpc=vi.fn();
  for(const input of [null,{}, {token:12}, {token:'bad.token'}, {token:(await signed()).replace(/.$/,'?')}]){
   const response=await handleActionRequest(input,{secret,rpc,nowSeconds:now});
   expect(response.status).toBe(400);
  }
  const token=await signed();
  const [encoded,signature]=token.split('.');
  const forged=Buffer.from(JSON.stringify({
   ...JSON.parse(Buffer.from(encoded,'base64url').toString()),n:43,
  })).toString('base64url')+'.'+signature;
  expect((await handleActionRequest({token:forged},{secret,rpc,nowSeconds:now})).status).toBe(401);
  expect((await handleActionRequest({token},{secret:secret+'other',rpc,nowSeconds:now})).status).toBe(401);
  const expired=await handleActionRequest({token},{secret,rpc,nowSeconds:now+3600});
  expect(expired.status).toBe(410);
  expect(rpc).not.toHaveBeenCalled();
 });
 it('returns 409 for already claimed actions, with no retry or second RPC',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:{status:'already_done'},error:null});
  const result=await handleActionRequest({token:await signed()},{secret,rpc,nowSeconds:now});
  expect(result).toEqual({status:409,body:{message:'Already done'}});
  expect(rpc).toHaveBeenCalledTimes(1);
 });
 it('does not leak privileged RPC failures or claim success',async()=>{
  for(const rpc of [
   vi.fn().mockResolvedValue({data:null,error:{message:'sensitive database detail'}}),
   vi.fn().mockRejectedValue(new Error('sensitive service role detail')),
  ]){
   const result=await handleActionRequest({token:await signed()},{secret,rpc,nowSeconds:now});
   expect(result).toEqual({status:409,body:{message:'Open Lemma to finish'}});
   expect(JSON.stringify(result)).not.toMatch(/sensitive|service role/i);
   expect(rpc).toHaveBeenCalledTimes(1);
  }
 });
 it('mints an owner-bound 48h Undo link only after an approved confirmation',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:{status:'done',kind:'tutor',approved:['P1'],skipped:[],action:123,confirmId:84},error:null});
  const response=await handleActionRequest({token:await signed('approve_cards',{ids:[card]})},{secret,rpc,nowSeconds:now});
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith({p_user:user,p_notification:42,p_action:'approve_cards',p_extra:{ids:[card]}});
  const token=(response.body as Record<string,unknown>).undoToken;
  expect(typeof token).toBe('string');
  const payload=await verifyActionToken(token as string,secret,now);
  expect(payload).toEqual({u:user,n:84,a:'undo',exp:now+48*3600,x:{action:123}});
 });
 it('does not offer Undo for a no-op approval and maps undo errors to app recovery',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:{status:'done',kind:'tutor',approved:[],skipped:[card],action:null},error:null});
  const result=await handleActionRequest({token:await signed('approve_cards',{ids:[card]})},{secret,rpc,nowSeconds:now});
  expect(result.status).toBe(200);
  expect(result.body).not.toHaveProperty('undoToken');
  rpc.mockRejectedValueOnce(new Error('conflict'));
  const undo=await handleActionRequest({token:await signed('undo',{action:123})},{secret,rpc,nowSeconds:now});
  expect(undo).toEqual({status:409,body:{message:'Open Lemma to undo'}});
 });
 it('fails closed when notification secrets are absent and never touches the database',async()=>{
  const rpc=vi.fn();
  const result=await handleActionRequest({token:await signed()},{secret:'',rpc,nowSeconds:now});
  expect(result).toEqual({status:503,body:{message:'Reminders are not set up yet'}});
  expect(rpc).not.toHaveBeenCalled();
 });
 it('accepts safe PostgREST bigint strings but refuses unsafe confirmation ids',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:{status:'done',kind:'tutor',action:'123',confirmId:'84'},error:null});
  const valid=await handleActionRequest({token:await signed('approve_cards',{ids:[card]})},{secret,rpc,nowSeconds:now});
  expect(valid.status).toBe(200);
  const payload=await verifyActionToken(valid.body.undoToken as string,secret,now);
  expect(payload.x?.action).toBe(123);
  rpc.mockResolvedValueOnce({data:{status:'done',kind:'tutor',action:'9007199254740993',confirmId:'84'},error:null});
  const invalid=await handleActionRequest({token:await signed('approve_cards',{ids:[card]})},{secret,rpc,nowSeconds:now});
  expect(invalid).toEqual({status:409,body:{message:'Open Lemma to finish'}});
 });
 it('fails closed on malformed confirmation metadata rather than issuing an invalid Undo token',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:{status:'done',kind:'tutor',action:'not-a-number',confirmId:84},error:null});
  const result=await handleActionRequest({token:await signed('approve_cards',{ids:[card]})},{secret,rpc,nowSeconds:now});
  expect(result).toEqual({status:409,body:{message:'Open Lemma to finish'}});
  expect(rpc).toHaveBeenCalledTimes(1);
 });
});
