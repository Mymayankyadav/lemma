import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createPushRegistrar,resetPushRegistration,syncPushToken} from '../../../src/platform/push';

// N163: the phone's FCM token reaches the server once per token, and never when Firebase is off.
const registrar=()=>({register:vi.fn().mockResolvedValue(undefined),unregister:vi.fn().mockResolvedValue(undefined)});
const plugin=(configured:boolean,token:string|null)=>({pushToken:vi.fn().mockResolvedValue({configured,token})});
beforeEach(()=>resetPushRegistration());

describe('N163 push token sync',()=>{
 it('sends nothing when the app has no Firebase values',async()=>{
  const r=registrar();
  expect(await syncPushToken(plugin(false,null),r,'phone-key-0001','2.0.1')).toBe('off');
  expect(await syncPushToken(plugin(false,'tok'),r,'phone-key-0001','2.0.1')).toBe('off');
  expect(r.register).not.toHaveBeenCalled();
 });
 it('waits when Firebase has not issued a token yet',async()=>{
  const r=registrar();
  expect(await syncPushToken(plugin(true,null),r,'phone-key-0001','2.0.1')).toBe('waiting');
  expect(r.register).not.toHaveBeenCalled();
 });
 it('registers a token once, again when it or the app version changes, and again after sign-out',async()=>{
  const r=registrar();
  expect(await syncPushToken(plugin(true,'tok-a'),r,'phone-key-0001','2.0.1')).toBe('registered');
  expect(await syncPushToken(plugin(true,'tok-a'),r,'phone-key-0001','2.0.1')).toBe('unchanged');
  expect(await syncPushToken(plugin(true,'tok-b'),r,'phone-key-0001','2.0.1')).toBe('registered');
  expect(await syncPushToken(plugin(true,'tok-b'),r,'phone-key-0001','2.0.2')).toBe('registered');
  resetPushRegistration();
  expect(await syncPushToken(plugin(true,'tok-b'),r,'phone-key-0001','2.0.2')).toBe('registered');
  expect(r.register.mock.calls).toEqual([['phone-key-0001','tok-a','2.0.1'],['phone-key-0001','tok-b','2.0.1'],['phone-key-0001','tok-b','2.0.2'],['phone-key-0001','tok-b','2.0.2']]);
 });
 it('tries again after a failed registration',async()=>{
  const r=registrar();r.register.mockRejectedValueOnce(new Error('offline'));
  await expect(syncPushToken(plugin(true,'tok-a'),r,'phone-key-0001','2.0.1')).rejects.toThrow('offline');
  expect(await syncPushToken(plugin(true,'tok-a'),r,'phone-key-0001','2.0.1')).toBe('registered');
 });
 it('calls the two server functions with the owner session and reports their errors',async()=>{
  const rpc=vi.fn().mockResolvedValue({error:null});
  const live=createPushRegistrar(async()=>({rpc}));
  await live.register('phone-key-0001','tok-a','2.0.1');
  await live.unregister('phone-key-0001');
  expect(rpc.mock.calls).toEqual([['register_push_token',{p_key:'phone-key-0001',p_token:'tok-a',p_app_version:'2.0.1'}],['unregister_push_token',{p_key:'phone-key-0001'}]]);
  rpc.mockResolvedValueOnce({error:{message:'Authenticated owner required'}});
  await expect(live.register('phone-key-0001','tok-a','2.0.1')).rejects.toThrow('Authenticated owner required');
 });
});
