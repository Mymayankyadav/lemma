import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {study,type StudyInput} from '../../../supabase/functions/mcp/tools/study';
import type {Context} from '../../../supabase/functions/mcp/db';

const owner='11111111-1111-4111-8111-111111111111';
const other='99999999-9999-4999-8999-999999999999';
const task:StudyInput['command']={
  operationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  schemaVersion:1,resource:'tasks',operation:'create',
  patch:{title:'Prove theorem',priority:'high',due_kind:'date',due_date:'2026-11-12'}
};
function fixture(receipt:unknown={status:'ok',changed:[{id:'task-1',version:1}],actionNo:14},error:{message:string}|null=null){
  const rpc=vi.fn().mockResolvedValue({data:receipt,error});
  const context={userId:owner,db:{rpc}} as unknown as Context;
  return {context,rpc};
}
describe('N34 existing study tool routes task commands',()=>{
  it('uses the owner-bound task bridge and passes the exact envelope and client',async()=>{
    const {context,rpc}=fixture();
    const input={command:task,client:'chatgpt',userId:other} as StudyInput;
    await study(context,input);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('mcp_task_command',{
      p_user:owner,p_source:'chatgpt',p:task
    });
    expect(rpc.mock.calls[0][1].p).not.toHaveProperty('userId');
  });
  it('returns the unmodified reversible receipt, including actionNo or conflict',async()=>{
    const conflict={status:'conflict',actionNo:null,conflict:{currentVersion:4}};
    const {context}=fixture(conflict);
    expect(await study(context,{command:task})).toBe(conflict);
  });
  it('leaves the study command bridge unchanged for existing resources',async()=>{
    const {context,rpc}=fixture();
    const existing={...task,resource:'study_entries'} as StudyInput['command'];
    await study(context,{command:existing});
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('mcp_study_command',{
      p_user:owner,p_source:'other',p:existing
    });
  });
  it('propagates database errors and never reports success on a failed task write',async()=>{
    const {context}=fixture(null,{message:'Task not found'});
    await expect(study(context,{command:task})).rejects.toThrow('Task not found');
  });
  it('keeps only the existing study tool and full receipt serialization',()=>{
    const source=readFileSync('supabase/functions/mcp/server.ts','utf8');
    expect(source.match(/registerTool\('study'/g)).toHaveLength(1);
    expect(source).toContain("resource:z.enum(['study_entries','study_intervals','calendar_blocks','tasks'])");
    expect(source).toContain("text:JSON.stringify(receipt)");
    expect(source).not.toContain("registerTool('tasks'");
    expect(readFileSync('supabase/functions/mcp/rules.ts','utf8')).toMatch(/explicitly instructs/);
  });
});