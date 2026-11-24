// @vitest-environment node
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url',()=>({default:'unused-worker'}));
const mock=vi.hoisted(()=>({from:vi.fn()}));
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>({from:mock.from})}));
vi.mock('../../../src/data/live/helpers',async original=>({...await original<typeof import('../../../src/data/live/helpers')>(),owner:async()=> 'owner-1'}));
import {publishAuth} from '../../../src/data/authBoundary';
import {LiveAdapter} from '../../../src/data/live/adapter';

const input={projectSlug:'proofs',front:'Question',back:'Proof',type:'basic' as const,kind:'proof' as const};
const offline={message:'Failed to fetch'};
function fixture({committed=true,readError=false,throws=false,partial=false,error=offline as unknown,afterInsert=()=>{},afterRead=()=>{}}={}){
 const state={note:true,cards:[] as number[],reviews:0,deletes:0};
 const reads:Record<string,unknown>[]=[],writes:string[]=[];
 mock.from.mockImplementation((table:string)=>{
  let action='read';let payload:unknown;const filters:Record<string,unknown>={};
  const q={
   select:()=>q,eq:(key:string,value:unknown)=>{filters[key]=value;return q;},single:()=>q,
   insert:(value:unknown)=>{action='insert';payload=value;return q;},
   delete:()=>{action='delete';return q;},
   then:(resolve:(value:unknown)=>unknown,reject:(error:unknown)=>unknown)=>Promise.resolve().then(()=>{
    if(table==='projects')return {data:{id:'project-1'},error:null};
    if(table==='notes'&&action==='insert'){writes.push('note insert');return {data:{id:'note-1',no:42},error:null};}
    if(action==='delete'){state.deletes++;state.note=false;state.cards=[];state.reviews=0;return {data:null,error:null};}
    if(table==='cards'&&action==='insert'){
     writes.push('card insert');
     if(committed){state.cards=(payload as {ord:number}[]).map(c=>c.ord);if(partial)state.cards=state.cards.slice(0,1);state.reviews=1;}
     afterInsert();
     if(throws)throw new TypeError('Failed to fetch');
     return {data:null,error};
    }
    if(table==='cards'&&action==='read'){
     reads.push(filters);afterRead();
     return readError?{data:null,error:offline}:{data:state.cards.map(ord=>({ord})),error:null};
    }
    throw new Error('Unexpected fixture request '+table+' '+action);
   }).then(resolve,reject),
  };return q;
 });
 return {state,reads,writes};
}
describe('bug #1816 uncertain card creation is never compensated by deleting its note',()=>{
 beforeEach(()=>{publishAuth({id:'owner-1'});mock.from.mockReset();vi.stubGlobal('navigator',{onLine:true});});
 afterEach(()=>vi.unstubAllGlobals());
 it('recovers a committed basic card after a lost acknowledgement and preserves a later grade',async()=>{
  const f=fixture();
  await expect(new LiveAdapter().createNote(input)).resolves.toEqual({noteNo:42});
  expect(f.state).toEqual({note:true,cards:[1],reviews:1,deletes:0});
  expect(f.reads).toEqual([{user_id:'owner-1',note_id:'note-1'}]);
  expect(f.writes).toEqual(['note insert','card insert']);
 });
 it('also reconciles a thrown transport failure after commit',async()=>{
  const f=fixture({throws:true});
  await expect(new LiveAdapter().createNote(input)).resolves.toEqual({noteNo:42});
  expect(f.state.reviews).toBe(1);expect(f.state.deletes).toBe(0);
 });
 it('requires every expected cloze ordinal before reporting recovery',async()=>{
  const f=fixture({partial:true});
  await expect(new LiveAdapter().createNote({...input,type:'cloze',front:'{{c1::one}} {{c2::two}}'})).rejects.toMatchObject({code:'offline'});
  expect(f.state).toEqual({note:true,cards:[1],reviews:1,deletes:0});
 });
 it('recovers all committed cloze ordinals without replacing their grades',async()=>{
  const f=fixture();
  await expect(new LiveAdapter().createNote({...input,type:'cloze',front:'{{c1::one}} {{c2::two}}'})).resolves.toEqual({noteNo:42});
  expect(f.state).toEqual({note:true,cards:[1,2],reviews:1,deletes:0});
 });
 it('retains committed data when reconciliation is unavailable',async()=>{
  const f=fixture({readError:true});
  await expect(new LiveAdapter().createNote(input)).rejects.toMatchObject({code:'offline'});
  expect(f.state).toEqual({note:true,cards:[1],reviews:1,deletes:0});
 });
 it('reports a definite rejected insertion without unsafe parent cleanup',async()=>{
  const f=fixture({committed:false,error:{code:'42501',message:'not permitted'}});
  await expect(new LiveAdapter().createNote(input)).rejects.toMatchObject({code:'auth'});
  expect(f.state).toEqual({note:true,cards:[],reviews:0,deletes:0});
 });
 it('does not claim success when the ambiguous insert has no visible cards',async()=>{
  const f=fixture({committed:false});
  await expect(new LiveAdapter().createNote(input)).rejects.toMatchObject({code:'offline'});
  expect(f.state.deletes).toBe(0);
 });
 it('rejects a retired auth generation before reconciliation without a read or delete',async()=>{
  const f=fixture({afterInsert:()=>publishAuth(null)});
  await expect(new LiveAdapter().createNote(input)).rejects.toMatchObject({code:'auth'});
  expect(f.reads).toEqual([]);expect(f.state.deletes).toBe(0);
 });
 it('rejects a retired auth generation after reconciliation without consuming a late receipt',async()=>{
  const f=fixture({afterRead:()=>{publishAuth(null);publishAuth({id:'owner-1'});}});
  await expect(new LiveAdapter().createNote(input)).rejects.toMatchObject({code:'auth'});
  expect(f.state.reviews).toBe(1);expect(f.state.deletes).toBe(0);
 });
 it('guards the ordinary successful receipt too',async()=>{
  const f=fixture({error:null,afterInsert:()=>publishAuth(null)});
  await expect(new LiveAdapter().createNote(input)).rejects.toMatchObject({code:'auth'});
  expect(f.reads).toEqual([]);expect(f.state.deletes).toBe(0);
 });
 it('leaves successful creation on its existing two-write path',async()=>{
  const f=fixture({error:null});
  await expect(new LiveAdapter().createNote(input)).resolves.toEqual({noteNo:42});
  expect(f.reads).toEqual([]);expect(f.writes).toEqual(['note insert','card insert']);
 });
});
