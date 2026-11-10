import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import ReviewPage from '../../../src/features/review/Page';
import {useReviewSession} from '../../../src/features/review-run/store';
import {useDeckTree,useHome,useInsightData,useReviewItems,useSettings} from '../../../src/data/hooks';
import {isFlagOn} from '../../../src/flags';
import type {DeckNode,ReviewItem,Settings} from '../../../src/data/types';

vi.mock('../../../src/flags',()=>({isFlagOn:vi.fn(()=>true)}));
vi.mock('../../../src/data/hooks',()=>({
 useDeckTree:vi.fn(),useReviewItems:vi.fn(),useSettings:vi.fn(),
 useHome:vi.fn(),useInsightData:vi.fn(()=>({data:{reviews:[]}})),
 useUpdateSettings:vi.fn(()=>({mutate:vi.fn(),isPending:false})),
}));
const project:DeckNode={key:'project:proofs',label:'Proofs',glyph:'∑',due:5,level:0,children:[
 {key:'cp:proofs:C1',label:'Continuity',glyph:'∑',due:3,level:1,children:[]},
 {key:'cp:proofs:C2',label:'Limits',glyph:'∑',due:2,level:1,children:[]},
]};
const settings={
 newPerDay:20,reviewsPerDay:2,rolloverHour:0,timeZone:'UTC',
 learnAheadMinutes:0,mixDecks:true,
} as Settings;
function card(no:number,checkpoint:'C1'|'C2'):ReviewItem{
 return {
  cardId:'card-'+no,noteId:'note-'+no,noteNo:no,ord:1,type:'basic',
  kind:'definition',front:'Question '+no,back:'Answer '+no,
  projectSlug:'proofs',glyph:'∑',checkpointCode:checkpoint,checkpointTitle:checkpoint,
  sessionNumber:null,sourceShort:null,pageLabel:null,
  state:{state:2,due:'2026-10-01T00:00:00.000Z',stability:2,difficulty:5,
   lastReview:null,step:0,reps:2,lapses:0},
 };
}
const cards=[card(1,'C1'),card(2,'C2'),card(3,'C1')];
type FakeQuery={data?:unknown;isPending:boolean;error:Error|null;refetch:ReturnType<typeof vi.fn>};
const q=(data?:unknown,isPending=false,error:Error|null=null):FakeQuery=>({
 data,isPending,error,refetch:vi.fn(async()=>{}),
});
let host:HTMLDivElement,root:Root,client:QueryClient;
function setData({nodes=[project],items=cards,config=settings,pending=false,error=null}:{
 nodes?:DeckNode[];items?:ReviewItem[];config?:Settings;pending?:boolean;error?:Error|null;
}={}){
 vi.mocked(useDeckTree).mockReturnValue(q(nodes,pending,error) as ReturnType<typeof useDeckTree>);
 vi.mocked(useReviewItems).mockReturnValue(q(items,pending,error) as ReturnType<typeof useReviewItems>);
 vi.mocked(useSettings).mockReturnValue(q(config,pending,error) as ReturnType<typeof useSettings>);
 vi.mocked(useHome).mockReturnValue(q({resume:null}) as ReturnType<typeof useHome>);
 vi.mocked(useInsightData).mockReturnValue(q({reviews:[]}) as ReturnType<typeof useInsightData>);
}
async function render(){
 await act(async()=>{root.render(
  <QueryClientProvider client={client}>
   <MemoryRouter initialEntries={['/review']}>
    <Routes><Route path="/review" element={<ReviewPage/>}/>
     <Route path="/review/run" element={<p>Review round started</p>}/></Routes>
   </MemoryRouter>
  </QueryClientProvider>
 );});
}
async function click(name:string){
 const control=[...host.querySelectorAll('input,button')].find(el=>
  el.getAttribute('aria-label')===name||el.textContent?.trim()===name) as HTMLElement|undefined;
 if(!control)throw Error('Missing control '+name);
 await act(async()=>control.click());
}
const count=(label:string)=>host.querySelector('[aria-label="'+label+'"]')?.textContent??'';
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.mocked(isFlagOn).mockReturnValue(true);
 host=document.createElement('div');document.body.append(host);
 root=createRoot(host);client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 setData();useReviewSession.getState().close();
});
afterEach(async()=>{
 await act(async()=>root.unmount());host.remove();client.clear();
 useReviewSession.getState().close();vi.clearAllMocks();
});
describe('N30.2 v6 Review start and batch handoff',()=>{
 it('shows all-due, selected eligible and exact quota-limited round separately',async()=>{
  await render();
  expect(host.textContent).toContain('due across all decks');
  expect(host.textContent).toContain("in today's batch");
  expect(count('Cards in this round')).toBe('2');
  expect(host.textContent).toContain('Daily review limit: 2');
  expect(host.textContent).toContain('5');
  expect(host.textContent).toContain('3');
  await click('Start 2 cards');
  expect(host.textContent).toContain('Review round started');
  expect(useReviewSession.getState().total).toBe(2);
  expect(useReviewSession.getState().queue).not.toBeNull();
  expect(useReviewSession.getState().filter.decks).toEqual([]);
 });
 it('never adds an unchecked checkpoint to the initialized queue',async()=>{
  await render();
  await click('Include Proofs / Limits');
  expect(count('Cards in this round')).toBe('2');
  await click('Start 2 cards');
  const round=useReviewSession.getState();
  const ids=[round.current,...(round.queue?.learning??[]),...(round.queue?.reviews??[]),...(round.queue?.fresh??[])]
   .filter((item):item is ReviewItem=>!!item).map(item=>item.cardId);
  expect(ids.sort()).toEqual(['card-1','card-3']);
 });
 it('uses native keyboard-operable selectors, complete labels and a disabled empty start',async()=>{
  await render();
  const checkbox=host.querySelector('input[aria-label="Include deck Proofs"]') as HTMLInputElement;
  expect(checkbox?.type).toBe('checkbox');
  checkbox.focus();
  expect(document.activeElement).toBe(checkbox);
  expect(checkbox.closest('label')?.className).toContain('min-h-11');
  await click('Include deck Proofs');
  expect(count('Cards in this round')).toBe('0');
  expect(host.querySelector('button[aria-label="Start 0 cards"]')?.hasAttribute('disabled')).toBe(true);
  expect(host.textContent).toContain('No cards in this selection');
  await click('Include Proofs / Continuity');
  expect(count('Cards in this round')).toBe('2');
 });
 it('distinguishes loading, genuinely empty, filtered-empty and retryable failure',async()=>{
  setData({pending:true});
  await render();
  expect(host.textContent).toContain('Loading review decks');
  setData({nodes:[],items:[]});
  await render();
  expect(host.textContent).toContain('No cards due');
  setData();
  await render();
  const field=host.querySelector('input[aria-label="Search decks"]') as HTMLInputElement;
  await act(async()=>{
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,'Not a deck');
   field.dispatchEvent(new Event('input',{bubbles:true}));
   field.dispatchEvent(new Event('change',{bubbles:true}));
  });
  expect(host.textContent).toContain('No matching decks or checkpoints');
  const failed=q(undefined,false,new Error('Offline'));
  vi.mocked(useDeckTree).mockReturnValue(failed as ReturnType<typeof useDeckTree>);
  vi.mocked(useReviewItems).mockReturnValue(failed as ReturnType<typeof useReviewItems>);
  vi.mocked(useSettings).mockReturnValue(failed as ReturnType<typeof useSettings>);
  await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not load');
  await click('Retry review data');
  expect(failed.refetch).toHaveBeenCalledTimes(3);
 });
 it('preserves the existing flag-off screen without mounting the new selection',async()=>{
  vi.mocked(isFlagOn).mockReturnValue(false);
  setData({pending:true});
  await render();
  expect(host.textContent).not.toContain('Choose decks and checkpoints for this round');
  expect(host.textContent).not.toContain("in today's batch");
  expect(host.textContent).toContain('Review');
 });
});
