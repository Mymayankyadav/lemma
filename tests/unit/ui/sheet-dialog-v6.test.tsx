import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const flags=vi.hoisted(()=>({v6:true}));
vi.mock('../../../src/flags',()=>({isFlagOn:()=>flags.v6}));
const insights=vi.hoisted(()=>({reviews:[] as {durationMs:number}[],fail:false}));
vi.mock('../../../src/data',()=>({getApi:()=>({getInsightData:async()=>{
 if(insights.fail)throw new Error('offline');
 return {reviews:insights.reviews,sessions:[],checkpointEvents:[],projects:[],misconceptions:[]};
}})}));
import {Sheet} from '../../../src/ui/Sheet';
import Dialog from '../../../src/ui/v6/Dialog';
import {useReviewEstimate} from '../../../src/features/review/v6/estimate';

let host:HTMLDivElement,root:Root;
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 flags.v6=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();document.body.replaceChildren();});

describe('N121 A1 v6 Sheet structure',()=>{
 it('renders a header, a scrolling body and a fixed footer above the page header, and closes on Escape',async()=>{
  const close=vi.fn();
  await act(async()=>root.render(<Sheet open onClose={close} title="New card" footer={<button>Create card</button>}><p>Body</p></Sheet>));
  const sheet=document.querySelector('.ui-sheet')!;
  expect(sheet.querySelector('.ui-sheet-header .ui-sheet-title')?.textContent).toBe('New card');
  expect(sheet.querySelector('.ui-sheet-body')?.textContent).toBe('Body');
  expect(sheet.querySelector('.ui-sheet-footer')?.textContent).toBe('Create card');
  expect(document.querySelector('[data-sheet-overlay]')?.className).toContain('z-[100]');
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(close).toHaveBeenCalled();
 });
 it('marks only the route-level New path sheet so it keeps the five-tab bar',async()=>{
  await act(async()=>root.render(<Sheet open route onClose={()=>{}} title="New path"><p/></Sheet>));
  expect(document.querySelector('.ui-sheet')?.hasAttribute('data-sheet-route')).toBe(true);
 });
 it('leaves the flag-off Sheet DOM unchanged (no v6 header, body or footer)',async()=>{
  flags.v6=false;
  await act(async()=>root.render(<Sheet open onClose={()=>{}} title="Legacy" footer={<button>Ignored</button>}><p>Body</p></Sheet>));
  expect(document.querySelector('.ui-sheet-body')).toBeNull();
  expect(document.querySelector('.ui-sheet-footer')).toBeNull();
  expect(document.body.textContent).toContain('Body');
 });
});

describe('N121 A2 v6 Dialog primitive',()=>{
 it('opens modally with a labelled header, scroll body and footer, locks page scroll and blocks Escape while busy',async()=>{
  const close=vi.fn();
  await act(async()=>root.render(<Dialog title="New task" eyebrow="TASKS" busy onClose={close} footer={<button>Save task</button>}><p>Fields</p></Dialog>));
  const dialog=document.querySelector('dialog')!;
  expect(dialog.open).toBe(true);
  expect(dialog.className).toContain('lemma-native-sheet');
  expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('New task');
  expect(dialog.querySelector('.ui-sheet-footer')?.textContent).toBe('Save task');
  expect(document.body.style.overflow).toBe('hidden');
  expect(document.documentElement.classList.contains('lemma-native-sheet-open')).toBe(true);
  const cancel=new Event('cancel',{cancelable:true});
  await act(async()=>dialog.dispatchEvent(cancel));
  expect(cancel.defaultPrevented).toBe(true);
  expect(close).not.toHaveBeenCalled();
  await act(async()=>root.render(<></>));
  expect(document.body.style.overflow).toBe('');
  expect(document.documentElement.classList.contains('lemma-native-sheet-open')).toBe(false);
 });
});

function Estimate({count}:{count:number}){const minutes=useReviewEstimate(count);return <output>{minutes===null?'pending':String(minutes)}</output>;}
async function estimate(count:number){
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 await act(async()=>root.render(<QueryClientProvider client={client}><Estimate count={count}/></QueryClientProvider>));
 await vi.waitFor(()=>expect(host.textContent).not.toBe('pending'));
 return host.textContent;
}
describe('N121 C4 review estimate',()=>{
 it('uses the owner’s real answer times: 23 cards at 30 s each is about 12 minutes',async()=>{
  insights.reviews=Array.from({length:10},()=>({durationMs:30_000}));
  expect(await estimate(23)).toBe('12');
 });
 it('falls back to 25 s a card without history (23 cards ≈ 10 min), never 4.5 s',async()=>{
  insights.reviews=[];
  expect(await estimate(23)).toBe('10');
 });
});
