import {beforeEach,describe,expect,it,vi} from 'vitest';
import {handleTestPushRequest,type TestPushDeps} from '../../../supabase/functions/notify/test-handler';

const owner='123e4567-e89b-42d3-a456-426614174000';
const device='123e4567-e89b-42d3-a456-426614174001';
const other='123e4567-e89b-42d3-a456-426614174002';
const record={
 id:device,userId:owner,disabledAt:null,
 subscription:{endpoint:'https://push.example.test/sub',keys:{p256dh:'pub',auth:'auth'}},
 prefs:{maxPerDay:3,quiet:{start:'22:30',end:'07:30'}},
};
const verifyJwt=vi.fn();
const loadDevice=vi.fn();
const send=vi.fn();
const deps:TestPushDeps={configured:true,verifyJwt,loadDevice,send};
beforeEach(()=>{
 verifyJwt.mockReset().mockResolvedValue({id:owner});
 loadDevice.mockReset().mockResolvedValue(record);
 send.mockReset().mockResolvedValue({status:'sent',httpStatus:201});
});
describe('NOTIF-4b3 owner-authenticated test push',()=>{
 it('requires a verified Bearer JWT before any owner-scoped device read',async()=>{
  for(const auth of [null,'','Basic token','Bearer','Bearer a b']){
   const response=await handleTestPushRequest(auth,{deviceId:device},deps);
   expect(response.status).toBe(401);
  }
  verifyJwt.mockResolvedValueOnce(null);
  expect((await handleTestPushRequest('Bearer token',{deviceId:device},deps)).status).toBe(401);
  verifyJwt.mockRejectedValueOnce(Error('private auth detail'));
  expect((await handleTestPushRequest('Bearer token',{deviceId:device},deps)).status).toBe(401);
  expect(loadDevice).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
 });
 it('rejects invalid device identifiers before querying or sending',async()=>{
  for(const input of [null,{}, {deviceId:'bad'}, {deviceId:other,extra:true}, {deviceId:123}]){
   const result=await handleTestPushRequest('Bearer token',input,deps);
   expect(result.status).toBe(400);
  }
  expect(loadDevice).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
 });
 it('reads only the verified owner device and sends once despite quiet hours and daily caps',async()=>{
  const response=await handleTestPushRequest('Bearer signed.jwt.token',{deviceId:device},deps);
  expect(response).toEqual({status:200,body:{message:'Test reminder sent'}});
  expect(verifyJwt).toHaveBeenCalledWith('signed.jwt.token');
  expect(loadDevice).toHaveBeenCalledTimes(1);
  expect(loadDevice).toHaveBeenCalledWith(owner,device);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith(record,{
   kind:'test',tag:'test',title:'Reminders are on',
   body:'Lemma will write at most 3 times a day, never between 22:30 and 07:30.',
  });
 });
 it('never sends to a missing, disabled or mismatched device',async()=>{
  for(const value of [null,{...record,disabledAt:'2026-11-01T00:00:00Z'},{...record,id:other},{...record,userId:other}]){
   loadDevice.mockResolvedValueOnce(value);
   expect((await handleTestPushRequest('Bearer token',{deviceId:device},deps)).status).toBe(404);
  }
  expect(send).not.toHaveBeenCalled();
 });
 it('fails closed if delivery secrets are missing, without calling auth or database',async()=>{
  expect(await handleTestPushRequest('Bearer token',{deviceId:device},{...deps,configured:false}))
   .toEqual({status:503,body:{message:'Reminders are not set up yet'}});
  expect(verifyJwt).not.toHaveBeenCalled();
  expect(loadDevice).not.toHaveBeenCalled();
 });
 it('maps gone devices and temporary push failures without exposing endpoint or secrets',async()=>{
  for(const [outcome,status] of [['gone',410],['retry',503],['failed',503]] as const){
   send.mockResolvedValueOnce({status:outcome});
   const result=await handleTestPushRequest('Bearer token',{deviceId:device},deps);
   expect(result.status).toBe(status);
   expect(JSON.stringify(result)).not.toMatch(/push.example|signed.jwt|secret|pub|auth/i);
  }
  send.mockRejectedValueOnce(Error('private subscription key'));
  expect((await handleTestPushRequest('Bearer token',{deviceId:device},deps)).status).toBe(503);
 });
 it('uses safe defaults when optional notification preferences are malformed',async()=>{
  loadDevice.mockResolvedValueOnce({...record,prefs:{maxPerDay:999,quiet:{start:'oops',end:'07:30'}}});
  await handleTestPushRequest('Bearer token',{deviceId:device},deps);
  expect(send.mock.calls[0][1].body)
   .toBe('Lemma will write at most 3 times a day, never between 22:30 and 07:30.');
 });
 it('uses the current owner quiet hours and daily limit in the test copy',async()=>{
  loadDevice.mockResolvedValueOnce({...record,prefs:{maxPerDay:5,quiet:{start:'21:00',end:'06:15'}}});
  const result=await handleTestPushRequest('Bearer token',{deviceId:device},deps);
  expect(result.status).toBe(200);
  expect(send.mock.calls[0][1].body)
   .toBe('Lemma will write at most 5 times a day, never between 21:00 and 06:15.');
 });
 it('does not claim quiet hours exist when start equals end, and uses singular copy for a one-send cap',async()=>{
  loadDevice.mockResolvedValueOnce({...record,prefs:{maxPerDay:1,quiet:{start:'00:00',end:'00:00'}}});
  const result=await handleTestPushRequest('Bearer token',{deviceId:device},deps);
  expect(result.status).toBe(200);
  expect(send.mock.calls[0][1].body)
   .toBe('Lemma will write at most once a day. Quiet hours are off.');
  expect(send.mock.calls[0][1].body).not.toContain('never between');
 });

});
