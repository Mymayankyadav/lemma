import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createDemoProposalDraftApi,DEMO_DRAFT_SOURCE,
 setDemoDraftSourceVersionsForTests} from '../../../src/data/proposal-drafts/demo';
import type {NewProposalDraft} from '../../../src/data/proposal-drafts/contract';
const fixture=DEMO_DRAFT_SOURCE;
const value:NewProposalDraft={...fixture,baseVersions:{...fixture.baseVersions},
 payload:{front:'Q',back:'A'}};
beforeEach(()=>{sessionStorage.clear();vi.useFakeTimers();
 vi.setSystemTime(new Date('2026-11-08T03:00:00.000Z'))});
afterEach(()=>{sessionStorage.clear();vi.useRealTimers()});
describe('N63.2 isolated proposal draft demo adapter',()=>{
 it('clones and persists full edits; submitted is not approved',async()=>{
  const a=createDemoProposalDraftApi();
  const draft=(await a.createDraft(value)).record;
  expect(draft).toMatchObject({status:'draft',draftVersion:1});
  const edit={front:'Revised'};await a.saveDraft(draft.id,1,edit);
  edit.front='Tampered';
  expect((await createDemoProposalDraftApi().getDraft(draft.id))?.payload)
   .toEqual({front:'Revised'});
  const submitted=await a.submitDraft(draft.id,2,value.baseVersions);
  expect(submitted).toMatchObject({actionNo:null,record:{status:'submitted',draftVersion:3}});
  await expect(a.saveDraft(draft.id,3,{front:'Late'})).rejects.toMatchObject({code:'invalid'});
 });
 it('reports current/base/attempted payload on version and source drift',async()=>{
  const a=createDemoProposalDraftApi(),b=createDemoProposalDraftApi();
  const draft=(await a.createDraft(value)).record;
  await a.saveDraft(draft.id,1,{front:'A'});
  await expect(b.saveDraft(draft.id,1,{front:'B'})).rejects.toMatchObject({
   code:'conflict',details:{current:{draftVersion:2},baseVersions:value.baseVersions,
    attemptedPayload:{front:'B'}}});
  setDemoDraftSourceVersionsForTests(fixture.proposalId,fixture.targetId,
   {proposal:2,target:1});
  await expect(a.submitDraft(draft.id,2,value.baseVersions)).rejects.toMatchObject({
   code:'conflict',details:{kind:'source_version',currentSourceVersions:{proposal:2,target:1}}});
 });
 it('refuses overwrite by a later active draft, but supports explicit discard',async()=>{
  const api=createDemoProposalDraftApi(),first=(await api.createDraft(value)).record;
  const later=(await api.createDraft(value)).record;
  await expect(api.saveDraft(first.id,1,{front:'Old'})).rejects.toMatchObject({code:'conflict'});
  expect((await api.discardDraft(later.id,1)).record.status).toBe('discarded');
  expect((await api.saveDraft(first.id,1,{front:'Now allowed'})).record.status).toBe('saved');
 });
 it('uses filter-bound exact-total keyset pages beyond fifty rows',async()=>{
  const api=createDemoProposalDraftApi();
  for(let i=0;i<57;i++)await api.createDraft({...value,payload:{front:'Q '+i}});
  const ids:string[]=[];let cursor:string|null=null;
  for(let i=0;i<4;i++){
   const p=await api.listDrafts({limit:17,cursor});
   expect(p.total).toBe(57);
   ids.push(...p.items.map(x=>x.id));
   cursor=p.nextCursor;if(!cursor)break;
   await expect(api.listDrafts({cursor,status:['submitted']}))
    .rejects.toMatchObject({code:'invalid'});
  }
  expect(ids).toHaveLength(57);expect(new Set(ids).size).toBe(57);
  await expect(api.listDrafts({limit:51})).rejects.toMatchObject({code:'invalid'});
 });
 it('refuses forged owner/approval fields and corrupt storage',async()=>{
  const a=createDemoProposalDraftApi();
  await expect(a.createDraft({...value,payload:{front:'Q',user_id:'other'}}))
   .rejects.toMatchObject({code:'invalid'});
  sessionStorage.setItem('lemma.v6.demo.proposal-drafts.v1','{not JSON');
  expect((await createDemoProposalDraftApi().listDrafts()).total).toBe(0);
 });
});
