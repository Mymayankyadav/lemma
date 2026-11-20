import {beforeEach,describe,expect,it,vi} from 'vitest';
import {publishAuth} from '../../../src/data/authBoundary';
import {readWeekdayMinutes,saveWeekdayMinutes} from '../../../src/data/study-weekdays';

const fixture=vi.hoisted(()=>{
 const single=vi.fn(),rpc=vi.fn(),getUser=vi.fn();
 const query={select:vi.fn(),eq:vi.fn(),single};
 query.select.mockReturnValue(query);query.eq.mockReturnValue(query);
 return {single,rpc,getUser,query,db:{from:vi.fn(()=>query),rpc,auth:{getUser}}};
});
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'live',getDemoProfile:()=> 'default'}));
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>fixture.db}));

describe('signed-in weekday availability',()=>{
 beforeEach(()=>{
  publishAuth({id:'owner-a'});
  fixture.getUser.mockResolvedValue({data:{user:{id:'owner-a'}},error:null});
  fixture.single.mockResolvedValue({data:{capacity:{weekday_minutes:[0,30,45,60,90,120,15]}},error:null});
  fixture.rpc.mockReset();
 });
 it('reads the selected owner capacity and preserves scalar legacy settings',async()=>{
  expect(await readWeekdayMinutes()).toEqual([0,30,45,60,90,120,15]);
  expect(fixture.query.eq).toHaveBeenCalledWith('user_id','owner-a');
  fixture.single.mockResolvedValue({data:{capacity:{weekday_minutes:90}},error:null});
  expect(await readWeekdayMinutes()).toBe(90);
  fixture.single.mockResolvedValue({data:{capacity:null},error:null});
  expect(await readWeekdayMinutes()).toBeNull();
 });
 it('rejects a missing settings row instead of treating it as writable unset capacity',async()=>{
  fixture.single.mockResolvedValue({data:null,error:null});
  await expect(readWeekdayMinutes()).rejects.toThrow('The requested record was not found');
 });
 it('discards a settings response after an account change',async()=>{
  fixture.single.mockImplementationOnce(async()=>{
   publishAuth({id:'owner-b'});
   return {data:{capacity:{weekday_minutes:90}},error:null};
  });
  await expect(readWeekdayMinutes()).rejects.toThrow('The signed-in account changed.');
 });
 it('does not query settings when account verification crosses an account boundary',async()=>{
  fixture.getUser.mockImplementationOnce(async()=>{
   publishAuth({id:'owner-b'});
   return {data:{user:{id:'owner-a'}},error:null};
  });
  await expect(readWeekdayMinutes()).rejects.toThrow('The signed-in account changed.');
  expect(fixture.single).not.toHaveBeenCalled();
 });
 it('verifies both the operation receipt and readback after saving',async()=>{
  const minutes=[0,30,45,60,90,120,15];
  const edit={operationId:'availability-op',ownerId:'owner-a',previous:90,minutes};
  fixture.rpc.mockResolvedValue({data:{operationId:edit.operationId,status:'applied'},error:null});
  expect(await saveWeekdayMinutes(edit)).toBe('applied');
  expect(fixture.rpc).toHaveBeenCalledWith('set_study_weekday_minutes',{
   p_operation_id:edit.operationId,p_expected_owner:'owner-a',p_previous:90,p_minutes:minutes,
  });
  fixture.single.mockResolvedValue({data:{capacity:{weekday_minutes:10}},error:null});
  expect(await saveWeekdayMinutes(edit)).toBe('conflict');
 });
 it('rejects a mismatched receipt without accepting a successful write',async()=>{
  fixture.rpc.mockResolvedValue({data:{operationId:'different-op',status:'applied'},error:null});
  await expect(saveWeekdayMinutes({operationId:'availability-op',ownerId:'owner-a',previous:null,minutes:Array(7).fill(30)}))
   .rejects.toThrow('The saved availability could not be verified.');
  expect(fixture.single).not.toHaveBeenCalled();
 });
});
