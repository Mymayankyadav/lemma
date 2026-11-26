import {describe,it,expect,vi,afterEach} from 'vitest';
const callbacks=vi.hoisted(()=>new Map<string,(a:any,c?:any)=>Promise<any>>());
vi.mock('../../../supabase/functions/mcp/deps.ts',()=>{
 const builder:any=new Proxy(()=>builder,{get:(_,key)=>key==='~standard'?{jsonSchema:{input:()=>({}),output:()=>({})}}:builder});
 return {createClient:vi.fn(),z:builder,McpServer:class{registerTool(n:string,_o:any,cb:any){callbacks.set(n,cb)}}};
});
import {fakeContext,OWNER} from '../adaptive/fakedb';
import {review,grade,setPrompt,remove} from '../../../supabase/functions/mcp/tools/control';
import {savePages} from '../../../supabase/functions/mcp/tools/transcribe';
import {proposeCardEdits,saveProgress} from '../../../supabase/functions/mcp/tools/write';
import {buildServer} from '../../../supabase/functions/mcp/server';
import {prune} from '../../../supabase/functions/mcp/schema-prune';
const prefs={connector_last_client:'chatgpt',time_zone:'UTC',rollover_hour:0,reviews_per_day:200,new_per_day:20,
 learn_ahead_minutes:20,mix_decks:false,learn_steps:'1m 10m',relearn_steps:'10m',desired_retention:.9,max_interval_days:36500,fuzz:false,load_balance:false};
