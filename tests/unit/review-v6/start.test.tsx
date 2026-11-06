import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter,Route,Routes,useLocation} from 'react-router';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import ReviewPage from '../../../src/features/review/Page';
import {useDeckTree,useReviewItems,useSettings} from '../../../src/data/hooks';
import {useReviewSession} from '../../../src/features/review-run/store';
import type {DeckNode,ReviewItem} from '../../../src/data/types';

const flags=vi.hoisted(()=>({v6:true}));
vi.mock('../../../src/flags',()=>({isFlagOn:()=>flags.v6}));
vi.mock('../../../src/data/hooks',()=>({
  useDeckTree:vi.fn(),useReviewItems:vi.fn(),useSettings:vi.fn(),
}));
vi.mock('../../../src/ui/Screen',async()=>{
  const React=await import('react');
  return {Screen:({title,children}:{title:string,children:React.ReactNode})=>
    React.createElement('main',{},React.createElement('h1',{},title),children)};
});
const asNode=(node:{key:string;label:string;due:number;children?:unknown[]}):DeckNode=>({
  ...node,children:node.children??[],
}) as unknown as DeckNode;
const nodes=[
  asNode({key:'project:algebra',label:'Algebra and mathematical proofs',due:5,children:[
    asNode({key:'cp:algebra:C1',label:'Definitions and important theorems',due:3}),
    asNode({key:'cp:algebra:C2',label:'Applications of theorems',due:2}),
  ]}),
];
const card=(n:number,checkpoint:'C1'|'C2',note='note-'+n):ReviewItem=>({
  cardId:'card-'+n,noteId:note,noteNo:n,ord:1,
  projectSlug:'algebra',checkpointCode:checkpoint,checkpointTitle:'Chapter '+checkpoint,
  state:{state:2,due:'2026-10-01T00:00:00Z'},
}) as ReviewItem;
const cards=[card(1,'C1'),card(2,'C2'),card(3,'C1')];
const options={
  newPerDay:20,reviewsPerDay:2,rolloverHour:4,timeZone:'UTC',
  learnAheadMinutes:0,mixDecks:true,
};
let root:Root,host:HTMLDivElement;
let refetch:ReturnType<typeof vi.fn>;
function Location(){const loc=useLocation();return <output data-path>{loc.pathname}</output>;}
function responses(data:{
  decks?:DeckNode[]|undefined;items?:ReviewItem[]|undefined;
  loading?:boolean;error?:boolean;quota?:number;
}={}){
  refetch=vi.fn(async()=>undefined);
  vi.mocked(useDeckTree).mockReturnValue({
    data:data.decks===undefined?nodes:data.decks,
    isPending:!!data.loading,error:data.error?new Error('Deck service unavailable'):null,refetch,
  } as unknown as ReturnType<typeof useDeckTree>);
  vi.mocked(useReviewItems).mockReturnValue({
    data:data.items===undefined?cards:data.items,
    isPending:!!data.loading,error:null,refetch,
  } as unknown as ReturnType<typeof useReviewItems>);
  vi.mocked(useSettings).mockReturnValue({
    data:{...options,reviewsPerDay:data.quota??2},
    isPending:!!data.loading,error:null,refetch,
  } as unknown as ReturnType<typeof useSettings>);
}
async function render(){
  await act(async()=>root.render(<MemoryRouter initialEntries={['/review']}><Routes>
    <Route path="/review" element={<ReviewPage/>}/>
    <Route path="/review/run" element={<><p>Review runner entered</p><Location/></>}/>
  </Routes></MemoryRouter>));
}
function button(label:string){
  const element=[...host.querySelectorAll('button')].find(x=>
    x.textContent?.trim()===label||x.getAttribute('aria-label')===label);
  if(!element)throw new Error('Missing button '+label);
  return element;
}
async function click(label:string){
  await act(async()=>{button(label).click();await Promise.resolve()});
}
function check(labelPart:string){
  const input=[...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    .find(x=>x.closest('label')?.textContent?.includes(labelPart));
  if(!input)throw new Error('Missing checkbox '+labelPart);
  return input;
}
async function toggle(labelPart:string){
  await act(async()=>{check(labelPart).click();await Promise.resolve()});
}
function count(name:string){
  return Number(host.querySelector('[data-'+name+']')?.textContent);
}
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  flags.v6=true;
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  useReviewSession.getState().close();
  responses();
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  useReviewSession.getState().close();
  host.remove();vi.clearAllMocks();
});
describe('N30.2 v6 Review start',()=>{
  it('shows all-due, selected-eligible, and the exact budgeted round count, then initializes that queue',async()=>{
    await render();
    expect(count('all-due')).toBe(5);
    expect(count('eligible')).toBe(3);
    expect(count('in-round')).toBe(2);
    expect(button('Start 2 cards').disabled).toBe(false);
    expect(host.textContent).toContain('Algebra and mathematical proofs');
    await click('Start 2 cards');
    expect(host.textContent).toContain('Review runner entered');
    const state=useReviewSession.getState();
    expect(state.total).toBe(2);
    expect(state.queue?.total).toBe(2);
    expect(new Set([state.current?.cardId,
      ...state.queue!.learning.map(x=>x.cardId),
      ...state.queue!.reviews.map(x=>x.cardId),
      ...state.queue!.fresh.map(x=>x.cardId)]).size).toBe(2);
  });
  it('shows complete checkpoint labels, excludes a deselected checkpoint from the queue',async()=>{
    await render();
    await click('Show checkpoints for Algebra and mathematical proofs');
    const label='Include Algebra and mathematical proofs — Definitions and important theorems';
    expect(check(label).checked).toBe(true);
    await toggle(label);
    expect(check(label).checked).toBe(false);
    expect(count('eligible')).toBe(1);
    expect(count('in-round')).toBe(1);
    await click('Start 1 card');
    expect(useReviewSession.getState().total).toBe(1);
    expect(useReviewSession.getState().current?.checkpointCode).toBe('C2');
  });
  it('does not overstate the actual queue when two selected siblings share one note',async()=>{
    responses({items:[card(1,'C1','same-note'),card(2,'C2','same-note')],quota:20});
    await render();
    expect(count('eligible')).toBe(2);
    expect(count('in-round')).toBe(1);
    await click('Start 1 card');
    expect(useReviewSession.getState().total).toBe(1);
  });
  it('supports Clear, Select all, and a truthful filtered-empty state',async()=>{
    await render();
    await click('Clear');
    expect(count('all-due')).toBe(5);
    expect(count('eligible')).toBe(0);
    expect(count('in-round')).toBe(0);
    expect(button('Start 0 cards').disabled).toBe(true);
    expect(host.querySelector('[role="status"]')?.textContent).toContain('No cards due in the selected decks');
    await click('Select all');
    expect(count('in-round')).toBe(2);
  });
  it('distinguishes empty and zero quota from missing data',async()=>{
    responses({decks:[],items:[]});
    await render();
    expect(host.textContent).toContain('No reviews due today');
    expect(count('all-due')).toBe(0);
    expect(button('Start 0 cards').disabled).toBe(true);
    await act(async()=>root.unmount());host.replaceChildren();root=createRoot(host);
    responses({quota:0});
    await render();
    expect(count('eligible')).toBe(3);
    expect(count('in-round')).toBe(0);
    expect(host.textContent).toContain('No cards available in today');
  });
  it('shows loading instead of zero and retryable failure instead of an empty deck',async()=>{
    responses({loading:true});
    await render();
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Loading your review decks');
    expect(host.querySelector('[data-in-round]')).toBeNull();
    await act(async()=>root.unmount());host.replaceChildren();root=createRoot(host);
    responses({error:true});
    await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
    expect(host.querySelector('[data-in-round]')).toBeNull();
    await click('Try again');
    expect(refetch).toHaveBeenCalledTimes(3);
  });
  it('has keyboard-operable, full-label project and checkpoint checkboxes with 44px controls',async()=>{
    await render();
    expect(check('Include Algebra and mathematical proofs').closest('label')?.className).toContain('min-h-11');
    await click('Show checkpoints for Algebra and mathematical proofs');
    expect(button('Hide checkpoints for Algebra and mathematical proofs').getAttribute('aria-expanded')).toBe('true');
    const cp=check('Include Algebra and mathematical proofs — Applications of theorems');
    expect(cp.closest('label')?.textContent).toContain('Applications of theorems (2 due)');
    await toggle('Include Algebra and mathematical proofs — Applications of theorems');
    expect(cp.checked).toBe(false);
    expect(count('in-round')).toBe(2);
  });
  it('keeps legacy Review behind the flag without modifying the old component body',()=>{
    const src=readFileSync('src/features/review/Page.tsx','utf8');
    expect(src).toContain("function LegacyReviewPage(){");
    expect(src).toContain("isFlagOn('v6Shell')?<V6ReviewStart/>:<LegacyReviewPage/>");
    expect(src).toContain("useReminderRound(settings.data)");
    expect(src).toContain("const groupedSessions=useMemo");
  });
});
