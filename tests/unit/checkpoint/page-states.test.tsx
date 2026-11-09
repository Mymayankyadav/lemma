import {beforeEach,describe,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Route,Routes} from 'react-router';
import Page from '../../../src/features/checkpoint/Page';

// N102: v6Shell defaults on; this suite covers the legacy (flag-off) screen.
beforeEach(()=>{window.history.replaceState(null,'','/?flags=-v6Shell');});

const mocks=vi.hoisted(()=>({
 checkpoint:{isPending:true,error:null as Error|null,data:null as any,refetch:vi.fn()},
 project:{data:null as any},
}));
vi.mock('../../../src/data/hooks',()=>({
 useCheckpoint:()=>mocks.checkpoint,
 useProject:()=>mocks.project,
 useSettings:()=>({data:null}),
 useInsightData:()=>({data:null}),
}));
vi.mock('../../../src/features/project/Page',()=>({default:()=>null}));
vi.mock('../../../src/ui/Sheet',()=>({Sheet:({children,title}:any)=><div><h2>{title}</h2>{children}</div>}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>vi.fn()}));

function show(){
 const container=document.createElement('div');
 document.body.appendChild(container);
 const root=createRoot(container);
 act(()=>root.render(<MemoryRouter initialEntries={['/p/demo/cp/CP1']}>
  <Routes><Route path="/p/:slug/cp/:code" element={<Page/>}/></Routes>
 </MemoryRouter>));
 return {container};
}
const screen={
 getByText:(text:string)=>{const node=Array.from(document.body.querySelectorAll('*')).find(el=>el.textContent===text && !Array.from(el.children).some(child=>child.textContent===text));if(!node)throw new Error('Missing text: '+text);return node;},
 queryByText:(text:string)=>Array.from(document.body.querySelectorAll('*')).find(el=>el.textContent===text && !Array.from(el.children).some(child=>child.textContent===text))??null,
};
function detail(ui:'now'|'locked'|'proposed'){
 return {
  view:{code:'CP1',title:'Checkpoint fixture',ui,currentStep:0,stage:null},
  objective:'Explain the proof',criterion:'Give evidence',steps:['Read definition'],
  prereqs:[],concepts:[],events:[],sessions:[],cardsCount:0,
  pages:null,sourceShort:null,recheckPrompt:null,
 };
}
describe('Checkpoint page states',()=>{
 beforeEach(()=>{
  mocks.checkpoint.isPending=false;
  mocks.checkpoint.error=null;
  mocks.checkpoint.data=null;
  mocks.project.data=null;
  mocks.checkpoint.refetch.mockReset();
  document.body.replaceChildren();
 });
 it('renders a loading skeleton instead of evidence',()=>{
  mocks.checkpoint.isPending=true;
  vi.useFakeTimers();
  try {
   const {container}=show();
   act(()=>{vi.advanceTimersByTime(301)});
   expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBe(3);
  } finally {
   vi.useRealTimers();
  }
  expect(screen.queryByText('Evidence required')).toBeNull();
 });
 it('shows the not-found fallback',()=>{
  show();
  expect(screen.getByText('Checkpoint unavailable')).toBeTruthy();
  expect(screen.getByText('Try again')).toBeTruthy();
 });
 it('shows empty steps without inventing a step',()=>{
  mocks.checkpoint.data={...detail('now'),steps:[]};
  show();
  expect(screen.getByText('Evidence required')).toBeTruthy();
  expect(screen.getByText('Steps')).toBeTruthy();
  expect(screen.queryByText('Read definition')).toBeNull();
 });
 it('shows the active checkpoint and study action',()=>{
  mocks.checkpoint.data=detail('now');
  show();
  expect(screen.getByText('In progress')).toBeTruthy();
  expect(screen.getByText('Study this')).toBeTruthy();
 });
 it('shows deferred or locked checkpoint status',()=>{
  mocks.checkpoint.data=detail('locked');
  show();
  expect(screen.getByText('Locked')).toBeTruthy();
  expect(screen.getByText('Evidence required')).toBeTruthy();
 });
});
