import {beforeEach,describe,expect,it,vi} from 'vitest';
import {LiveAdapter} from '../../../src/data/live/adapter';
import {publishAuth} from '../../../src/data/authBoundary';

const fake=vi.hoisted(()=>({fetch:vi.fn(),getUser:vi.fn()}));
vi.mock('../../../src/data/live/client',async()=>{
 const {createClient}=await import('@supabase/supabase-js');
 const db=createClient('https://lemma.invalid','test-publishable-key',{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'lemma-path-read-test'},
  global:{fetch:fake.fetch},
 });
 db.auth.getUser=fake.getUser;
 return {liveClient:()=>db};
});

const cp1={id:'one',project_id:'path',code:'CP1',title:'Introduction',steps:['First step'],position:1,status:'demonstrated',current_step:1};
const cp2={id:'two',project_id:'path',code:'CP2',title:'Groups',steps:['Read the theorem','Prove the result'],position:2,status:'in_progress',current_step:1,objective:'Prove a theorem',source:{short:'Book'}};
const session={id:'session',project_id:'path',checkpoint_id:'two',number:3,state:'ended',started_at:'2026-11-15T11:10:00Z',last_activity_at:'2026-11-15T11:11:00Z'};
const otherCheckpointSession={...session,id:'other-session',number:4,checkpoint_id:'elsewhere',checkpoint:{code:'CP7'}};
const calls:{table:string;url:URL}[]=[];
const response=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
function reply(input:URL|string){
 const url=new URL(input),table=url.pathname.split('/').at(-1)!;
 calls.push({table,url});
 if(table==='projects')return response({id:'path',slug:'algebra',title:'Algebra',subject_id:'math',status:'active'});
 if(table==='subjects')return response([{id:'math',name:'Mathematics'}]);
 if(table==='checkpoints')return response(url.searchParams.has('path.slug')?cp2:[cp1,cp2]);
 if(table==='checkpoint_prereqs')return response([{checkpoint_id:'two',prereq_id:'one',parent:{code:'CP1'}}]);
 if(table==='checkpoint_concepts')return response([{concept:{slug:'groups',name:'Groups'}}]);
 if(table==='settings')return response({time_zone:'UTC',rollover_hour:4});
 if(table==='review_items')return response([{projectSlug:'algebra',checkpointCode:'CP2'}]);
 if(table==='sessions')return response([session,otherCheckpointSession]);
 if(table==='session_events')return response([{id:7,session_id:'session',kind:'explanation',body:'Example',created_at:'2026-11-15T11:10:30Z'}]);
 if(table==='notes')return new Response(null,{headers:{'content-range':'0-0/2'}});
 if(['proposals','sources','evidence'].includes(table))return response([]);
 throw Error('Unexpected read of '+table);
}
const reads=(table:string)=>calls.filter(call=>call.table===table);
function filter(table:string,column:string){
 return reads(table).map(call=>call.url.searchParams.get(column));
}

