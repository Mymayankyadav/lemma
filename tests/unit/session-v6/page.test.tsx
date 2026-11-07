import {beforeEach,describe,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Route,Routes} from 'react-router';
import type {SessionDetail,SessionEvent} from '../../../src/data/types';
import V6Session,{orderedSessionEvents,sessionActions} from '../../../src/features/session/v6/V6Session';

const mocks=vi.hoisted(()=>({
 session:{isPending:false,isError:false,data:null as SessionDetail|null,refetch:vi.fn()},
 project:{data:null as {project:{title:string}}|null},
 settings:{data:{preferredChat:'claude' as const}},
}));
vi.mock('../../../src/data/hooks',()=>({
 useSession:()=>mocks.session,useProject:()=>mocks.project,useSettings:()=>mocks.settings,
}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>vi.fn()}));
vi.mock('../../../src/ui/FastTex',()=>({FastTex:({source}:{source:string})=><span>{source}</span>}));
function event(id:number,createdAt:string,kind:SessionEvent['kind']='note'):SessionEvent{
 return {id,kind,createdAt,body:'Event '+id,outcome:id===2?'partial':null,hintLevel:null,checkpointCode:id===2?'C1':null};
}
function detail():SessionDetail{
 return {
  summary:{id:'one',projectSlug:'demo',number:3,goal:'Understand groups',checkpointCode:'C1',
   client:'claude',display:'paused',goalMet:null,startedAt:'2026-11-01T10:00:00Z',
   lastActivityAt:'2026-11-01T10:10:00Z',minutes:10},
  styleName:'Socratic',summaryText:'We explored the theorem',resumeQuestion:'What is closure?',
  resumeStep:2,pages:'12',events:[event(2,'2026-11-01T10:02:00Z','evidence'),event(1,'2026-11-01T10:01:00Z')],
  misconceptions:[],cards:[],pendingProposals:{cards:0,planChanges:0},
 };
}
function render(path='/s/demo/3'){
 const node=document.createElement('div');document.body.appendChild(node);
 const root=createRoot(node);
 act(()=>root.render(<MemoryRouter initialEntries={[path]}><Routes>
  <Route path="/s/:slug/:n" element={<V6Session/>}/>
 </Routes></MemoryRouter>));
 return {node,dispose:()=>act(()=>root.unmount())};
}
describe('v6 session page',()=>{
 beforeEach(()=>{document.body.replaceChildren();mocks.session.isPending=false;mocks.session.isError=false;
  mocks.session.data=detail();mocks.project.data={project:{title:'Algebra'}};mocks.session.refetch.mockReset();});
 it('preserves chronological order and tied event ids without mutating inputs',()=>{
  const input=[event(4,'2026-11-01T10:01:00Z'),event(1,'2026-11-01T10:01:00Z'),event(2,'2026-11-01T10:00:00Z')];
  expect(orderedSessionEvents(input).map(e=>e.id)).toEqual([2,1,4]);
  expect(input.map(e=>e.id)).toEqual([4,1,2]);
 });
 it('renders saved summary, resume question, note, outcome, time and checkpoint link',()=>{
  const {node}=render();
  const text=node.textContent??'';
  expect(text).toContain('Understand groups');expect(text).toContain('10 minutes');
  expect(text).toContain('What is closure?');expect(text).toContain('Event 1');
  expect(text).toContain('Event 2');expect(text).toContain('partial');
  expect(text).toContain('Source pages: 12');
  expect(node.querySelector('a[href="/p/demo/cp/C1"]')).toBeTruthy();
  expect(text.indexOf('Event 1')).toBeLessThan(text.indexOf('Event 2'));
  expect(text).toContain('Resume with tutor');expect(text).toContain('End with tutor');
 });
 it('does not offer ending an already ended session',()=>{
  const saved=detail();saved.summary.display='ended';mocks.session.data=saved;
  expect(sessionActions(saved)).toEqual({resume:false,end:false});
  const {node}=render();
  expect(node.textContent).toContain('Start another study session');
  expect(node.textContent).not.toContain('End with tutor');
 });
 it('renders note and outcome without fabricating missing fields',()=>{
  const saved=detail();saved.events=[];saved.resumeQuestion=null;saved.summary.minutes=null;mocks.session.data=saved;
  const {node}=render();
  expect(node.textContent).toContain('No tutor events recorded');
  expect(node.textContent).toContain('No resume question recorded');
  expect(node.textContent).toContain('Study time not yet recorded');
 });
 it('pages long event histories without losing chronology or evidence',()=>{
  const saved=detail();
  saved.events=Array.from({length:120},(_,index)=>event(index+1,new Date(Date.UTC(2026,10,1,10,index)).toISOString()));
  mocks.session.data=saved;
  const {node}=render();
  expect(node.textContent).toContain('Show 50 more events');
  expect(node.textContent).not.toContain('Event 120');
  const more=Array.from(node.querySelectorAll('button')).find(button=>button.textContent?.includes('Show 50 more'));
  expect(more).toBeTruthy();
  act(()=>more!.click());
  expect(node.textContent).toContain('Event 100');
  expect(node.textContent).not.toContain('Event 120');
  const again=Array.from(node.querySelectorAll('button')).find(button=>button.textContent?.includes('Show 50 more'));
  act(()=>again!.click());
  expect(node.textContent).toContain('Event 120');
 });
 it('distinguishes loading and failure states',()=>{
  mocks.session.isPending=true;
  expect(render().node.textContent).toContain('Loading tutor session');
  mocks.session.isPending=false;mocks.session.isError=true;
  expect(render().node.textContent).toContain('Session unavailable');
 });
});
