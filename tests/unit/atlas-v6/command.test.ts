import {beforeEach,describe,expect,it,vi} from 'vitest';
import {LiveAdapter} from '../../../src/data/live/adapter';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import {liveClient} from '../../../src/data/live/client';
import {atlasId,atlasInput,atlasPatch,atlasVersion} from '../../../src/data/atlas-command';
const owner='11111111-1111-4111-8111-111111111111';
const id='22222222-2222-4222-8222-222222222222';
const other='33333333-3333-4333-8333-333333333333';
const impact={childConcepts:2,incomingPrerequisites:1,outgoingPrerequisites:0,
 relatedConcepts:1,notesAndCards:3,checkpointRefs:2};
vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
const reply=(version=2)=>({status:'ok',actionNo:9,
 changed:[{id,version}],concept:{id,version}});
function harness(){
 const rpc=vi.fn(async(_fn:string,args:{p:Record<string,unknown>})=>{
  if(args.p.operation==='preview_merge')
   return {data:{status:'ok',sourceVersion:2,keepVersion:3,impact},error:null};
  return {data:reply(),error:null};
 });
 vi.mocked(liveClient).mockReturnValue({auth:{getUser:async()=>({data:{
  user:{id:owner}},error:null})},rpc} as never);
 return rpc;
}
beforeEach(()=>vi.clearAllMocks());
describe('N105.2 versioned Atlas command and typed edits',()=>{
 it('validates stable UUID IDs, version, description and parent before writing',()=>{
  expect(()=>atlasId('display-name')).toThrow();
  expect(()=>atlasVersion(0)).toThrow();
  expect(()=>atlasInput({subjectId:owner,name:' ',parentId:null})).toThrow();
  expect(()=>atlasPatch({name:''})).toThrow();
  expect(atlasInput({subjectId:owner,name:' Compactness ',blurb:null}))
   .toMatchObject({subjectId:owner,name:'Compactness',blurb:null});
 });
 it('writes create, update, reparent, link and unlink only through owner RPC',async()=>{
  const rpc=harness(),api=new LiveAdapter();
  await api.createAtlasConcept({subjectId:owner,name:'New concept'});
  await api.updateAtlasConcept(id,1,{name:'Edited'});
  await api.reparentAtlasConcept(id,2,other);
  await api.linkAtlasConcept(id,3,other,'prereq');
  await api.unlinkAtlasConcept(id,4,other,'prereq');
  expect(rpc).toHaveBeenCalledTimes(5);
  const events=rpc.mock.calls.map(([,args])=>args.p);
  expect(events.map(p=>p.operation)).toEqual(['create','update','reparent','link','unlink']);
  expect(events[0]).toMatchObject({schemaVersion:1,resource:'concepts',
   patch:{subject_id:owner,name:'New concept'}});
  expect(events[1]).toMatchObject({expectedVersion:1,target:{id},patch:{name:'Edited'}});
  expect(events[2]).toMatchObject({expectedVersion:2,patch:{parent_id:other}});
  expect(events[3]).toMatchObject({expectedVersion:3,patch:{other_id:other,kind:'prereq'}});
  expect(JSON.stringify(events)).not.toContain('user_id');
  expect(events.every(p=>typeof p.operationId==='string')).toBe(true);
 });
 it('uses a read-only merge preview and optimistic versions on merge',async()=>{
  const rpc=harness(),api=new LiveAdapter();
  const preview=await api.previewAtlasMerge(id,other);
  expect(preview).toEqual({sourceVersion:2,keepVersion:3,impact});
  const merged=await api.mergeAtlasConcept(id,preview.sourceVersion,other,preview.keepVersion);
  expect(merged).toEqual({id,version:2,actionNo:9});
  expect(rpc.mock.calls[0][1].p).toMatchObject({operation:'preview_merge',
   patch:{keep_id:other}});
  expect(rpc.mock.calls[1][1].p).toMatchObject({operation:'merge',
   expectedVersion:2,patch:{keep_id:other,keep_version:3}});
 });
 it('retains exactly the same operationId on an uncertain retry and maps conflicts',async()=>{
  const rpc=harness(),api=new LiveAdapter();
  rpc.mockRejectedValueOnce(Error('timeout after server commit'));
  await expect(api.updateAtlasConcept(id,2,{blurb:'Proof'})).rejects.toThrow();
  await api.updateAtlasConcept(id,2,{blurb:'Proof'});
  const first=rpc.mock.calls[0][1].p,second=rpc.mock.calls[1][1].p;
  expect(first.operationId).toBe(second.operationId);
  expect(first).toEqual(second);
  rpc.mockResolvedValueOnce({data:{status:'conflict',reason:'stale version'},error:null});
  await expect(api.updateAtlasConcept(id,1,{name:'Stale'}))
   .rejects.toMatchObject({code:'conflict'});
 });
});
describe('N105.2 demo Atlas create and merge safety',()=>{
 it('maintains versioned edit, cycle refusal and link restoration on merge',async()=>{
  const api=new DemoAdapter();
  const atlas=await api.getAtlas();
  const subjectId=atlas.subjects[0].id;
  const created=await api.createAtlasConcept({subjectId,name:'N105 Example'});
  const child=await api.createAtlasConcept({subjectId,name:'N105 Child',parentId:created.id});
  expect((await api.getAtlas()).concepts.find(c=>c.id===child.id)?.parentId).toBe(created.id);
  const changed=await api.updateAtlasConcept(created.id,1,{blurb:'Changed'});
  expect(changed.version).toBe(2);
  await expect(api.reparentAtlasConcept(created.id,2,child.id))
   .rejects.toMatchObject({code:'invalid'});
  const linked=await api.linkAtlasConcept(created.id,2,child.id,'prereq');
  expect(linked.version).toBe(3);
  await expect(api.linkAtlasConcept(child.id,1,created.id,'prereq'))
   .rejects.toMatchObject({code:'invalid'});
  const preview=await api.previewAtlasMerge(child.id,created.id);
  expect(preview.impact).toMatchObject({childConcepts:0});
  const merged=await api.mergeAtlasConcept(child.id,preview.sourceVersion,
   created.id,preview.keepVersion);
  expect(merged.mergedId).toBe(child.id);
  const final=await api.getAtlas();
  expect(final.concepts.some(c=>c.id===child.id)).toBe(false);
  expect(final.links.every(e=>e.fromId!==child.id&&e.toId!==child.id)).toBe(true);
 });
});
