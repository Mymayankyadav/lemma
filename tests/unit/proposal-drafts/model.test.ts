import {describe,expect,it} from 'vitest';
import type {ProposalDraftRecord} from '../../../src/data/proposal-drafts/contract';
import {compareDraftSourceVersions,draftConflictDetails,nextDraftState,
 normalizeBaseVersions,normalizeDraftPayload,normalizeDraftQuery,
 normalizeNewDraft} from '../../../src/data/proposal-drafts/model';

const proposal='11111111-1111-4111-8111-111111111111';
const target='22222222-2222-4222-8222-222222222222';
const id='33333333-3333-4333-8333-333333333333';
const at='2026-11-07T14:00:00+05:30';
const record=(status:ProposalDraftRecord['status']='draft'):ProposalDraftRecord=>({
 id,proposalId:proposal,targetId:target,baseVersions:{proposal:3,target:8},
 payload:{title:'Full edit',sections:[{text:'Review independently'}]},
 draftVersion:4,status,editedAt:'2026-11-07T09:00:00Z',
 createdAt:'2026-11-07T08:00:00Z',
});

describe('N63.1 proposal draft lifecycle and no forged approval',()=>{
 it('validates complete edits and deep clones JSON instead of sharing payloads',()=>{
  const original={title:'Changed',detail:{items:[{body:'one'}]},nullValue:null};
  const cloned=normalizeDraftPayload(original);
  original.detail.items[0].body='modified';
  expect((cloned.detail as {items:{body:string}[]}).items[0].body).toBe('one');
  expect(cloned).toEqual({title:'Changed',detail:{items:[{body:'one'}]},nullValue:null});
  expect(()=>normalizeDraftPayload({})).toThrow();
  expect(()=>normalizeDraftPayload(null as never)).toThrow();
 });
 it('rejects caller ownership, approval/source fields and non-JSON content',()=>{
  const forbidden=[
   {user_id:'other'}, {ownerId:'other'}, {source:'mcp'},
   {approvedAt:'now'}, {nested:{userId:'other'}},
   {status:'submitted'}, {decision:'approve'},
   {nested:{approved_by:'other'}}, {secret:undefined},
   {nan:NaN}, {infinite:Infinity},
   {invalid:()=>null}, {now:new Date()}, {bigint:BigInt(2)}
  ];
  for(const value of forbidden)expect(()=>normalizeDraftPayload(value as never)).toThrow();
  const loop:{self?:unknown;title:string}={title:'loop'};
  loop.self=loop;
  expect(()=>normalizeDraftPayload(loop)).toThrow();
 });
 it('normalizes UUIDs and positive base versions, rejecting unauthorized caller fields',()=>{
  const input={proposalId:proposal.toUpperCase(),targetId:target,
   baseVersions:{proposal:3,target:8},payload:{title:'Work'}};
  const data=normalizeNewDraft(input);
  expect(data.proposalId).toBe(proposal);
  expect(data.baseVersions).toEqual({proposal:3,target:8});
  for(const bad of [
   {...input,ownerId:'other'}, {...input,user_id:'other'},
   {...input,proposalId:'not-uuid'}, {...input,baseVersions:{proposal:0,target:8}},
   {...input,baseVersions:{proposal:3,target:1.5}},
   {...input,baseVersions:{proposal:3,target:8,user_id:'other'}},
   {...input,baseVersions:{proposal:2147483648,target:8}},
  ])expect(()=>normalizeNewDraft(bad as never)).toThrow();
  expect(()=>normalizeBaseVersions({proposal:1,target:2147483647})).not.toThrow();
 });
 it('saves a complete replacement and submits only saved, current-base work',()=>{
  const old=record(),next=nextDraftState(old,'save',4,at,{title:'New whole edit'});
  expect(next).toMatchObject({status:'saved',draftVersion:5,
   editedAt:at,payload:{title:'New whole edit'}});
  expect(next.payload).not.toBe(old.payload);
  expect(old.status).toBe('draft');
  expect(old.draftVersion).toBe(4);
  const submitted=nextDraftState(next,'submit',5,at,undefined,{proposal:3,target:8});
  expect(submitted.status).toBe('submitted');
  expect(submitted.draftVersion).toBe(6);
  expect(()=>nextDraftState(old,'submit',4,at,undefined,{proposal:3,target:8})).toThrow();
  expect(()=>nextDraftState(next,'submit',5,at)).toThrow();
 });
 it('never overwrites a newer draft or silently reconciles changed target versions',()=>{
  const draft=record('saved');
  expect(()=>nextDraftState(draft,'save',3,at,{title:'stale'})).toThrow();
  expect(()=>nextDraftState(draft,'submit',4,at,undefined,{proposal:3,target:9})).toThrow();
  expect(compareDraftSourceVersions({proposal:3,target:8},{proposal:4,target:9}))
   .toEqual({ok:false,changed:['proposal','target']});
  expect(compareDraftSourceVersions({proposal:3,target:8},{proposal:3,target:8}))
   .toEqual({ok:true,changed:[]});
  const attempted={title:'Mine'};
  const details=draftConflictDetails(draft,attempted,{proposal:3,target:9});
  expect(details).toMatchObject({kind:'source_version',baseVersions:{proposal:3,target:8},
   currentSourceVersions:{proposal:3,target:9},current:{draftVersion:4},
   attemptedPayload:{title:'Mine'}});
  attempted.title='changed after conflict';
  expect(details.attemptedPayload).toEqual({title:'Mine'});
  expect(draftConflictDetails(draft,{title:'Older save'}).kind).toBe('draft_version');
 });
 it('discards draft or saved work without submitting and keeps terminal states immutable',()=>{
  for(const status of ['draft','saved'] as const){
   const state=nextDraftState(record(status),'discard',4,at);
   expect(state.status).toBe('discarded');
   expect(state.draftVersion).toBe(5);
   expect(()=>nextDraftState(state,'save',5,at,{title:'Restart'})).toThrow();
  }
  const submitted=record('submitted');
  expect(()=>nextDraftState(submitted,'discard',4,at)).toThrow();
  expect(()=>nextDraftState(submitted,'save',4,at,{title:'Change'})).toThrow();
  expect(()=>nextDraftState(record(),'save',4,at)).toThrow();
  expect(()=>nextDraftState(record(),'discard',4,at,{title:'Unexpected'})).toThrow();
 });
 it('enforces owner-safe 1–50 bounded queries and filter identity',()=>{
  const query=normalizeDraftQuery({status:['saved','draft'],
   proposalId:proposal,targetId:target,limit:50,cursor:'opaque-token'});
  expect(query).toMatchObject({status:['saved','draft'],limit:50,
   proposalId:proposal,targetId:target,cursor:'opaque-token'});
  expect(normalizeDraftQuery()).toMatchObject({limit:50,cursor:null,
   status:['draft','saved','submitted','discarded']});
  for(const invalid of [
   {limit:0},{limit:51},{limit:1.5},{cursor:' '},
   {status:[]},{status:['saved','saved']},{status:['approved']},
   {proposalId:'invalid'}, {targetId:'invalid'},
   {user_id:'other'}, {ownerId:'other'}
  ])expect(()=>normalizeDraftQuery(invalid as never)).toThrow();
 });
 it('requires real timezone-aware edit instants and positive int4 draft versions',()=>{
  const v=record();
  for(const time of ['2026-11-07','2026-11-07T10:00:00',
   '2026-02-30T10:00:00Z','not-an-instant','infinity',
   '2026-11-07T25:00:00Z'])
   expect(()=>nextDraftState(v,'save',4,time,{title:'x'})).toThrow();
  for(const version of [0,-1,1.1,2147483648,NaN])
   expect(()=>nextDraftState(v,'save',version,at,{title:'x'})).toThrow();
  expect(()=>nextDraftState({...v,draftVersion:2147483647},'save',2147483647,at,
   {title:'x'})).toThrow();
 });
});
