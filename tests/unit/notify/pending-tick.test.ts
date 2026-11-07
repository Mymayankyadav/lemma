import {describe,expect,it,vi} from 'vitest';
import {runNotifyTick,type TickAdapters} from '../../../supabase/functions/notify/tick-core';

const OWNER='11111111-1111-1111-1111-111111111111';
const facts=()=>({
 candidates:[],
 context:{
  now:Date.now(),timeZone:'UTC',quietStart:'00:00',quietEnd:'00:00',
  mode:'off' as const,dailyCap:3,sendsToday:0,
 },
});
const deps=(owners:string[]=[]):TickAdapters=>({
 listEnabledOwners:vi.fn(async()=>owners),
 load:vi.fn(async()=>facts()),
 queue:vi.fn(async()=>0),
 deliver:vi.fn(async()=>({attempted:0,sent:0,failed:0})),
 runDueCommands:vi.fn(async()=>({executed:1,failed:0,processed:1})),
});
describe('N53 scheduled decisions on notify tick',()=>{
 it('runs the executor even with no notification-enabled owners',async()=>{
  const d=deps();
  const r=await runNotifyTick(d);
  expect(d.runDueCommands).toHaveBeenCalledTimes(1);
  expect(d.runDueCommands).toHaveBeenCalledWith(expect.any(AbortSignal));
  expect(r).toMatchObject({owners:0,failed:0,timedOut:false});
  expect(d.load).not.toHaveBeenCalled();
 });
 it('calls once before owner-specific notifications',async()=>{
  const d=deps([OWNER,OWNER]);
  const order:string[]=[];
  vi.mocked(d.runDueCommands!).mockImplementation(async()=>{
   order.push('due');
   return {executed:1,failed:0,processed:1};
  });
  vi.mocked(d.load).mockImplementation(async()=>{
   order.push('owner');
   return facts();
  });
  const r=await runNotifyTick(d);
  expect(order).toEqual(['due','owner']);
  expect(d.runDueCommands).toHaveBeenCalledTimes(1);
  expect(r.owners).toBe(1);
 });
 it('continues reminder delivery after worker failure without leaking details',async()=>{
  const d=deps([OWNER]);
  vi.mocked(d.runDueCommands!).mockRejectedValue(Error('private SQL detail'));
  const r=await runNotifyTick(d);
  expect(r.failed).toBe(1);
  expect(d.load).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(r)).not.toContain('private SQL');
 });
 it('counts sanitized worker failures and rejects impossible counts',async()=>{
  const d=deps();
  vi.mocked(d.runDueCommands!).mockResolvedValue({executed:0,failed:1,processed:1});
  expect((await runNotifyTick(d)).failed).toBe(1);
  vi.mocked(d.runDueCommands!).mockResolvedValue({executed:2,failed:0,processed:2});
  expect((await runNotifyTick(d)).failed).toBe(1);
 });
 it('does not run the worker or read owners after a prior abort',async()=>{
  const d=deps([OWNER]),abort=new AbortController();
  abort.abort();
  await runNotifyTick(d,{signal:abort.signal});
  expect(d.runDueCommands).not.toHaveBeenCalled();
  expect(d.listEnabledOwners).not.toHaveBeenCalled();
 });
});
