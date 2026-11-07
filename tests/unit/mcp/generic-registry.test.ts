import {describe,expect,it,vi} from 'vitest';
import {registeredResources} from '../../../supabase/functions/mcp/tools/registry';
import {study} from '../../../supabase/functions/mcp/tools/study';
import {get} from '../../../supabase/functions/mcp/tools/read';
import type {Context} from '../../../supabase/functions/mcp/db';
import {readFileSync} from 'node:fs';

const OWNER='11111111-1111-4111-8111-111111111111';
const base={operationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 schemaVersion:1 as const,resource:'future_journal',operation:'archive',
 target:{id:'22222222-2222-4222-8222-222222222222'},
 expectedVersion:2,patch:{}};
const metadata=[
 {resource:'day_plans',mcp_ok:true,schema:{operations:['create','close'],fields:['plan_date','ritual']}},
 {resource:'future_journal',mcp_ok:true,schema:JSON.stringify({
  operations:['record','archive'],fields:['title','note']})},
];
const context=()=>{
 const rpc=vi.fn().mockResolvedValue({data:{status:'ok',actionNo:12},error:null});
 const from=vi.fn().mockReturnValue({
  select:(_fields:string)=>({
   eq:(_field:string,_value:unknown)=>({
    order:(_field:string,_options:unknown)=>({
     limit:async(_limit:number)=>({data:metadata,error:null}),
    }),
   }),
  }),
 });
 return {c:{userId:OWNER,db:{rpc,from}} as unknown as Context,rpc,from};
};
describe('N37 registered MCP metadata and generic command',()=>{
 it('routes unknown registered resource to service-role mcp_command without changing envelope',async()=>{
  const {c,rpc}=context();
  const value=await study(c,{command:base,client:'chatgpt'});
  expect(value).toEqual({status:'ok',actionNo:12});
  expect(rpc).toHaveBeenCalledWith('mcp_command',{
   p_user:OWNER,p_source:'chatgpt',p:base,
  });
  expect(rpc).toHaveBeenCalledTimes(1);
 });
 it('retains legacy bridge selection for study and task resources',async()=>{
  const {c,rpc}=context();
  for(const resource of ['study_entries','calendar_blocks','study_intervals','tasks']){
   await study(c,{command:{...base,resource,operation:'create'}});
  }
  expect(rpc.mock.calls.map(c=>c[0])).toEqual([
   'mcp_study_command','mcp_study_command','mcp_study_command','mcp_task_command',
  ]);
 });
 it('rejects untrusted resource identifiers before any RPC',async()=>{
  const {c,rpc}=context();
  for(const resource of ['bad;drop','../settings','','A'.repeat(64)]){
   await expect(study(c,{command:{...base,resource}})).rejects.toThrow(/Invalid/);
  }
  expect(rpc).not.toHaveBeenCalled();
 });
 it('lists only registered service-capable schemas through the existing get tool',async()=>{
  const {c,from}=context();
  const result=JSON.parse(await get(c,{what:'resources'}));
  expect(result.resources).toEqual([
   {resource:'day_plans',operations:['create','close'],fields:['plan_date','ritual']},
   {resource:'future_journal',operations:['record','archive'],fields:['title','note']},
  ]);
  expect(from).toHaveBeenCalledWith('lemma_command_resources');
  expect(from).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(result)).not.toMatch(/command_fn|user_id|token|secret/i);
 });
 it('keeps 24 MCP tool names with an additive resources enum inside get',()=>{
  const source=readFileSync('supabase/functions/mcp/server.ts','utf8');
  expect(source).toContain("'calendar_blocks','tasks','resources'");
  expect(source.match(/registerTool\('study'/g)).toHaveLength(1);
  expect(source).not.toContain("registerTool('resources'");
 });
});
