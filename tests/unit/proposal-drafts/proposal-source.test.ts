import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createLiveProposalDraftApi} from '../../../src/data/proposal-drafts/live';
import {createDemoProposalDraftApi,DEMO_DRAFT_SOURCE,
 setDemoDraftSourceVersionsForTests} from '../../../src/data/proposal-drafts/demo';
const {getClient}=vi.hoisted(()=>({getClient:vi.fn()}));
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>getClient()}));
const P=DEMO_DRAFT_SOURCE.proposalId,T=DEMO_DRAFT_SOURCE.targetId;
function db(input:{kind?:string;status?:string;projectId?:string|null;
 proposalVersion?:number;targetVersion?:number;missing?:boolean}={}){
 const calls:Array<{table:string;field:string;id:string}>=[];
 const from=vi.fn((table:string)=>{
  const q={
   select:(_fields:string)=>q,
   eq:(field:string,id:string)=>{calls.push({table,field,id});return q},
   maybeSingle:async()=>({data:table==='proposals'?{
    id:P,kind:input.kind??'plan_change',status:input.status??'pending',
    project_id:input.projectId===undefined?T:input.projectId,
    version:input.proposalVersion??7,withdrawn_at:null,
   }:input.missing?null:{id:T,version:input.targetVersion??12},error:null}),
  };
  return q;
 });
 return {from,calls};
}
beforeEach(()=>{getClient.mockReset();sessionStorage.clear()});
describe('N85 owner source for first proposal draft',()=>{
 it('reads real proposal/project versions with RLS and no caller owner identity',async()=>{
  const fixture=db();getClient.mockReturnValue(fixture);
  expect(await createLiveProposalDraftApi().getSource(P)).toEqual({
   proposalId:P,targetId:T,baseVersions:{proposal:7,target:12},
  });
  expect(fixture.calls).toEqual([{table:'proposals',field:'id',id:P},
   {table:'projects',field:'id',id:T}]);
  expect(fixture.from).toHaveBeenCalledTimes(2);
 });
 it('returns null for noneditable, missing or non-plan proposals without a fabricated source',async()=>{
  for(const options of [{kind:'card'},{status:'approved'},{projectId:null},{missing:true}]){
   const fixture=db(options);getClient.mockReturnValue(fixture);
   expect(await createLiveProposalDraftApi().getSource(P)).toBeNull();
  }
  await expect(createLiveProposalDraftApi().getSource('not-a-uuid'))
   .rejects.toMatchObject({code:'invalid'});
 });
 it('demo uses only its real fixture and latest saved source versions',async()=>{
  const api=createDemoProposalDraftApi();
  expect(await api.getSource(P)).toEqual(DEMO_DRAFT_SOURCE);
  setDemoDraftSourceVersionsForTests(P,T,{proposal:4,target:9});
  expect(await api.getSource(P)).toEqual({
   proposalId:P,targetId:T,baseVersions:{proposal:4,target:9},
  });
  expect(await api.getSource('44444444-4444-4444-8444-444444444444')).toBeNull();
 });
});
