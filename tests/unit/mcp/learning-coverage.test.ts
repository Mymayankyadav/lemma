import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {learningEditCommand,projectEditFields,validateProjectEditPatch}
 from '../../../supabase/functions/mcp/tools/learning-edit';

const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const project={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',user_id:owner,version:4};

describe('N88 project learning-field MCP command',()=>{
 it('covers every registry owner-editable project column',()=>{
  const cap=JSON.parse(readFileSync(resolve(process.cwd(),
   'docs/v6/capability-registry/projects.json'),'utf8'));
  const editable=Object.entries(cap.columns)
   .filter(([,meta])=>(meta as {classification:string}).classification==='owner-editable')
   .map(([name])=>name);
  for(const field of editable)expect(projectEditFields).toContain(field);
  expect(projectEditFields).toContain('pinned');
  expect(projectEditFields).toContain('status');
 });
 it('queues owner-scoped project status/pin and slug rename with DB CAS',()=>{
  const patch={slug:'new-project',pinned:true,status:'paused'};
  const copy=structuredClone(patch);
  expect(learningEditCommand('projects',project,patch,owner,4)).toEqual({
   op:'update',table:'projects',where:{id:project.id},
   expected:{version:4},values:patch,
  });
  expect(patch).toEqual(copy);
 });
 it('does not invent a version predicate when caller omits it',()=>{
  const result=learningEditCommand('projects',project,{title:'New'},owner);
  expect('expected' in result).toBe(false);
 });
 it('enforces owner identity, stale snapshots and valid int4 versions',()=>{
  expect(()=>learningEditCommand('projects',project,{pinned:true},other,4))
   .toThrow(/Owner-scoped/);
  expect(()=>learningEditCommand('projects',project,{pinned:true},owner,3))
   .toThrow(/version conflict/);
  expect(()=>learningEditCommand('projects',project,{pinned:true},owner,1.5))
   .toThrow(/Invalid expectedVersion/);
 });
 it('keeps composite style identity owner-bound',()=>{
  expect(learningEditCommand('styles',{key:'socratic',user_id:owner,version:2},
   {name:'New style'},owner,2)).toMatchObject({
   where:{user_id:owner,key:'socratic'},expected:{version:2},
  });
 });
 it('refuses invalid project lifecycle, pinned flag and slug before queueing',()=>{
  for(const patch of [{status:'deleted'},{pinned:'yes'},{slug:'Bad Slug'},
   {slug:'x'},{subject:'Math',subject_id:owner}]){
   expect(()=>validateProjectEditPatch(patch)).toThrow();
  }
  expect(()=>validateProjectEditPatch({status:'done',pinned:false,slug:'math-101'}))
   .not.toThrow();
 });
});
