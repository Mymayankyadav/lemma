import {describe,expect,it} from 'vitest';
import {registeredResources,SAVED_TIME_OPERATIONS} from '../../../supabase/functions/mcp/tools/registry';

describe('N160 saved-time operations are discoverable',()=>{
 it('adds the study_command corrections to study_entries in get(what=resources)',async()=>{
  const rows=[{resource:'study_entries',mcp_ok:true,schema:{fields:['intent'],operations:['create','update']}},
   {resource:'tasks',mcp_ok:true,schema:{fields:['title'],operations:['create']}}];
  const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>Promise.resolve({data:rows,error:null})};
  const out=JSON.parse(await registeredResources({db:{from:()=>q},userId:'u'} as any));
  const entries=out.resources.find((r:any)=>r.resource==='study_entries');
  expect(entries.operations).toEqual(['create','update',...SAVED_TIME_OPERATIONS.study_entries]);
  expect(entries.operations).toEqual(expect.arrayContaining(['create_manual','correct','split','void','restore']));
  expect(out.resources.find((r:any)=>r.resource==='tasks').operations).toEqual(['create']);
 });
});
