import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter,Route,Routes} from 'react-router';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Proposal} from '../../../src/data/types';
import type {ProposalDraftRecord,ProposalDraftApi} from '../../../src/data/proposal-drafts/contract';
import {ProposalDraftError} from '../../../src/data/proposal-drafts/contract';
import PlanProposalV6 from '../../../src/features/plan-proposal/v6/PlanProposalV6';

const mocks=vi.hoisted(()=>({
 proposal:vi.fn(),project:vi.fn(),approve:vi.fn(),reject:vi.fn(),draftApi:vi.fn(),
}));
vi.mock('../../../src/data/hooks',()=>({
 useProposal:mocks.proposal,useProject:mocks.project,
 useApproveProposal:mocks.approve,useRejectProposal:mocks.reject,
}));
vi.mock('../../../src/data/proposal-drafts',()=>({getProposalDraftApi:mocks.draftApi}));
const proposal:Proposal={
 id:'11111111-1111-4111-8111-111111111111',kind:'plan_change',projectSlug:'proofs',
 projectGlyph:'sum',sessionNumber:null,origin:'chatgpt',reason:'Clarify the exercise',
 createdAt:'2026-11-08T00:00:00Z',card:null,cardEdit:null,plan:null,
 planChange:{ops:[{op:'add',code:'CP2',title:'New step',objective:'Learn',
  criterion:'Explain',steps:['Check'],source:'Book',pages:'18'}]},
};
const existing:ProposalDraftRecord={
 id:'22222222-2222-4222-8222-222222222222',proposalId:proposal.id,
 targetId:'33333333-3333-4333-8333-333333333333',
 status:'saved',draftVersion:3,baseVersions:{proposal:7,target:12},
 payload:{ops:[{op:'update',code:'CP1',title:'Older draft'}]},
 createdAt:'2026-11-08T00:00:00Z',editedAt:'2026-11-08T01:00:00Z',
};
let host:HTMLDivElement,root:Root,adapter:ProposalDraftApi;
let saved:ReturnType<typeof vi.fn>,submitted:ReturnType<typeof vi.fn>;
async function render(){
 await act(async()=>root.render(<MemoryRouter initialEntries={['/proposals/'+proposal.id]}>
  <Routes><Route path="/proposals/:id" element={<PlanProposalV6/>}/></Routes>
 </MemoryRouter>));
}
async function click(name:string){
 const b=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===name);
 expect(b,'Missing button: '+name).toBeDefined();
 await act(async()=>b!.click());
}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 mocks.proposal.mockReturnValue({data:proposal,isPending:false,isError:false,refetch:vi.fn()});
 mocks.project.mockReturnValue({data:{checkpoints:[{
  id:'c1',code:'CP1',title:'Original step',ui:'now',position:1,stage:'Foundations',
  currentStep:0,stepsTotal:1,recheckDue:null,dueCards:0,
 }]},isPending:false,isError:false,refetch:vi.fn()});
 mocks.approve.mockReturnValue({isPending:false,mutateAsync:vi.fn(async()=>({}))});
 mocks.reject.mockReturnValue({isPending:false,mutateAsync:vi.fn(async()=>({}))});
 saved=vi.fn(async(_,version:number,payload:Record<string,unknown>)=>({
  record:{...existing,payload,draftVersion:version+1},actionNo:31,
 }));
 submitted=vi.fn(async(_,version:number)=>({
  record:{...existing,status:'submitted',draftVersion:version+1},actionNo:32,
 }));
 adapter={mode:'demo',listDrafts:vi.fn(async()=>({items:[existing],total:1,nextCursor:null})),
  getDraft:vi.fn(async()=>existing),createDraft:vi.fn(),saveDraft:saved,submitDraft:submitted,
  discardDraft:vi.fn()};
 mocks.draftApi.mockReturnValue(adapter);
});
afterEach(async()=>{
 await act(async()=>root.unmount());
 host.remove();vi.clearAllMocks();
});
describe('N85 v6 proposal draft editor',()=>{
 it('shows real before/after, citations and an existing versioned draft',async()=>{
  await render();
  await vi.waitFor(()=>expect(host.textContent).toContain('Older draft'));
  expect(host.querySelector('[aria-label="Before targets"]')?.textContent).toContain('Original step');
  expect(host.querySelector('[aria-label="After targets"]')?.textContent).toContain('New step');
  expect(host.querySelector('[aria-label="Source citations"]')?.textContent).toContain('Book pp. 18');
  expect(host.textContent).toContain('Clarify the exercise');
  expect(adapter.listDrafts).toHaveBeenCalledWith({
   proposalId:proposal.id,status:['draft','saved'],limit:50,cursor:null,
  });
 });
 it('saves a complete owner draft with exact expectedVersion and submits separately from approval',async()=>{
  await render();
  await vi.waitFor(()=>expect(host.textContent).toContain('Older draft'));
  await click('Edit draft');
  const editor=host.querySelector<HTMLTextAreaElement>('[aria-label="Full draft payload"]')!;
  await act(async()=>{
   const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!;
   setter.call(editor,JSON.stringify({ops:[{op:'update',code:'CP1',title:'Revised safely'}]}));
   editor.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await click('Save draft');
  await vi.waitFor(()=>expect(saved).toHaveBeenCalledTimes(1));
  expect(saved.mock.calls[0][0]).toBe(existing.id);
  expect(saved.mock.calls[0][1]).toBe(3);
  expect(saved.mock.calls[0][2]).toHaveProperty('ops');
  await click('Submit draft');
  await vi.waitFor(()=>expect(submitted).toHaveBeenCalledTimes(1));
  expect(submitted.mock.calls[0][0]).toBe(existing.id);
  expect(submitted.mock.calls[0][1]).toBe(4);
  expect(submitted.mock.calls[0][2]).toEqual({proposal:7,target:12});
  expect(mocks.approve.mock.results[0].value.mutateAsync).not.toHaveBeenCalled();
 });
 it('shows the current, base and attempted payload on an optimistic conflict',async()=>{
  const conflict={kind:'draft_version' as const,current:{...existing,draftVersion:4},
   baseVersions:existing.baseVersions,attemptedPayload:{ops:[{op:'update',code:'CP1',title:'Attempted'}]}};
  saved.mockRejectedValueOnce(new ProposalDraftError('conflict','Outdated draft',conflict));
  await render();await vi.waitFor(()=>expect(host.textContent).toContain('Older draft'));
  await click('Edit draft');await click('Save draft');
  await vi.waitFor(()=>expect(host.querySelector('[aria-label="Draft conflict"]')).not.toBeNull());
  expect(host.textContent).toContain('Current');
  expect(host.textContent).toContain('Your draft');
  expect(host.textContent).toContain('Base versions: proposal 7, target 12');
 });
 it('does not invent a new draft version when no safe versioned owner source read exists',async()=>{
  (adapter.listDrafts as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
   items:[],total:0,nextCursor:null,
  });
  await render();
  await vi.waitFor(()=>expect(host.textContent).toContain('No saved draft exists'));
  expect(host.textContent).toContain('No version or ownership is guessed');
  expect(adapter.createDraft).not.toHaveBeenCalled();
  expect(host.querySelector('[aria-label="Before targets"]')).not.toBeNull();
 });
 it('makes a submitted draft read-only without automatically approving the proposal',async()=>{
  await render();await vi.waitFor(()=>expect(host.textContent).toContain('Older draft'));
  await click('Submit draft');
  await vi.waitFor(()=>expect(host.textContent).toContain('Draft submitted'));
  const edit=[...host.querySelectorAll('button')].find(x=>x.textContent?.trim()==='Edit draft');
  expect(edit?.disabled).toBe(true);
  expect(host.textContent).toContain('submission is not plan approval');
  expect(mocks.approve.mock.results[0].value.mutateAsync).not.toHaveBeenCalled();
 });
 it('shows authoritative current source versions on an optimistic conflict',async()=>{
  const details={kind:'source_version' as const,current:existing,
   baseVersions:existing.baseVersions,attemptedPayload:existing.payload,
   currentSourceVersions:{proposal:9,target:13}};
  saved.mockRejectedValueOnce(new ProposalDraftError('conflict','Source changed',details));
  await render();await vi.waitFor(()=>expect(host.textContent).toContain('Older draft'));
  await click('Edit draft');await click('Save draft');
  await vi.waitFor(()=>expect(host.querySelector('[data-current-source-versions]')).not.toBeNull());
  expect(host.querySelector('[data-current-source-versions]')?.textContent).toContain('proposal 9');
  expect(host.querySelector('[data-current-source-versions]')?.textContent).toContain('target 13');
  expect(host.textContent).toContain('Older draft');
 });
 it('blocks an approve/reject decision during an unsaved edit',async()=>{
  await render();await vi.waitFor(()=>expect(host.textContent).toContain('Older draft'));
  await click('Edit draft');
  for(const name of ['Approve plan','Reject proposal']){
   const button=[...host.querySelectorAll('button')].find(x=>x.textContent?.trim()===name);
   expect(button?.disabled).toBe(true);
  }
  expect(host.textContent).toContain('Save or cancel your draft edit');
 });
});
