import {beforeEach,describe,expect,it,vi} from 'vitest';
import {LiveAdapter} from '../../../src/data/live/adapter';
import {liveClient} from '../../../src/data/live/client';
import {publishAuth} from '../../../src/data/authBoundary';

vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
const owner='11111111-1111-4111-8111-111111111111';
const input={projectSlug:'proofs',front:'Prove the claim',back:'A proof',type:'basic' as const,kind:'proof' as const};
function fixture(){
 const note={id:'note-id',no:12,user_id:owner,project_id:'project-id',version:1,front:input.front,back:'Draft',type:'basic',kind:'proof',tags:[] as string[]};
 const receipts=new Map<string,unknown>(),calls:Array<{name:string;args:Record<string,any>}>=[];
 let lost=false,created=0,grades=0;
 const deletes=vi.fn();
 const rpc=vi.fn(async(name:string,args:Record<string,any>)=>{
  calls.push({name,args:structuredClone(args)});
  if(receipts.has(args.p_operation))return {data:receipts.get(args.p_operation),error:null};
  if(name==='create_note_atomic'){
   created++;const data={status:'ok',noteNo:12,noteId:note.id,operationId:args.p_operation};
   receipts.set(args.p_operation,data);
   if(lost){lost=false;grades++;return {data:null,error:{message:'Network request failed after commit'}};}
   return {data,error:null};
  }
  if(name!=='edit_note_atomic')throw Error(name);
  if(args.p_expected!==note.version)return {data:{status:'conflict'},error:null};
  Object.assign(note,args.p_patch);note.version++;
  const data={status:'ok',version:note.version};receipts.set(args.p_operation,data);
  if(lost){lost=false;return {data:null,error:{message:'Network request failed after commit'}};}
  return {data,error:null};
 });
 const from=vi.fn((table:string)=>{
  const query={select:()=>query,eq:()=>query,single:async()=>({data:table==='projects'?{id:'project-id'}:structuredClone(note),error:null}),
   insert:()=>query,delete:()=>{deletes();return query;},
   then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:[],error:lost?{message:'Network request failed after commit'}:null}).then(resolve)};
  return query;
 });
 const getUser=vi.fn(async()=>({data:{user:{id:owner}},error:null}));
 vi.mocked(liveClient).mockReturnValue({auth:{getUser},from,rpc} as never);
 return {note,rpc,calls,from,getUser,deletes,lose:()=>{lost=true;},counts:()=>({created,grades})};
}
beforeEach(()=>{vi.clearAllMocks();publishAuth({id:owner});});
describe('N239 note snapshots and uncertain creation',()=>{
 it('rejects a tag-only stale editor without replacing the newly saved proof',async()=>{
  const h=fixture(),first=new LiveAdapter(),second=new LiveAdapter();
  await first.updateNote(12,{back:'The complete proof'},1);
  await expect(second.updateNote(12,{front:input.front,back:'Draft',type:'basic',kind:'proof',tags:['read']},1)).rejects.toMatchObject({code:'conflict'});
  expect(h.note.back).toBe('The complete proof');expect(h.note.version).toBe(2);
  expect(h.calls.map(c=>c.args.p_expected)).toEqual([1,1]);
 });
 it('requires an actual editor version before any note write',async()=>{
  const h=fixture();
  await expect(new LiveAdapter().updateNote(12,{back:'Unversioned'})).rejects.toMatchObject({code:'conflict'});
  expect(h.rpc).not.toHaveBeenCalled();expect(h.note.back).toBe('Draft');
 });
 it('rejects a different note identity even when the number and version match',async()=>{
  const h=fixture();
  await expect(new LiveAdapter().updateNote(12,{back:'Another card draft'},1,'different-note')).rejects.toMatchObject({code:'conflict'});
  expect(h.rpc).not.toHaveBeenCalled();expect(h.note.back).toBe('Draft');
 });
 it('replays an uncertain edit with the original expected version and operation identity',async()=>{
  const h=fixture(),api=new LiveAdapter();h.lose();
  await expect(api.updateNote(12,{back:'Saved proof'},1)).rejects.toMatchObject({code:'offline'});
  await api.updateNote(12,{back:'Saved proof'},1);
  expect(h.note.version).toBe(2);expect(h.note.back).toBe('Saved proof');
  expect(h.calls[1].args).toEqual(h.calls[0].args);
 });
 it('replays lost creation acknowledgement without deleting the note or its committed grade',async()=>{
  const h=fixture(),api=new LiveAdapter();h.lose();
  await expect(api.createNote(input)).rejects.toMatchObject({code:'offline'});
  await expect(api.createNote(input)).resolves.toEqual({noteNo:12});
  expect(h.counts()).toEqual({created:1,grades:1});expect(h.deletes).not.toHaveBeenCalled();
  expect(h.calls[1].args).toEqual(h.calls[0].args);
 });
 it('keeps an explicit create operation identity across adapter instances',async()=>{
  const h=fixture(),command={...input,operationId:'22222222-2222-4222-8222-222222222222'};
  await new LiveAdapter().createNote(command);await new LiveAdapter().createNote(command);
  expect(h.counts().created).toBe(1);expect(h.from).not.toHaveBeenCalled();
 });
 it('refuses an account change during note creation auth lookup',async()=>{
  const h=fixture();h.getUser.mockImplementationOnce(async()=>{publishAuth(null);return {data:{user:{id:owner}},error:null};});
  await expect(new LiveAdapter().createNote(input)).rejects.toMatchObject({code:'auth'});
  expect(h.rpc).not.toHaveBeenCalled();expect(h.deletes).not.toHaveBeenCalled();
 });
});
