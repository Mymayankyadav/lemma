import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {study} from '../../../supabase/functions/mcp/tools/study';
import {INSTRUCTIONS} from '../../../supabase/functions/mcp/rules';
import type {Context} from '../../../supabase/functions/mcp/db';

const OWNER='11111111-1111-4111-8111-111111111111';
const ID='22222222-2222-4222-8222-222222222222';
const operationId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const command=(resource:string,operation:string,patch:Record<string,unknown>={})=>({
 schemaVersion:1 as const,resource,operation,operationId,
 target:{id:ID},expectedVersion:3,patch,
});
describe('N90 explicit owner-controlled MCP history',()=>{
 it('routes proposals, correction records and drafts only through mcp_command',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:{status:'ok',actionNo:21},error:null});
  const c={userId:OWNER,db:{rpc}} as unknown as Context;
  for(const [resource,operation,patch] of [
   ['proposals','withdraw',{}],
   ['proposals','reopen',{}],
   ['proposals','revise',{payload:{front:'Improved version'}}],
   ['proposal_drafts','submit',{}],
   ['session_event_corrections','correct',{reason:'Incorrect history'}],
   ['review_corrections','void',{reason:'Grade voided'}],
  ] as const){
   const envelope=command(resource,operation,patch);
   await expect(study(c,{command:envelope,client:'chatgpt'}))
    .resolves.toMatchObject({status:'ok'});
   expect(rpc).toHaveBeenLastCalledWith('mcp_command',
    {p_user:OWNER,p_source:'chatgpt',p:envelope});
  }
  expect(rpc).toHaveBeenCalledTimes(6);
 });
 it('requires D3 explicit instruction, no implicit approval and irreversible preview',()=>{
  expect(INSTRUCTIONS).toMatch(/explicit.*historical/i);
  expect(INSTRUCTIONS).toMatch(/proposal/i);
  expect(INSTRUCTIONS).toMatch(/preview/i);
  const route=readFileSync('supabase/functions/mcp/tools/study.ts','utf8');
  expect(route).toContain("'mcp_command'");
  expect(route).not.toContain("rpc('revise_proposal'");
 });
});
