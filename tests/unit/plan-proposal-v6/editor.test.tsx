import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {Link,MemoryRouter,Route,Routes} from 'react-router';
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
 it('does not approve or reject without a reliable current owner plan preview',async()=>{
  mocks.project.mockReturnValue({data:undefined,isPending:false,isError:true,refetch:vi.fn()});
  await render();
  for(const label of ['Approve plan','Reject proposal']){
   const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===label);
   expect(button?.disabled).toBe(true);
   await act(async()=>button?.click());
  }
  expect(mocks.approve.mock.results[0].value.mutateAsync).not.toHaveBeenCalled();
  expect(mocks.reject.mock.results[0].value.mutateAsync).not.toHaveBeenCalled();
  mocks.project.mockReturnValue({data:{checkpoints:[]},
   isPending:false,isError:false,refetch:vi.fn()});
  await render();
  for(const label of ['Approve plan','Reject proposal'])
   expect([...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===label)?.disabled).toBe(false);
 });
 it('never labels an unloaded or failed project as an empty approved plan',async()=>{
  mocks.project.mockReturnValue({data:undefined,isPending:true,isError:false,refetch:vi.fn()});
  await render();
  expect(host.textContent).toContain('Loading current plan');
  expect(host.querySelector('[aria-label="Before targets"]')).toBeNull();
  expect(host.textContent).not.toContain('No approved checkpoints yet');
  mocks.project.mockReturnValue({data:undefined,isPending:false,isError:true,refetch:vi.fn()});
  await render();
  expect(host.textContent).toContain('Current plan unavailable');
  expect(host.querySelector('[aria-label="Before targets"]')).toBeNull();
  mocks.project.mockReturnValue({data:{checkpoints:[]},
   isPending:false,isError:false,refetch:vi.fn()});
  await render();
  expect(host.querySelector('[aria-label="Before targets"]')).not.toBeNull();
  expect(host.textContent).toContain('No approved checkpoints yet');
 });
 it('shows real before/after, citations and an existing versioned draft',async()=>{
  await render();
  await vi.waitFor(()=>expect(host.textContent).toContain('Older draft'));
  expect(host.querySelector('[aria-label="Before targets"]')?.textContent).toContain('Original step');
  expect(host.querySelector('[aria-label="After targets"]')?.textContent).toContain('New step');
  expect(host.querySelector('[aria-label="Source citations"]')?.textContent).toContain('Book pp. 18');
  expect(host.textContent).toContain('Clarify the exercise');
  expect(adapter.listDrafts).toHaveBeenCalledWith({
   proposalId:proposal.id,status:['draft','saved','submitted'],limit:50,cursor:null,
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
 it('clears a previous proposal editor when the router switches to another proposal',async()=>{
  const secondId='55555555-5555-4555-8555-555555555555';
  const secondProposal={...proposal,id:secondId};
  mocks.proposal.mockImplementation((id:string)=>({
   data:id===secondId?secondProposal:proposal,
   isPending:false,isError:false,refetch:vi.fn(),
  }));
  vi.mocked(adapter.listDrafts).mockImplementation(async args=>({
   items:[{...existing,proposalId:args.proposalId}],
   total:1,nextCursor:null,
  }));
  await act(async()=>root.render(<MemoryRouter initialEntries={['/proposals/'+proposal.id]}>
   <Link to={'/proposals/'+secondId}>Open second proposal</Link>
   <Routes><Route path="/proposals/:id" element={<PlanProposalV6/>}/></Routes>
  </MemoryRouter>));
  await vi.waitFor(()=>expect(host.textContent).toContain('Older draft'));
  await click('Edit draft');
  expect(host.querySelector('[aria-label="Full draft payload"]')).not.toBeNull();
  const nav=host.querySelector<HTMLAnchorElement>('a')!;
  await act(async()=>nav.click());
  await vi.waitFor(()=>expect(adapter.listDrafts).toHaveBeenCalledWith(
   expect.objectContaining({proposalId:secondId})));
  expect(host.querySelector('[aria-label="Full draft payload"]')).toBeNull();
  const approve=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Approve plan');
  expect(approve?.disabled).toBe(false);
 });
 it('does not discard unsaved draft edits on a background proposal query refresh',async()=>{
  await render();
  await vi.waitFor(()=>expect(host.textContent).toContain('Older draft'));
  await click('Edit draft');
  const textarea=host.querySelector<HTMLTextAreaElement>('[aria-label="Full draft payload"]')!;
  const replacement='{"ops":[{"op":"update","code":"CP1","title":"Unsaved typing"}]}';
  await act(async()=>{
   const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!;
   setter.call(textarea,replacement);
   textarea.dispatchEvent(new Event('input',{bubbles:true}));
  });
  const calls=vi.mocked(adapter.listDrafts).mock.calls.length;
  mocks.proposal.mockReturnValue({data:{...proposal,reason:'Refreshed proposal'},
   isPending:false,isError:false,refetch:vi.fn()});
  await act(async()=>root.render(<MemoryRouter initialEntries={['/proposals/'+proposal.id]}>
   <Routes><Route path="/proposals/:id" element={<PlanProposalV6/>}/></Routes>
  </MemoryRouter>));
  expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Full draft payload"]')?.value)
   .toBe(replacement);
  expect(vi.mocked(adapter.listDrafts).mock.calls.length).toBe(calls);
 });
 it('restarts a cancelled draft fetch when proposal data refreshes mid-request',async()=>{
  let finishOld:(page:unknown)=>void=()=>{};
  vi.mocked(adapter.listDrafts).mockImplementationOnce(()=>new Promise(resolve=>{
   finishOld=resolve as (page:unknown)=>void;
  }));
  await render();
  expect(host.textContent).toContain('Loading drafts');
  mocks.proposal.mockReturnValue({data:{...proposal,reason:'Background fetch'},
   isPending:false,isError:false,refetch:vi.fn()});
  await act(async()=>root.render(<MemoryRouter initialEntries={['/proposals/'+proposal.id]}>
   <Routes><Route path="/proposals/:id" element={<PlanProposalV6/>}/></Routes>
  </MemoryRouter>));
  await vi.waitFor(()=>expect(vi.mocked(adapter.listDrafts)).toHaveBeenCalledTimes(2));
  await vi.waitFor(()=>expect(host.textContent).toContain('Older draft'));
  await act(async()=>finishOld({items:[],total:0,nextCursor:null}));
  expect(host.textContent).toContain('Older draft');
  expect(host.textContent).not.toContain('No saved draft exists');
 });
 it('reloads the original proposal after navigating away and back during a pending draft read',async()=>{
  const secondId='77777777-7777-4777-8777-777777777777';
  const other={...proposal,id:secondId};
  mocks.proposal.mockImplementation((id:string)=>({
   data:id===secondId?other:proposal,isPending:false,isError:false,refetch:vi.fn(),
  }));
  let settleOther:(page:unknown)=>void=()=>{};
  vi.mocked(adapter.listDrafts).mockImplementation(async args=>{
   if(args.proposalId!==secondId)
    return {items:[existing],total:1,nextCursor:null};
   return new Promise(resolve=>{settleOther=resolve as (page:unknown)=>void});
  });
  await act(async()=>root.render(<MemoryRouter initialEntries={['/proposals/'+proposal.id]}>
   <Link to={'/proposals/'+secondId}>Go to other</Link>
   <Link to={'/proposals/'+proposal.id}>Back to first</Link>
   <Routes><Route path="/proposals/:id" element={<PlanProposalV6/>}/></Routes>
  </MemoryRouter>));
  await vi.waitFor(()=>expect(host.textContent).toContain('Older draft'));
  await act(async()=>host.querySelectorAll<HTMLAnchorElement>('a')[0].click());
  await vi.waitFor(()=>expect(adapter.listDrafts).toHaveBeenCalledWith(
   expect.objectContaining({proposalId:secondId})));
  await act(async()=>host.querySelectorAll<HTMLAnchorElement>('a')[1].click());
  await vi.waitFor(()=>expect(host.textContent).toContain('Older draft'));
  expect(vi.mocked(adapter.listDrafts).mock.calls.filter(c=>
   c[0].proposalId===proposal.id)).toHaveLength(2);
  await act(async()=>settleOther({items:[],total:0,nextCursor:null}));
  expect(host.textContent).toContain('Older draft');
 });
 it('ignores an old proposal save acknowledgement after navigating to another proposal',async()=>{
  const secondId='66666666-6666-4666-8666-666666666666';
  const secondProposal={...proposal,id:secondId};
  mocks.proposal.mockImplementation((id:string)=>({
   data:id===secondId?secondProposal:proposal,isPending:false,isError:false,refetch:vi.fn(),
  }));
  vi.mocked(adapter.listDrafts).mockImplementation(async args=>({
   items:[{...existing,proposalId:args.proposalId}],
   total:1,nextCursor:null,
  }));
  let finishSave:(result:unknown)=>void=()=>{};
  vi.mocked(adapter.saveDraft).mockImplementation(()=>new Promise(resolve=>{
   finishSave=resolve as (result:unknown)=>void;
  }));
  await act(async()=>root.render(<MemoryRouter initialEntries={['/proposals/'+proposal.id]}>
   <Link to={'/proposals/'+secondId}>Other proposal</Link>
   <Routes><Route path="/proposals/:id" element={<PlanProposalV6/>}/></Routes>
  </MemoryRouter>));
  await vi.waitFor(()=>expect(host.textContent).toContain('Older draft'));
  await click('Edit draft');
  await click('Save draft');
  const cancel=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Cancel edit');
  expect(cancel?.disabled).toBe(true);
  await act(async()=>host.querySelector<HTMLAnchorElement>('a')!.click());
  await vi.waitFor(()=>expect(adapter.listDrafts).toHaveBeenCalledWith(
   expect.objectContaining({proposalId:secondId})));
  await act(async()=>finishSave({record:{
   ...existing,payload:{ops:[{op:'update',code:'CP1',title:'Stale save response'}]},
  },actionNo:40}));
  expect(host.textContent).not.toContain('Stale save response');
  const approve=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Approve plan');
  expect(approve?.disabled).toBe(false);
 });
 it('keeps an immutable submitted draft visible after reload and prefers a newer editable draft',async()=>{
  const submittedRow:ProposalDraftRecord={...existing,id:'44444444-4444-4444-8444-444444444444',
   status:'submitted',editedAt:'2026-11-08T03:00:00Z'};
  vi.mocked(adapter.listDrafts).mockResolvedValue({
   items:[submittedRow,existing],total:2,nextCursor:null,
  });
  await render();
  await vi.waitFor(()=>expect(host.textContent).toContain('Older draft'));
  expect(host.textContent).toContain('Draft saved');
  expect(host.textContent).not.toContain('Draft submitted.');
  vi.mocked(adapter.listDrafts).mockResolvedValue({
   items:[submittedRow],total:1,nextCursor:null,
  });
  // No network error; remount the route to exercise persisted query history.
  await act(async()=>root.render(<MemoryRouter initialEntries={['/proposals/'+proposal.id]}>
   <Routes><Route path="/proposals/:id" element={<PlanProposalV6 key="reload"/>}/></Routes>
  </MemoryRouter>));
  await vi.waitFor(()=>expect(host.textContent).toContain('Draft submitted.'));
  const edit=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Edit draft');
  expect(edit?.disabled).toBe(true);
  expect(adapter.createDraft).not.toHaveBeenCalled();
 });
});
