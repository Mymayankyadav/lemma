import {describe,expect,it,vi} from 'vitest';
import {authorizeCronTick} from '../../../supabase/functions/notify/cron-auth';

const SECRET='a'.repeat(64);
const call=(provided:string|null,configured:string|undefined=SECRET)=>
 authorizeCronTick(provided,configured);

describe('NOTIF-4b6a cron authorization',()=>{
 it('accepts the exact configured 32-byte hex secret',()=>{
  expect(call(SECRET)).toEqual({ok:true,status:200});
 });
 it('rejects absent and blank configuration without exposing secrets',()=>{
  for(const configured of [undefined,'','short','g'.repeat(64)]){
   const result=authorizeCronTick(SECRET,configured);
   expect(result).toEqual({ok:false,status:503,message:'Reminders are not set up yet'});
   expect(JSON.stringify(result)).not.toContain(SECRET);
  }
 });
 it('rejects missing, wrong, padded and truncated credentials',()=>{
  for(const provided of [null,'', 'b'.repeat(64),'a'.repeat(63),'a'.repeat(65), ' '+SECRET,SECRET+' ',SECRET.slice(0,32)+'b'+SECRET.slice(33)]){
   const result=call(provided);
   expect(result).toEqual({ok:false,status:401,message:'Unauthorized'});
   expect(JSON.stringify(result)).not.toContain(SECRET);
  }
 });
 it('rejects unicode and unbounded header input without revealing configuration',()=>{
  for(const provided of ['🗝️'.repeat(32),'A'.repeat(2048),SECRET+'\n']){
   expect(call(provided)).toEqual({ok:false,status:401,message:'Unauthorized'});
  }
 });
 it('compares the same 64 positions for correct, early-wrong and short credentials',()=>{
  const spy=vi.spyOn(String.prototype,'charCodeAt');
  try{
   for(const supplied of [SECRET,'b'+SECRET.slice(1),SECRET.slice(0,1),'']){
    spy.mockClear();
    authorizeCronTick(supplied,SECRET);
    const reads=spy.mock.calls.length;
    expect(reads).toBe(128);
   }
  }finally{
   spy.mockRestore();
  }
 });
 it('requires a full credential rather than a matching prefix',()=>{
  const secret='0123456789abcdef'.repeat(4);
  expect(call(secret,secret)).toEqual({ok:true,status:200});
  expect(call(secret.slice(0,48),secret)).toEqual({ok:false,status:401,message:'Unauthorized'});
 });
});
