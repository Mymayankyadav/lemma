import {beforeEach,describe,expect,it,vi} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import {LiveAdapter} from '../../../src/data/live/adapter';
import {liveClient} from '../../../src/data/live/client';
vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
beforeEach(()=>vi.clearAllMocks());

describe('N105.2 owner Atlas graph demo commands',()=>{
 it('creates, edits, reparents, links, unlinks and merges with versions and exact impact',async()=>{
  const api=new DemoAdapter(),graph=await api.getAtlas(),subjectId=graph.subjects[0].id;
  const source=await api.createConcept({subjectId,name:'New proof chain source'});
  const keep=await api.createConcept({subjectId,name:'New proof chain kept'});
  expect(source.status).toBe('ok');
  expect(source.concept.version).toBe(1);
  const from=source.concept.id,to=keep.concept.id;
  expect(await api.getConceptVersion(from)).toBe(1);
  const edited=await api.updateConcept(from,1,{name:'Proof chain revised',blurb:'Replaced'});
  expect(edited.concept.version).toBe(2);
  await expect(api.updateConcept(from,1,{name:'Stale'})).rejects.toMatchObject({code:'conflict'});
  const parent=await api.reparentConcept(from,2,to);
  expect(parent.concept.version).toBe(3);
  await expect(api.reparentConcept(to,1,from)).rejects.toMatchObject({code:'conflict'});
  const linked=await api.linkConcept(from,3,to,'prereq');
  expect(linked.concept.version).toBe(4);
  await expect(api.linkConcept(to,1,from,'prereq')).rejects.toMatchObject({code:'conflict'});
  await expect(api.linkConcept(from,4,to,'prereq')).rejects.toMatchObject({code:'conflict'});
  const removed=await api.unlinkConcept(from,4,to,'prereq');
  expect(removed.concept.version).toBe(5);
  const preview=await api.previewConceptMerge(from,to);
  expect(preview).toMatchObject({sourceVersion:5,keepVersion:1,
   impact:{childConcepts:0,incomingPrerequisites:0,outgoingPrerequisites:0,
    relatedConcepts:0,notesAndCards:0,checkpointRefs:0}});
  await expect(api.mergeConcept(from,4,to,1)).rejects.toMatchObject({code:'conflict'});
  const merged=await api.mergeConcept(from,5,to,1);
  expect(merged.mergedId).toBe(from);
  expect(merged.concept.id).toBe(to);
  expect(merged.concept.version).toBe(2);
  const final=await api.getAtlas();
  expect(final.concepts.some(c=>c.id===from)).toBe(false);
  expect(final.concepts.find(c=>c.id===to)).toBeTruthy();
 });
 it('rejects invalid scope, self-link, missing owner concept and preserves graph on conflict',async()=>{
  const api=new DemoAdapter(),graph=await api.getAtlas(),subjectId=graph.subjects[0].id;
  const a=(await api.createConcept({subjectId,name:'Graph owner a'})).concept.id;
  const snapshot=await api.getAtlas();
  await expect(api.createConcept({subjectId:'foreign-owner',name:'Fail'}))
   .rejects.toMatchObject({code:'not_found'});
  await expect(api.linkConcept(a,1,a,'related')).rejects.toMatchObject({code:'invalid'});
  await expect(api.updateConcept('wrong-owner',1,{name:'Fail'}))
   .rejects.toMatchObject({code:'not_found'});
  await expect(api.previewConceptMerge(a,a)).rejects.toMatchObject({code:'invalid'});
  expect(await api.getAtlas()).toEqual(snapshot);
 });
});

