import {describe,expect,it,vi} from 'vitest';
import {runNotifyTick,type TickAdapters} from '../../../supabase/functions/notify/tick-core';

const adapters=():TickAdapters=>({
 listEnabledOwners:vi.fn(async()=>[]),
 load:vi.fn(async()=>{throw Error('no owner should be loaded');}),
 queue:vi.fn(async()=>0),
 deliver:vi.fn(async()=>({attempted:0,sent:0,failed:0})),
});

describe('N53 pending commands run from the scheduled notify tick',()=>{
 it('invokes the server-only due executor even with all notifications disabled',async()=>{
  const deps=adapters();
  deps.runDueCommands=vi.fn(async()=>({processed:1,succeeded:1,failed:0}));
  const result=await runNotifyTick(deps);
  expect(deps.runDueCommands).toHaveBeenCalledOnce();
  expect(deps.runDueCommands).toHaveBeenCalledWith(expect.any(AbortSignal));
  expect(deps.listEnabledOwners).toHaveBeenCalledOnce();
  expect(deps.load).not.toHaveBeenCalled();
  expect(result).toMatchObject({owners:0,queued:0,sent:0,failed:0});
 });
 it('counts an executor failure without stopping normal notification owners',async()=>{
  const deps=adapters();
  deps.runDueCommands=vi.fn(async()=>({processed:1,succeeded:0,failed:1}));
  expect(await runNotifyTick(deps)).toMatchObject({failed:1,owners:0});
  expect(deps.listEnabledOwners).toHaveBeenCalledOnce();
 });
 it('rejects an impossible execution receipt and continues safely',async()=>{
  const deps=adapters();
  deps.runDueCommands=vi.fn(async()=>({processed:1,succeeded:1,failed:1}));
  expect(await runNotifyTick(deps)).toMatchObject({failed:1});
  expect(deps.listEnabledOwners).toHaveBeenCalledOnce();
 });
 it('does not continue after the executor aborts the tick',async()=>{
  const controller=new AbortController();
  const deps=adapters();
  deps.runDueCommands=vi.fn(async(signal)=>{
   expect(signal.aborted).toBe(false);
   controller.abort();
   return {processed:1,succeeded:1,failed:0};
  });
  expect(await runNotifyTick(deps,{signal:controller.signal})).toMatchObject({
   owners:0,queued:0,sent:0,failed:0,
  });
  expect(deps.listEnabledOwners).not.toHaveBeenCalled();
 });
 it('keeps existing notification-only adapters compatible',async()=>{
  const deps=adapters();
  expect(await runNotifyTick(deps)).toMatchObject({owners:0,failed:0});
  expect(deps.listEnabledOwners).toHaveBeenCalledOnce();
 });
});
