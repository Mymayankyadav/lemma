import {describe,expect,it,vi} from 'vitest';
import {createOwnerChangesPruner,runNotifyTick,type TickAdapters} from
 '../../../supabase/functions/notify/tick-core';
const noOwners=():TickAdapters=>({
 listEnabledOwners:vi.fn(async()=>[]),
 load:vi.fn(async()=>{throw Error('Unexpected owner read')}),
 queue:vi.fn(async()=>0),
 deliver:vi.fn(async()=>({attempted:0,sent:0,failed:0})),
});
describe('N54 bounded service-only owner change retention tick',()=>{
 it('calls the single service-role RPC even when reminders are disabled',async()=>{
  const service={rpc:vi.fn(async()=>({data:500,error:null}))};
  const deps=noOwners();
  deps.runDueCommands=vi.fn(async()=>({executed:0,failed:0,processed:0}));
  deps.pruneOwnerChanges=vi.fn(createOwnerChangesPruner(service));
  const result=await runNotifyTick(deps);
  expect(result).toMatchObject({owners:0,queued:0,sent:0,failed:0,timedOut:false});
  expect(deps.runDueCommands).toHaveBeenCalledTimes(1);
  expect(deps.pruneOwnerChanges).toHaveBeenCalledTimes(1);
  expect(service.rpc).toHaveBeenCalledExactlyOnceWith('lemma_prune_owner_changes');
  expect(deps.listEnabledOwners).toHaveBeenCalledTimes(1);
  expect(deps.load).not.toHaveBeenCalled();
 });
 it('never sends an owner identity, allows zero pruned rows and isolates RPC failures',async()=>{
  const service={rpc:vi.fn(async()=>({data:0,error:null as null|{message:string}}))};
  const deps=noOwners();deps.pruneOwnerChanges=createOwnerChangesPruner(service);
  expect((await runNotifyTick(deps)).failed).toBe(0);
  service.rpc.mockResolvedValueOnce({data:0,error:{message:'private connection failed'}});
  expect((await runNotifyTick(deps)).failed).toBe(1);
  expect(deps.listEnabledOwners).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(service.rpc.mock.calls)).not.toMatch(/user_id|ownerId|p_user/);
 });
 it('rejects unbounded or invalid database results without blocking the notify loop',async()=>{
  for(const data of [4_001,-1,1.5,null]){
   const service={rpc:vi.fn(async()=>({data,error:null}))};
   const deps=noOwners();deps.pruneOwnerChanges=createOwnerChangesPruner(service);
   expect(await runNotifyTick(deps)).toMatchObject({failed:1,owners:0});
   expect(deps.listEnabledOwners).toHaveBeenCalledTimes(1);
  }
 });
 it('does not begin retention on an already cancelled scheduled tick',async()=>{
  const signal=new AbortController();signal.abort();
  const service={rpc:vi.fn(async()=>({data:0,error:null}))};
  const deps=noOwners();deps.pruneOwnerChanges=createOwnerChangesPruner(service);
  expect(await runNotifyTick(deps,{signal:signal.signal})).toMatchObject({
   owners:0,failed:0,timedOut:false,
  });
  expect(service.rpc).not.toHaveBeenCalled();
  expect(deps.listEnabledOwners).not.toHaveBeenCalled();
 });
});
