import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {createLiveProposalDraftApi} from '../../../src/data/proposal-drafts/live';
import {getProposalDraftApi,setProposalDraftApiForTests} from '../../../src/data/proposal-drafts';
import {DEMO_DRAFT_SOURCE} from '../../../src/data/proposal-drafts/demo';
const {getClient}=vi.hoisted(()=>({getClient:vi.fn()}));
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>getClient()}));
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'live'}));
const P=DEMO_DRAFT_SOURCE.proposalId,T=DEMO_DRAFT_SOURCE.targetId;
const input={proposalId:P,targetId:T,baseVersions:{proposal:1,target:1},
 payload:{front:'Revised'}};
const when='2026-11-08T04:00:00Z';
type R=Record<string,unknown>;
function fixture(){
 let drafts:R[]=[];
 const logs:Array<{table:string;filters:string[];count:boolean}>=[];
 const rpc=vi.fn(async(_name:string,request:{p:R})=>{
  const p=request.p,operation=p.operation as string,patch=p.patch as R;
  let row:R|undefined;
  if(operation==='create'){
   row={id:'33333333-3333-4333-8333-'+String(drafts.length+1).padStart(12,'0'),
    proposal_id:P,target_id:T,base_proposal_version:1,
    base_versions:patch.base_versions,payload:patch.payload,
    status:'draft',draft_version:1,edited_at:when,created_at:when};
   drafts.push(row);
  }else{
   row=drafts.find(d=>d.id===(p.target as R).id);
   if(!row)return {data:null,error:{code:'P0001',message:'Draft not found for owner'}};
   if(row.draft_version!==p.expectedVersion)return {data:{
    status:'conflict',reason:'Stale draft version'},error:null};
   row={...row,draft_version:Number(row.draft_version)+1,
    status:operation==='save'?'saved':operation==='submit'?'submitted':'discarded',
    payload:operation==='save'?patch.payload:row.payload};
   drafts=drafts.map(d=>d.id===row!.id?row!:d);
  }
  return {data:{status:'ok',actionNo:21,draft:row,
   changed:[{resource:'proposal_drafts',id:row.id,version:row.draft_version}]},error:null};
 });
 const from=vi.fn((table:string)=>{
  let items:R[]=[],count=false,head=false,filters:string[]=[];
  if(table==='proposals')items=[{id:P,version:1,status:'pending',withdrawn_at:null}];
  if(table==='projects')items=[{id:T,version:1}];
  if(table==='proposal_drafts')items=drafts;
  const record={table,filters,count:false};logs.push(record);
  const predicates:Array<(row:R)=>boolean>=[];
  const value=()=>{
   const all=items.filter(r=>predicates.every(fn=>fn(r)));
   return {data:head?null:all,count:count?all.length:null,error:null};
  };
  const q={
   select:(_field:string,options?:{count?:string;head?:boolean})=>{
    count=options?.count==='exact';head=options?.head===true;record.count=count;return q},
   in:(field:string,values:unknown[])=>{filters.push('in:'+field);
    predicates.push(r=>values.includes(r[field]));return q},
   eq:(field:string,expected:unknown)=>{filters.push('eq:'+field);
    predicates.push(r=>r[field]===expected);return q},
   gt:(field:string,expected:string)=>{filters.push('gt:'+field);
    predicates.push(r=>String(r[field])>expected);return q},
   order:(_field:string,_options?:unknown)=>q,
   limit:(n:number)=>Promise.resolve({...value(),data:
    (value().data??[]).sort((a,b)=>String(a.id).localeCompare(String(b.id))).slice(0,n)}),
   maybeSingle:async()=>({data:(value().data??[])[0]??null,error:null}),
   then:(resolve:(x:ReturnType<typeof value>)=>unknown)=>Promise.resolve(resolve(value())),
  };
  return q;
 });
 return {db:{from,rpc},rpc,from,logs,get drafts(){return drafts},
  setDrafts(rows:R[]){drafts=rows}};
}
beforeEach(()=>{getClient.mockReset();setProposalDraftApiForTests(null)});
afterEach(()=>{setProposalDraftApiForTests(null)});
describe('N63.2 owner-RLS proposal draft live adapter',()=>{
 it('sends a schema v1 owner-free create envelope with real target snapshot',async()=>{
  const f=fixture();getClient.mockReturnValue(f.db);
  const api=createLiveProposalDraftApi();
  const created=await api.createDraft(input);
  expect(created).toMatchObject({actionNo:21,record:{status:'draft',
   baseVersions:{proposal:1,target:1},payload:{front:'Revised'}}});
  expect(f.rpc).toHaveBeenCalledWith('proposal_drafts_command',{p:
   expect.objectContaining({schemaVersion:1,resource:'proposal_drafts',operation:'create',
    patch:{proposal_id:P,target_id:T,payload:{front:'Revised'},
     base_versions:{projects:{[T]:1}}}})});
  expect(JSON.stringify(f.rpc.mock.calls)).not.toMatch(/user_id|ownerId|p_user/);
  expect(getProposalDraftApi().mode).toBe('live');
 });
 it('uses versioned save/submit/discard RPC without implicitly approving',async()=>{
  const f=fixture();getClient.mockReturnValue(f.db);
  const api=createLiveProposalDraftApi();
  const first=(await api.createDraft(input)).record;
  const saved=await api.saveDraft(first.id,1,{front:'Edited'});
  expect(saved.record).toMatchObject({status:'saved',draftVersion:2});
  const submitted=await api.submitDraft(first.id,2,input.baseVersions);
  expect(submitted.record.status).toBe('submitted');
  const second=(await api.createDraft(input)).record;
  expect((await api.discardDraft(second.id,1)).record.status).toBe('discarded');
  expect(f.rpc.mock.calls.map(x=>(x[1] as {p:R}).p.operation))
   .toEqual(['create','save','submit','create','discard']);
 });
 it('retries network-uncertain response with exactly the same operation ID',async()=>{
  const f=fixture();getClient.mockReturnValue(f.db);
  const response=f.rpc.getMockImplementation()!;
  f.rpc.mockImplementationOnce(async()=>({data:null,error:{message:'network timeout'}}))
   .mockImplementationOnce(response);
  const api=createLiveProposalDraftApi();
  await api.createDraft(input);
  const ids=f.rpc.mock.calls.map(x=>(x[1] as {p:R}).p.operationId);
  expect(ids).toHaveLength(2);expect(ids[0]).toBe(ids[1]);
 });
 it('returns typed current/base/attempted version conflict',async()=>{
  const f=fixture();getClient.mockReturnValue(f.db);
  const api=createLiveProposalDraftApi();
  const created=(await api.createDraft(input)).record;
  await api.saveDraft(created.id,1,{front:'First'});
  await expect(api.saveDraft(created.id,1,{front:'Other'})).rejects.toMatchObject({
   code:'conflict',details:{kind:'draft_version',current:{draftVersion:2},
    baseVersions:input.baseVersions,attemptedPayload:{front:'Other'}}});
 });
 it('reads exact owner pages over fifty, binding cursors to status and IDs',async()=>{
  const f=fixture();getClient.mockReturnValue(f.db);
  f.setDrafts(Array.from({length:57},(_,i)=>({
   id:'33333333-3333-4333-8333-'+String(i+1).padStart(12,'0'),
   proposal_id:P,target_id:T,base_proposal_version:1,
   base_versions:{projects:{[T]:1}},payload:{front:'Q'+i},
   draft_version:1,status:'draft',edited_at:when,created_at:when,
  })));
  const api=createLiveProposalDraftApi(),ids:string[]=[];
  let cursor:string|null=null;
  for(let i=0;i<4;i++){
   const page=await api.listDrafts({limit:17,cursor});
   expect(page.total).toBe(57);ids.push(...page.items.map(x=>x.id));
   cursor=page.nextCursor;if(!cursor)break;
   await expect(api.listDrafts({cursor,status:['saved']}))
    .rejects.toMatchObject({code:'invalid'});
  }
  expect(ids).toHaveLength(57);
  expect(new Set(ids).size).toBe(57);
  expect(f.logs.some(l=>l.count&&l.table==='proposal_drafts')).toBe(true);
 });
 it('refuses changed target/proposal versions before issuing submit RPC',async()=>{
  const f=fixture();getClient.mockReturnValue(f.db);
  const api=createLiveProposalDraftApi();
  const draft=(await api.createDraft(input)).record;
  await api.saveDraft(draft.id,1,{front:'Edited'});
  const count=f.rpc.mock.calls.length;
  await expect(api.submitDraft(draft.id,2,{proposal:2,target:1}))
   .rejects.toMatchObject({code:'conflict',details:{kind:'source_version'}});
  expect(f.rpc).toHaveBeenCalledTimes(count);
 });
});
