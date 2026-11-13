import {describe,expect,it,vi} from 'vitest';
import {contextArgs,readContext} from '../../../supabase/functions/mcp/tools/context-read';
import {undo} from '../../../supabase/functions/mcp/tools/control';
import type {Context} from '../../../supabase/functions/mcp/db';

// Deno `npm:` specifiers do not resolve under vitest; control.ts only needs the types.
vi.mock('../../../supabase/functions/mcp/deps.ts',()=>({McpServer:class{},z:{},createClient:()=>null,createMcpHandler:()=>null}));

const OWNER='11111111-1111-1111-1111-111111111111';
describe('N160 context reads (Today, progress, export)',()=>{
 it('builds bounded arguments and never takes an owner',()=>{
  expect(contextArgs({what:'today'})).toEqual({what:'today',args:{}});
  expect(contextArgs({what:'connection'})).toEqual({what:'connection',args:{}});
  expect(contextArgs({what:'progress'})).toEqual({what:'progress',args:{days:30}});
  const now=Date.parse('2026-11-13T12:00:00Z');
  expect(contextArgs({what:'progress',start:'2026-11-07'},now).args).toEqual({days:7});
  expect(()=>contextArgs({what:'progress',start:'2024-01-01'},now)).toThrow(/1 to 365/);
  expect(()=>contextArgs({what:'progress',start:'next week'},now)).toThrow(/YYYY-MM-DD/);
  expect(contextArgs({what:'export'}).args).toEqual({table:null,cursor:null,limit:50});
  expect(contextArgs({what:'export',id:'tasks',limit:10}).args).toMatchObject({table:'tasks',limit:10});
  expect(()=>contextArgs({what:'export',id:'auth.users'})).toThrow(/table name/);
  expect(()=>contextArgs({what:'export',limit:500})).toThrow(/1\.\.50/);
  expect(()=>contextArgs({what:'today',user_id:'x'} as any)).toThrow(/omit owner/);
 });
 it('reads through mcp_read with the server-held owner only',async()=>{
  const rpc=vi.fn(async(_fn:string,_args:any)=>({data:{what:'today',tasks:[]},error:null}));
  const ctx={db:{rpc,from:()=>{throw Error('no table access')}},userId:OWNER} as unknown as Context;
  expect(JSON.parse(await readContext(ctx,{what:'today'}))).toEqual({what:'today',tasks:[]});
  expect(rpc).toHaveBeenCalledWith('mcp_read',{p_user:OWNER,p_what:'today',p_args:{}});
  const failing={db:{rpc:async()=>({data:null,error:{message:'Owner not found'}})},userId:OWNER} as unknown as Context;
  await expect(readContext(failing,{what:'today'})).rejects.toThrow('Owner not found');
  await expect(readContext({db:{rpc},userId:''} as unknown as Context,{what:'today'})).rejects.toThrow(/Authenticated owner/);
 });
});
describe('N160 redo',()=>{
 const make=(row:any)=>{
  const batch:any[]=[];
  const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:row,error:null})};
  return {ctx:{db:{from:()=>q,rpc:async()=>({data:null,error:null})},userId:OWNER,batch} as unknown as Context,batch};
 };
 it('redo undoes the undo of the named action',async()=>{
  const {ctx,batch}=make({no:5,undone_by:9});
  expect(await undo(ctx,{action:5,redo:true})).toBe('redid A5');
  expect(batch).toEqual([{op:'rpc',fn:'undo_action',args:{p_no:9,p_force:false}}]);
 });
 it('refuses to redo what was never undone or is not the owner\'s',async()=>{
  await expect(undo(make({no:5,undone_by:null}).ctx,{action:5,redo:true})).rejects.toThrow(/nothing to redo/);
  await expect(undo(make(null).ctx,{action:5,redo:true})).rejects.toThrow(/not yours/);
 });
 it('plain undo is unchanged',async()=>{
  const {ctx,batch}=make(null);
  expect(await undo(ctx,{action:5})).toBe('undid A5');
  expect(batch[0].args).toEqual({p_no:5,p_force:false});
 });
});