const project={id:'p',slug:'proofs',title:'Proofs',status:'active',system:false,prompt:'Base'};
const ctx=(tables:Record<string,any[]>)=>({...fakeContext({settings:[prefs],projects:[project],...tables},[],{project:true}),batch:[] as any[]});
afterEach(()=>vi.useRealTimers());
describe('N239 MCP integrity',()=>{
 it('advertises UUID format compactly while retaining unrelated patterns',()=>{
  expect(prune({type:'string',format:'uuid',pattern:'uuid-pattern'})).toEqual({type:'string',format:'uuid'});
  expect(prune({type:'string',pattern:'^[a-z]+$'})).toEqual({type:'string',pattern:'^[a-z]+$'});
 });
 it('binds proposed card edits to the version used to prepare them (#1814)',async()=>{
  const c=ctx({notes:[{id:'n',no:1,project_id:'p',version:7}],card_comments:[]});
  await proposeCardEdits(c,{edits:[{card:'N1',front:'Clarified proof',reason:'Clarity'}]});
  expect(c.batch[0]).toMatchObject({table:'proposals',values:{base_target_versions:{notes:{n:7}}}});
 });
 it('sends the observed page body as a transaction precondition and retains existing labels/confidence (#1818/#1813)',async()=>{
  const c=ctx({sources:[{id:'s',project_id:'p',short:'scan',filename:'scan.pdf',has_text:true,page_count:10}],
   source_pages:Array.from({length:10},(_,i)=>({source_id:'s',page:i+1,body:'',label:'00'+(i+1),confidence:'check'}))});
  await savePages(c,{project:'proofs',source:'scan',replace:false,pages:Array.from({length:10},(_,i)=>({page:i+1,text:'Proof '+(i+1)}))});
  expect(c.batch).toHaveLength(10);
  for(const command of c.batch){expect(command.expected).toEqual({body:''});expect(command.values.label).toBe('00'+command.where.page);expect(command.values.confidence).toBe('check')}
 });
 it('protects both global and project prompts with the value read by the caller (#1809)',async()=>{
  for(const scope of ['proofs','all']){
   const c=ctx({settings:[{...prefs,master_prompt:'Base'}]});
   await setPrompt(c,{scope,mode:'append',text:'First'});
   expect(c.batch[0].expected).toEqual(scope==='all'?{master_prompt:'Base'}:{prompt:'Base'});
   expect(Object.values(c.batch[0].values)).toEqual(['Base\nFirst']);
  }
 });
 it('returns every overdue card beyond the first 1,000 rows and grades its exact identity (#1822)',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-25T12:00:00Z'));
  const notes=Array.from({length:1050},(_,i)=>({id:'n'+String(i).padStart(4,'0'),no:i+1,project_id:'p',status:'active',type:'basic',front:'Proof '+i,back:'Answer'}));
  const cards=notes.map((n,i)=>({id:'c'+String(i).padStart(4,'0'),note_id:n.id,ord:1,version:3,state:2,due:i<1000?'2026-12-01T12:00:00Z':'2026-11-24T12:00:00Z',stability:10,difficulty:5,reps:2,lapses:0,step:0,last_review:'2026-11-10T12:00:00Z'}));
  const c=ctx({notes,cards,reviews:[]});
  expect(await review(c,{new:false,count:10})).toMatch(/^50 due\./);
  expect(await grade(c,{answers:[{card:'N1010.1',rating:'good'}]})).toMatch(/^graded 1/);
  expect(c.batch[0]).toMatchObject({fn:'record_review',args:{p_card:'c1009',p_next:{expected_version:3}}});
 });
 it('counts daily quota owner-wide and shows the reverse sibling prompt (#1778/#1777)',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-25T12:00:00Z'));
  const c=ctx({settings:[{...prefs,reviews_per_day:2}],notes:[{id:'n',no:1,project_id:'p',status:'active',type:'reverse',front:'A',back:'B'}],
   cards:[{id:'c',note_id:'n',ord:2,version:9,state:2,due:'2026-11-24T12:00:00Z'}],
   reviews:[{id:1,card_id:'elsewhere',state_before:2,reviewed_at:'2026-11-25T10:00:00Z'}]});
  expect(await review(c,{project:'proofs',new:false})).toContain('N1.2 v9 Front: B / Back: A');
  (c.db as any).from=ctx({settings:[{...prefs,reviews_per_day:1}],notes:[{id:'n',no:1,project_id:'p',status:'active'}],cards:[{id:'c',note_id:'n',ord:1,state:2,due:'2026-11-24T12:00:00Z'}],reviews:[{id:1,card_id:'elsewhere',state_before:2,reviewed_at:'2026-11-25T10:00:00Z'}]}).db.from;
  expect(await review(c,{project:'proofs',new:false})).toMatch(/^0 due\./);
 });
 it('never reads or returns source/transcript bodies for a delete preview, and requires its token (#1817)',async()=>{
  const c=ctx({});const from=vi.spyOn(c.db,'from');
  const token='a'.repeat(64);c.db.rpc=vi.fn(async()=>({data:{token,counts:{projects:1,notes:25}},error:null}));
  expect(await remove(c,{target:'proofs',confirm:false})).toBe('proofs: 1 projects, 25 notes. Confirm before deleting. previewToken: '+token);
  expect(from.mock.calls.map(([table])=>table)).toEqual(['projects']);expect(c.batch).toEqual([]);
  await expect(remove(c,{target:'proofs',confirm:true})).rejects.toThrow(/previewToken/);
  await remove(c,{target:'proofs',confirm:true,previewToken:token});
  expect(c.batch[0]).toEqual({op:'delete',table:'projects',where:{id:'p'},expectedScope:token});
 });
 it('passes explicit stable progress identity to the transaction (#1819)',async()=>{
  const c=ctx({sessions:[{id:'s',project_id:'p',number:1,resume_step:1}]});const operationId='11111111-1111-4111-8111-111111111111';
  await saveProgress(c,{project:'proofs',session:'S1',operationId,events:[{kind:'recheck',text:'Proof',outcome:'demonstrated'}]});
  expect(c.batch[0]).toMatchObject({fn:'save_progress',args:{operation_id:operationId,p_user_id:OWNER}});
 });
 it('returns the complete review correction snapshot as parseable JSON through the server',async()=>{
  const c=ctx({lemma_command_resources:[{resource:'review_corrections',mcp_ok:true,
   schema:{operations:['correct','void'],fields:['reason','replacementState']}}]});
  const snapshot={review:{id:'42',cardId:'card',rating:3},card:{id:'card',version:7,
   schedule:{state:2,due:'2026-12-01T00:00:00Z',stability:5,difficulty:4,
    last_review:'2026-11-25T08:00:00Z',step:0,reps:3,lapses:0}},expectedVersion:7,readAt:'2026-11-25T09:00:00Z'};
  c.db.rpc=vi.fn(async(name,args)=>{
   if(name==='mcp_seen')return {data:null,error:null};
   expect(name).toBe('n239_mcp_review_correction_snapshot');
   expect(args).toEqual({p_user:OWNER,p_review:'42'});
   return {data:snapshot,error:null};
  });
  buildServer(c);
  const reply=await callbacks.get('get')!({what:'review_corrections',id:'42'},{mcpReq:{signal:new AbortController().signal}});
  expect(reply.isError).not.toBe(true);
  const parsed=JSON.parse(reply.content[0].text);
  expect(parsed).toMatchObject({resource:'review_corrections',items:[snapshot],total:1,nextCursor:null});
  expect(parsed.guidance).toContain('expectedVersion');
 });
 it('uses the committed progress receipt even when the session has advanced since the original call (#1819)',async()=>{
  const c=ctx({sessions:[{id:'s',project_id:'p',number:1,resume_step:8}]});
  c.db.rpc=vi.fn(async()=>({data:{action:42,result:{step:3,events:2}},error:null}));
  buildServer(c);
  const reply=await callbacks.get('save_progress')!({project:'proofs',session:'S1',misconception:'Sign error'},{mcpReq:{signal:new AbortController().signal}});
  expect(reply.isError).not.toBe(true);expect(reply.content[0].text).toContain('saved S1: step 3, 2 events');
  expect(reply.content[0].text).toContain('Undo: A42');
 });
 it('acknowledges a committed grade when the optional next-card lookup fails (#1810)',async()=>{
  const c=ctx({notes:[{id:'n',no:1,project_id:'p',status:'active',type:'basic',front:'A',back:'B'}],
   cards:[{id:'card',note_id:'n',ord:1,version:1,state:0,due:'2026-11-25T12:00:00Z',stability:0,difficulty:0,reps:0,lapses:0,step:0,last_review:null}],reviews:[]});
  const from=c.db.from;let committed=false;
  c.db.from=table=>committed&&table==='settings'?{select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:{message:'Read failed'}})})})}:from(table);
  c.db.rpc=vi.fn(async(name)=>{if(name==='mcp_commit'){committed=true;return {data:{action:42},error:null}}return {data:null,error:null}});
  buildServer(c);
  const reply=await callbacks.get('grade')!({answers:[{card:'N1.1',rating:'good'}]},{mcpReq:{signal:new AbortController().signal}});
  expect(reply.isError).not.toBe(true);expect(reply.content[0].text).toContain('graded 1');expect(reply.content[0].text).toContain('Grade saved; next-card lookup unavailable.');expect(reply.content[0].text).toContain('Undo: A42');
 });
});
