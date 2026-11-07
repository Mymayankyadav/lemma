import {beforeEach,describe,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Route,Routes} from 'react-router';
import type {CheckpointDetail,CheckpointView} from '../../../src/data/types';
import V6Checkpoint,{prerequisiteState,sessionsForCheckpoint} from '../../../src/features/checkpoint/v6/V6Checkpoint';

const mocks=vi.hoisted(()=>({
 checkpoint:{isPending:false,isError:false,data:null as CheckpointDetail|null,refetch:vi.fn()},
 project:{data:null as {checkpoints:CheckpointView[];project:{title:string}}|null},
 settings:{data:{preferredChat:'claude' as const}},
}));
vi.mock('../../../src/data/hooks',()=>({
 useCheckpoint:()=>mocks.checkpoint,useProject:()=>mocks.project,useSettings:()=>mocks.settings,
}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>vi.fn()}));
vi.mock('../../../src/ui/FastTex',()=>({FastTex:({source}:{source:string})=><span>{source}</span>}));

const makeView=(code:string,ui:CheckpointView['ui']='now'):CheckpointView=>({
 id:code,code,title:'Proof '+code,position:0,ui,currentStep:0,stepsTotal:2,
 recheckDue:null,dueCards:0,
});
function makeDetail():CheckpointDetail{
 return {view:makeView('C2'),objective:'Prove the theorem',criterion:'A complete proof',
  steps:['Check assumptions','Show conclusion'],pages:'12–13',sourceShort:'Algebra',
  prereqs:['C1','C0'],concepts:[{slug:'groups',name:'Groups'}],recheckPrompt:'Explain the key idea',
  events:[{id:1,kind:'evidence',body:'Worked example',outcome:'demonstrated',hintLevel:null,checkpointCode:'C2',createdAt:'2026-11-01T12:00:00Z'}],
  cardsCount:3,sessions:[
   {id:'s2',projectSlug:'demo',number:2,goal:'C2 proof',checkpointCode:'C2',client:'claude',display:'ended',goalMet:'yes',startedAt:'2026-11-01T12:00:00Z',lastActivityAt:'2026-11-01T12:30:00Z',minutes:30},
   {id:'s1',projectSlug:'demo',number:1,goal:'Other',checkpointCode:'C1',client:'claude',display:'ended',goalMet:'no',startedAt:'2026-10-31T12:00:00Z',lastActivityAt:'2026-10-31T12:30:00Z',minutes:30},
  ]};
}
function render(){
 const node=document.createElement('div');
 document.body.appendChild(node);
 const mounted=createRoot(node);
 act(()=>mounted.render(<MemoryRouter initialEntries={['/p/demo/cp/C2']}><Routes>
  <Route path="/p/:slug/cp/:code" element={<V6Checkpoint/>}/>
 </Routes></MemoryRouter>));
 return {node,dispose:()=>act(()=>mounted.unmount())};
}
describe('v6 checkpoint',()=>{
 beforeEach(()=>{
  document.body.replaceChildren();
  mocks.checkpoint.isPending=false;mocks.checkpoint.isError=false;
  mocks.checkpoint.data=makeDetail();mocks.project.data={
   project:{title:'Algebra path'},checkpoints:[makeView('C1','done'),makeView('C2')]};
  mocks.checkpoint.refetch.mockReset();
 });
 it('keeps prerequisite state honest and exposes unknown records',()=>{
  expect(prerequisiteState('C1',mocks.project.data!.checkpoints)).toBe('Demonstrated');
  expect(prerequisiteState('C0',mocks.project.data!.checkpoints)).toBe('Status unavailable');
 });
 it('never links unrelated tutor sessions',()=>{
  expect(sessionsForCheckpoint(makeDetail()).map(s=>s.number)).toEqual([2]);
 });
 it('shows criteria, steps, source, evidence, prerequisite states, recheck and session',()=>{
  const {node}=render();
  expect(node.textContent).toContain('A complete proof');
  expect(node.textContent).toContain('Check assumptions');
  expect(node.textContent).toContain('Algebra · p. 12–13');
  expect(node.textContent).toContain('Demonstrated');
  expect(node.textContent).toContain('Status unavailable');
  expect(node.textContent).toContain('Worked example');
  expect(node.textContent).toContain('Explain the key idea');
  expect(node.querySelector('a[href="/s/demo/2"]')).toBeTruthy();
  expect(node.querySelector('a[href="/s/demo/1"]')).toBeNull();
 });
 it('keeps proposed checkpoints in the approval flow',()=>{
  mocks.checkpoint.data={...makeDetail(),view:makeView('C2','proposed')};
  const {node}=render();
  expect(node.textContent).toContain('Review proposed checkpoint');
  expect(node.textContent).not.toContain('Demonstrate');
 });
 it('shows recheck and reopen only for appropriate checkpoint states',()=>{
  mocks.checkpoint.data={...makeDetail(),view:makeView('C2','done')};
  const {node}=render();
  expect(node.textContent).toContain('Reopen');
  expect(node.textContent).toContain('Recheck');
  expect(node.textContent).not.toContain('Defer');
 });
 it('distinguishes loading and failed reads without invented content',()=>{
  mocks.checkpoint.isPending=true;
  const pending=render().node;
  expect(pending.textContent).toContain('Loading checkpoint');
  expect(pending.textContent).not.toContain('A complete proof');
  mocks.checkpoint.isPending=false;mocks.checkpoint.isError=true;
  const failed=render().node;
  expect(failed.textContent).toContain('Checkpoint unavailable');
  expect(failed.textContent).toContain('Try again');
 });
});
