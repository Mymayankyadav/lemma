import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {assertValidAtlasParent,assertNoPrerequisiteCycle} from '../../../supabase/functions/mcp/tools/learning-graph';
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

describe('N88 Atlas hierarchy and edges',()=>{
 const a={id:'a',user_id:owner,subject_id:'subject',parent_id:null};
 const b={id:'b',user_id:owner,subject_id:'subject',parent_id:'a'};
 const child={id:'child',user_id:owner,subject_id:'subject',parent_id:'b'};
 it('accepts valid same-owner parents and rejects descendant cycles',()=>{
  expect(()=>assertValidAtlasParent(a,'b','subject',[a,b,child])).toThrow(/cycle/);
  expect(()=>assertValidAtlasParent(child,'a','subject',[a,b,child])).not.toThrow();
 });
 it('rejects a foreign or cross-subject Atlas parent',()=>{
  expect(()=>assertValidAtlasParent(child,'elsewhere','subject',[
   ...[a,b,child],{id:'elsewhere',user_id:other,subject_id:'subject',parent_id:null},
  ])).toThrow(/same owner subject/);
  expect(()=>assertValidAtlasParent(child,'other-subject','subject',[
   ...[a,b,child],{id:'other-subject',user_id:owner,subject_id:'other',parent_id:null},
  ])).toThrow(/same owner subject/);
 });
 it('rejects prerequisite cycles while preserving unrelated and related edges',()=>{
  const edges=[{from_id:'a',to_id:'b',kind:'prereq'},
   {from_id:'b',to_id:'child',kind:'prereq'},
   {from_id:'child',to_id:'a',kind:'related'}];
  expect(()=>assertNoPrerequisiteCycle('child','a',edges)).not.toThrow();
  expect(()=>assertNoPrerequisiteCycle('a','child',edges)).toThrow(/cycle/);
  expect(()=>assertNoPrerequisiteCycle('a','a',edges)).toThrow(/itself/);
 });
});

// N88 Done: every owner-editable registry column of the learning tables has a
// real MCP path. Read from the registry so a newly classified column fails.
const repo=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');
const editableColumns=(table:string)=>Object.entries(
 JSON.parse(repo('docs/v6/capability-registry/'+table+'.json')).columns as
  Record<string,{classification:string;mcpPath:string}>)
 .filter(([,meta])=>meta.classification==='owner-editable');
const control=repo('supabase/functions/mcp/tools/control.ts');
const allowedFields=(table:string)=>{
 const body=/const allowed:[^=]*=\{([\s\S]*?)\n\};/.exec(control)?.[1]??'';
 const entry=new RegExp('\\b'+table+":'([^']*)'").exec(body);
 return new Set((entry?.[1]??'').split(/\s+/).filter(Boolean));
};
describe('N88 learning-resource registry coverage',()=>{
 it('maps every owner-editable subject, style, concept and source column to an MCP add/edit field',()=>{
  const alias:Record<string,string[]>={subject_id:['subject','subject_id'],parent_id:['parent','parent_id']};
  const missing:string[]=[];
  for(const table of ['subjects','styles','concepts','sources']){
   const fields=allowedFields(table);
   expect(fields.size,table+' allowlist').toBeGreaterThan(0);
   for(const [column] of editableColumns(table)){
    const names=alias[column]??[column];
    // A style key is chosen when MCP adds the style (add accepts `key`).
    const onAdd=table==='styles'&&column==='key'&&/f\.key/.test(control);
    if(!names.some(name=>fields.has(name))&&!onAdd)missing.push(table+'.'+column);
   }
  }
  expect(missing).toEqual([]);
 });
 it('keeps PDF ingest columns read-only for MCP and validates source order',()=>{
  const sourceFields=allowedFields('sources');
  for(const column of ['storage_path','sha256','bytes','filename','outline','project_id'])
   expect(sourceFields.has(column),'sources.'+column).toBe(false);
  expect(sourceFields.has('position')).toBe(true);
  expect(control).toContain('Source position must be a non-negative whole number');
 });
 it('writes every owner-editable source page column through save_pages',()=>{
  const transcribe=repo('supabase/functions/mcp/tools/transcribe.ts');
  for(const [column] of editableColumns('source_pages'))
   expect(transcribe,'source_pages.'+column).toMatch(new RegExp('\\b'+column+'\\b'));
 });
 it('writes every owner-editable Atlas edge column through the graph edit',()=>{
  const insert=/table:'concept_links',values:\{([^}]*)\}/.exec(control)?.[1]??'';
  for(const [column] of editableColumns('concept_links'))
   expect(insert,'concept_links.'+column).toMatch(new RegExp('\\b'+column+'\\b'));
 });
 it('reaches checkpoint citations only through owner-approved plan proposals',()=>{
  for(const [column,meta] of editableColumns('checkpoint_sources'))
   expect(meta.mcpPath,'checkpoint_sources.'+column).toMatch(/propose_plan/);
  expect(control).not.toMatch(/table:'checkpoint_sources'/);
 });
});