describe('V7 path and checkpoint live reads',()=>{
 beforeEach(()=>{
  calls.length=0;
  publishAuth({id:'owner-1'});
  fake.getUser.mockReset().mockResolvedValue({data:{user:{id:'owner-1'}},error:null});
  fake.fetch.mockReset().mockImplementation(async input=>reply(input));
 });
 it('loads the path progress, session and next step from path-scoped rows',async()=>{
  const path=await new LiveAdapter().getProject('algebra');
  expect(path.project.title).toBe('Algebra');
  expect(path.subject.name).toBe('Mathematics');
  expect(path.checkpoints[1]).toMatchObject({code:'CP2',ui:'now',dueCards:1,currentStepText:'Prove the result'});
  expect(path.sessions).toMatchObject([{checkpointCode:'CP2',number:3},{checkpointCode:'CP7',number:4}]);
  expect(fake.getUser).toHaveBeenCalledOnce();
  for(const table of ['checkpoints','proposals','sources','sessions'])expect(filter(table,'project_id')).toEqual(['eq.path']);
  expect(filter('checkpoint_prereqs','child.project_id')).toEqual(['eq.path']);
  expect(calls.filter(call=>call.table!=='review_items').every(call=>call.url.searchParams.get('user_id')==='eq.owner-1')).toBe(true);
 });
 it('loads a checkpoint without reading the entire path or unrelated owner notes and events',async()=>{
  const checkpoint=await new LiveAdapter().getCheckpoint('algebra','CP2');
  expect(checkpoint).toMatchObject({
   sourceShort:'Book',cardsCount:2,prereqs:['CP1'],concepts:[{slug:'groups',name:'Groups'}],
   view:{ui:'now',dueCards:1},events:[{body:'Example',sessionNumber:3}],sessions:[{checkpointCode:'CP2',number:3}],
   authScope:{ownerId:'owner-1',checkpointId:'two'},
  });
  expect(fake.getUser).toHaveBeenCalledOnce();
  expect(filter('checkpoints','path.slug')).toEqual(['eq.algebra',null]);
  expect(filter('checkpoints','path.status')).toEqual(['neq.archived',null]);
  expect(filter('checkpoints','path.system')).toEqual(['eq.false',null]);
  for(const table of ['notes','checkpoint_concepts','session_events'])expect(filter(table,'checkpoint_id')).toEqual(['eq.two']);
  for(const table of ['projects','proposals','sources','subjects'])expect(calls.some(call=>call.table===table)).toBe(false);
  expect(calls.filter(call=>call.table!=='review_items').every(call=>call.url.searchParams.get('user_id')==='eq.owner-1')).toBe(true);
 });
 it('shares overlapping reads but fetches again after they settle',async()=>{
  let release!:()=>void;
  const blocked=new Promise<void>(resolve=>{release=resolve;});
  fake.fetch.mockImplementation(async input=>{
   const result=reply(input);
   const url=new URL(input);
   const table=url.pathname.split('/').at(-1);
   if(['settings','review_items','checkpoint_prereqs','sessions'].includes(table??'')||
    table==='checkpoints'&&url.searchParams.has('project_id'))await blocked;
   return result;
  });
  const api=new LiveAdapter();
  const path=api.getProject('algebra'),checkpoint=api.getCheckpoint('algebra','CP2');
  const sharedTables=['settings','review_items','checkpoint_prereqs','sessions'];
  try {
   await vi.waitFor(()=>expect(filter('checkpoint_concepts','checkpoint_id')).toEqual(['eq.two']));
   for(const table of sharedTables)expect(reads(table)).toHaveLength(1);
   expect(filter('checkpoints','project_id').filter(Boolean)).toEqual(['eq.path']);
   expect(fake.getUser).toHaveBeenCalledOnce();
  } finally {release();}
  const [summary,detail]=await Promise.all([path,checkpoint]);
  expect(summary.checkpoints[1].currentStepText).toBe(detail.steps[detail.view.currentStep]);
  expect(detail.sessions).toMatchObject([{id:'session',number:3}]);
  await api.getProject('algebra');
  for(const table of sharedTables)expect(reads(table)).toHaveLength(2);
  expect(fake.getUser).toHaveBeenCalledTimes(2);
 });
 it('drops an in-flight checkpoint on an account switch',async()=>{
  let finish!:()=>void;
  const blocked=new Promise<void>(resolve=>{finish=resolve});
  let started!:()=>void;
  const arrived=new Promise<void>(resolve=>{started=resolve});
  fake.fetch.mockImplementation(async input=>{
   const result=reply(input);
   if(new URL(input).searchParams.has('path.slug')){started();await blocked;}
   return result;
  });
  const old=new LiveAdapter().getCheckpoint('algebra','CP2');
  await arrived;
  publishAuth({id:'owner-2'});
  finish();
  await expect(old).rejects.toMatchObject({code:'auth'});
  expect(calls.some(call=>call.table==='session_events')).toBe(false);
 });
});
