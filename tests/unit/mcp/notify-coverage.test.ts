import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {readNotificationRecords} from '../../../supabase/functions/mcp/tools/notification-read';
import {study} from '../../../supabase/functions/mcp/tools/study';
import type {Context} from '../../../supabase/functions/mcp/db';

const OWNER='11111111-1111-4111-8111-111111111111';
const DEVICE='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECRET='secret-device-transport-credential';
function fixture(rows:Record<string,unknown>[]=[],count=rows.length){
 const calls:{select:string;filters:[string,unknown][];ordering:string;range:[number,number];table:string;
  search?:[string,string]}={select:'',filters:[],ordering:'',range:[0,0],table:''};
 const query={
  select(fields:string){calls.select=fields;return query},
  eq(field:string,value:unknown){calls.filters.push([field,value]);return query},
  ilike(field:string,value:string){calls.search=[field,value];return query},
  order(field:string){calls.ordering=field;return query},
  range:async(from:number,to:number)=>{
   calls.range=[from,to];return {data:rows.slice(from,to+1),count,error:null};
  },
 };
 const rpc=vi.fn().mockResolvedValue({data:{status:'ok',changed:[],actionNo:null},error:null});
 const from=vi.fn((table:string)=>{calls.table=table;return query});
 const c={userId:OWNER,db:{from,rpc}} as unknown as Context;
 return {c,calls,from,rpc};
}
describe('N89 notification MCP owner read boundary',()=>{
 it('never queries or emits push endpoint, encryption key or auth, even for a bad adapter row',async()=>{
  const {c,calls}=fixture([{
   id:DEVICE,user_id:OWNER,label:'My phone',platform:'android_web',version:3,
   endpoint:SECRET,p256dh:SECRET,auth:SECRET,other_private:SECRET,
  }]);
  const payload=await readNotificationRecords(c,{what:'push_devices',id:DEVICE},'get');
  const response=JSON.parse(payload);
  expect(response.items).toEqual([{id:DEVICE,label:'My phone',platform:'android_web',version:3}]);
  expect(JSON.stringify(response)).not.toContain(SECRET);
  expect(calls.select.split(',')).not.toEqual(expect.arrayContaining(['endpoint','p256dh','auth']));
  expect(calls.filters).toContainEqual(['user_id',OWNER]);
  expect(calls.filters).toContainEqual(['id',DEVICE]);
  expect(calls.table).toBe('push_devices');
  expect(calls.range).toEqual([0,19]);
 });
 it('exposes bounded read-only notification history, not transport payloads',async()=>{
  const {c,calls}=fixture([{
   id:17,kind:'due',title:'Practice',status:'sent',reason:null,
   due_at:'2026-11-08T00:00:00Z',sent_at:'2026-11-08T00:00:01Z',
   facts:{private:SECRET},actions:[{url:SECRET}],url:SECRET,
  }]);
  const result=JSON.parse(await readNotificationRecords(c,{
   what:'notifications',status:'sent',limit:5,
  },'get'));
  expect(result.items[0]).toEqual({
   id:17,kind:'due',title:'Practice',status:'sent',reason:null,
   due_at:'2026-11-08T00:00:00Z',sent_at:'2026-11-08T00:00:01Z',
  });
  expect(calls.ordering).toBe('id');
  expect(calls.range).toEqual([0,4]);
  expect(calls.filters).toContainEqual(['user_id',OWNER]);
  expect(calls.filters).toContainEqual(['status','sent']);
  expect(calls.select).not.toMatch(/facts|actions|url|endpoint|p256dh|auth/);
 });
 it('supports scoped hold lookup/search and refuses forged-owner and invalid filters',async()=>{
  const {c,calls}=fixture([{scope:'tutor',until:'2028-01-01T00:00:00Z',version:2,
   user_id:OWNER,endpoint:SECRET}]);
  const page=JSON.parse(await readNotificationRecords(c,{
   resource:'notify_holds',id:'tutor',query:'tu',limit:5,
  },'search'));
  expect(page.items[0]).toEqual({
   scope:'tutor',until:'2028-01-01T00:00:00Z',version:2,
  });
  expect(calls.filters).toContainEqual(['user_id',OWNER]);
  expect(calls.filters).toContainEqual(['scope','tutor']);
  expect(calls.search).toEqual(['scope','%tu%']);
  expect(calls.ordering).toBe('scope');
  await expect(readNotificationRecords(c,{what:'notify_holds',ownerId:'forged'} as never,'get'))
   .rejects.toThrow(/authenticated owner/);
  await expect(readNotificationRecords(c,{what:'push_devices',limit:100},'get'))
   .rejects.toThrow(/limit/);
  await expect(readNotificationRecords(c,{what:'push_devices',status:'sent'},'get'))
   .rejects.toThrow(/status/);
  await expect(readNotificationRecords(c,{what:'notify_holds',cursor:'no1:invalid'},'get'))
   .rejects.toThrow(/cursor/);
 });
 it('routes device and hold commands to the existing owner-bound service dispatcher',async()=>{
  const {c,rpc}=fixture();
  for(const [resource,operation] of [['push_devices','rename'],['notify_holds','create']]){
   const command={resource,operation,schemaVersion:1 as const,
    operationId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    patch:resource==='push_devices'?{label:'Phone'}:{scope:'tutor',until:'2028-01-01T00:00:00Z'}};
   await study(c,{command,client:'chatgpt'});
   expect(rpc).toHaveBeenLastCalledWith('mcp_command',{
    p_user:OWNER,p_source:'chatgpt',p:command,
   });
  }
  expect(rpc).toHaveBeenCalledTimes(2);
 });
 it('registers no extra MCP tool and journals holds but never device credentials',()=>{
  const migration=readFileSync('supabase/migrations/20261208110000_n89_notify_command.sql','utf8');
  expect(migration).toMatch(/on public\.notify_holds for each row execute function public\.log_change/);
  expect(migration).not.toMatch(/lemma_log_change[^;]*on public\.push_devices/);
  expect(migration).toContain("('push_devices','notify_command',true");
  const server=readFileSync('supabase/functions/mcp/server.ts','utf8');
  expect(server.match(/registerTool\('study'/g)).toHaveLength(1);
  expect(server).not.toMatch(/registerTool\('notifications'/);
 });
});