describe('N105.2 live owner-RLS command envelopes and retry',()=>{

 it('maps P0001-raised missing concepts and graph cycles to typed owner failures',async()=>{
  let errorMessage='Atlas concept not found for owner';
  const rpc=vi.fn(async()=>({data:null,error:{code:'P0001',message:errorMessage}}));
  vi.mocked(liveClient).mockReturnValue({auth:{getUser:async()=>({
   data:{user:{id:'owner'}},error:null})},rpc} as never);
  const api=new LiveAdapter(),id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await expect(api.updateConcept(id,1,{name:'Updated'}))
   .rejects.toMatchObject({code:'not_found'});
  errorMessage='Atlas prerequisite would create a dependency cycle';
  await expect(api.linkConcept(id,1,other,'prereq'))
   .rejects.toMatchObject({code:'conflict'});
  errorMessage='Invalid Atlas command envelope';
  await expect(api.updateConcept(id,1,{name:'Bad'}))
   .rejects.toMatchObject({code:'invalid'});
  expect(rpc).toHaveBeenCalledTimes(3);
 });

 it('uses exact v1 owner-free envelopes for every write and one preview',async()=>{
  const requests:Array<Record<string,unknown>>=[];
  const rpc=vi.fn(async(_name:string,args:{p:Record<string,unknown>})=>{
   expect(_name).toBe('concepts_command');
   requests.push(structuredClone(args.p));
   if(args.p.operation==='preview_merge')
    return {data:{status:'ok',actionNo:null,changed:[],sourceVersion:3,keepVersion:4,
     impact:{childConcepts:2,incomingPrerequisites:1,outgoingPrerequisites:0,
      relatedConcepts:3,notesAndCards:1,checkpointRefs:2}},error:null};
   return {data:{status:'ok',actionNo:44,changed:[],
    concept:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',version:2,name:'Proof'}},error:null};
  });
  vi.mocked(liveClient).mockReturnValue({auth:{getUser:async()=>({
   data:{user:{id:'owner-from-auth'}},error:null})},rpc} as never);
  const api=new LiveAdapter(),a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await api.createConcept({subjectId:b,name:'New'});
  await api.updateConcept(a,2,{name:'Edited'});
  await api.reparentConcept(a,2,b);
  await api.linkConcept(a,2,b,'prereq');
  await api.unlinkConcept(a,2,b,'prereq');
  const preview=await api.previewConceptMerge(a,b);
  expect(preview.impact.notesAndCards).toBe(1);
  await api.mergeConcept(a,preview.sourceVersion,b,preview.keepVersion);
  expect(requests.map(p=>p.operation)).toEqual([
   'create','update','reparent','link','unlink','preview_merge','merge']);
  expect(requests.every(p=>p.schemaVersion===1&&p.resource==='concepts'&&
   typeof p.operationId==='string')).toBe(true);
  expect(new Set(requests.map(p=>p.operationId)).size).toBe(requests.length);
  expect(JSON.stringify(requests)).not.toMatch(/"user_id"|"ownerId"|"actor_id"/);
  expect(requests[6]).toMatchObject({expectedVersion:3,
   patch:{keep_id:b,keep_version:4}});
 });
 it('retries an uncertain RPC with the identical operationId and reports stale versions',async()=>{
  const envelopes:Array<Record<string,unknown>>=[];
  let attempts=0;
  const rpc=vi.fn(async(_name:string,args:{p:Record<string,unknown>})=>{
   envelopes.push(structuredClone(args.p));
   if(++attempts===1)throw Error('Failed to fetch after transaction');
   if(args.p.operation==='update'&&attempts>=3)
    return {data:{status:'conflict',reason:'Atlas concept version changed'},error:null};
   return {data:{status:'ok',actionNo:19,changed:[],
    concept:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',version:2}},error:null};
  });
  vi.mocked(liveClient).mockReturnValue({auth:{getUser:async()=>({
   data:{user:{id:'owner'}},error:null})},rpc} as never);
  const api=new LiveAdapter(),id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await api.updateConcept(id,1,{name:'Saved once'});
  expect(envelopes).toHaveLength(2);
  expect(envelopes[0]).toEqual(envelopes[1]);
  await expect(api.updateConcept(id,1,{name:'Stale'}))
   .rejects.toMatchObject({code:'conflict'});
 });
});
