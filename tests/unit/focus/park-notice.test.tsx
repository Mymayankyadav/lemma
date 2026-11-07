import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import FocusEvents,{collectFocusPages,readFocusEvents} from '../../../src/features/focus/FocusEvents';
import TodayFocus from '../../../src/features/focus/TodayFocus';
import {setStudyApiForTests} from '../../../src/data/study';
import {emptyStudyApi,type StudyEntryRecord} from '../../../src/data/study/contract';
import {setStudyEventApiForTests,type StudyEventRecord,type StudyEventApi} from '../../../src/data/study-events';
import {setThoughtApiForTests,type ParkedThought,type ThoughtApi} from '../../../src/data/parked-thoughts';
import {getMode} from '../../../src/data/mode';
import {isFlagOn} from '../../../src/flags';
vi.mock('../../../src/flags',()=>({isFlagOn:vi.fn(()=>true)}));
const ENTRY='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const at='2026-11-06T09:00:00.000Z';
let serial=0;
const id=()=> 'aaaa0000-0000-4000-8000-'+String(++serial).padStart(12,'0');
function event(entryId=ENTRY,kind:'notice'|'drift'='notice'):StudyEventRecord {
 return {id:id(),entryId,kind,occurredAt:at,durationMinutes:kind==='drift'?5:null,note:null,
  relatedKind:null,relatedId:null,voidedAt:null,version:1,source:'app',createdAt:at,updatedAt:at};
}
function parked(entryId=ENTRY):ParkedThought {
 return {id:id(),studyEntryId:entryId,text:'Idea',status:'open',destinationKind:null,
  destinationId:null,resolvedAt:null,version:1,createdAt:at,updatedAt:at};
}
function fakes(initialEvents:StudyEventRecord[]=[],initialThoughts:ParkedThought[]=[]){
 const eRows=[...initialEvents],tRows=[...initialThoughts];
 const events={
  mode:getMode(),
  listEvents:vi.fn(async(q:{entryId?:string;kind?:string[];cursor?:string|null})=>{
   const filtered=eRows.filter(x=>x.entryId===q.entryId&&q.kind?.includes(x.kind)&&!x.voidedAt);
   const n=q.cursor?Number(q.cursor.slice(5)):0;
   return {items:filtered.slice(n,n+50),total:filtered.length,
    nextCursor:n+50<filtered.length?'page-'+(n+50):null};
  }),
  recordEvent:vi.fn(async(input:{entryId:string;durationMinutes?:number|null})=>{
   const row={...event(input.entryId,'drift'),durationMinutes:input.durationMinutes??null};
   eRows.push(row);return {record:row,actionNo:1};
  })
 } as unknown as StudyEventApi;
 const thoughts={
  mode:getMode(),
  listThoughts:vi.fn(async(q:{cursor?:string|null})=>{
   const n=q.cursor?Number(q.cursor.slice(5)):0;
   return {items:tRows.slice(n,n+50),total:tRows.length,nextCursor:n+50<tRows.length?'page-'+(n+50):null};
  }),
  createThought:vi.fn(async(input:{text:string;studyEntryId?:string|null})=>{
   const row={...parked(input.studyEntryId??OTHER),text:input.text};
   tRows.push(row);return {record:row,actionNo:2};
  })
 } as unknown as ThoughtApi;
 setStudyEventApiForTests(events);setThoughtApiForTests(thoughts);
 return {events,thoughts};
}
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{
 serial=0;Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.mocked(isFlagOn).mockReturnValue(true);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{
 await act(async()=>root.unmount());host.remove();
 setStudyApiForTests(null);setStudyEventApiForTests(null);setThoughtApiForTests(null);
 vi.clearAllMocks();
});
async function render(node:React.ReactNode){
 await act(async()=>root.render(node));
 await vi.waitFor(()=>expect(host.textContent).not.toContain('Loading focus notes'));
}
function button(label:string){
 const b=[...host.querySelectorAll('button')].find(x=>x.textContent?.trim()===label);
 if(!b)throw Error('Missing '+label);
 return b;
}
async function click(node:HTMLElement){await act(async()=>node.click());}
async function change(node:HTMLInputElement|HTMLTextAreaElement,value:string){
 const cls=node instanceof HTMLTextAreaElement?HTMLTextAreaElement:HTMLInputElement;
 const setter=Object.getOwnPropertyDescriptor(cls.prototype,'value')!.set!;
 await act(async()=>{setter.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});
}
describe('N71 focus notices, parking and drift',()=>{
 it('reads all 50-item pages and filters by active study entry',async()=>{
  const e=Array.from({length:55},()=>event());e.push(event(OTHER));
  const api=fakes(e,Array.from({length:53},()=>parked()));
  expect(await readFocusEvents(ENTRY,api.thoughts,api.events)).toEqual({
   notices:55,drifts:0,driftMinutes:0,parked:53
  });
  expect(api.events.listEvents).toHaveBeenCalledTimes(3);
  expect(api.thoughts.listThoughts).toHaveBeenCalledTimes(2);
 });
 it('rejects cyclic or short focus pagination without silently losing records',async()=>{
  await expect(collectFocusPages(async()=>({items:[],total:1,nextCursor:null})))
   .rejects.toThrow(/Incomplete/);
  await expect(collectFocusPages(async()=>({items:[],total:2,nextCursor:'page-0'})))
   .rejects.toThrow(/cursor/i);
 });
 it('parks a linked thought and rehydrates count across component remounts',async()=>{
  const api=fakes();await render(<FocusEvents entryId={ENTRY}/>);
  await click(button('Park a thought'));
  expect(host.querySelector('dialog')?.open).toBe(true);
  await change(host.querySelector('textarea')!,'  A new proof idea  ');
  await click(button('Save thought'));
  await vi.waitFor(()=>expect(api.thoughts.createThought).toHaveBeenCalledTimes(1));
  expect(api.thoughts.createThought).toHaveBeenCalledWith({studyEntryId:ENTRY,text:'A new proof idea'});
  expect(host.querySelector('[aria-label="Parked thought count"]')?.textContent).toContain('1');
  await render(<FocusEvents key="reload" entryId={ENTRY}/>);
  expect(host.querySelector('[aria-label="Parked thought count"]')?.textContent).toContain('1');
 });
 it('records drift with whole minutes and never calls the study timer',async()=>{
  const api=fakes([event()]);
  const study={...emptyStudyApi('demo'),activeStudyEntry:vi.fn(async()=>null)};
  setStudyApiForTests(study);
  await render(<FocusEvents entryId={ENTRY}/>);
  await change(host.querySelector('[aria-label="Drift minutes"]') as HTMLInputElement,'7');
  await click(button('I drifted'));
  await vi.waitFor(()=>expect(api.events.recordEvent).toHaveBeenCalledTimes(1));
  expect(api.events.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
   entryId:ENTRY,kind:'drift',durationMinutes:7
  }));
  expect(host.querySelector('[aria-label="Recorded drift"]')?.textContent).toContain('7 min');
  expect(host.querySelector('[aria-label="Study notices"]')?.textContent).toContain('1');
  expect(study.activeStudyEntry).not.toHaveBeenCalled();
  await render(<FocusEvents key="reload" entryId={ENTRY}/>);
  expect(host.querySelector('[aria-label="Recorded drift"]')?.textContent).toContain('7 min');
 });
 it('rejects fractional drift and surfaces a failed write',async()=>{
  const api=fakes();await render(<FocusEvents entryId={ENTRY}/>);
  await change(host.querySelector('[aria-label="Drift minutes"]') as HTMLInputElement,'1.5');
  await click(button('I drifted'));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('whole');
  expect(api.events.recordEvent).not.toHaveBeenCalled();
  await change(host.querySelector('[aria-label="Drift minutes"]') as HTMLInputElement,'2');
  vi.mocked(api.events.recordEvent).mockRejectedValueOnce(new Error('Access denied'));
  await click(button('I drifted'));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Access denied');
 });
 it('shows owner read errors instead of reporting zero notices as fact',async()=>{
  const api=fakes();
  vi.mocked(api.events.listEvents).mockRejectedValueOnce(new Error('Notice feed unavailable'));
  await render(<FocusEvents entryId={ENTRY}/>);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Notice feed unavailable');
 });
 it('dismisses modal with Escape and focuses opener',async()=>{
  fakes();await render(<FocusEvents entryId={ENTRY}/>);
  const opener=button('Park a thought');await click(opener);
  const dlg=host.querySelector('dialog')!;
  await act(async()=>dlg.dispatchEvent(new Event('cancel',{cancelable:true})));
  expect(dlg.open).toBe(false);
  expect(document.activeElement).toBe(opener);
 });
 it('is not mounted or fetched when v6Shell is off',async()=>{
  const api=fakes([event()]);
  const entry:StudyEntryRecord={
   id:ENTRY,intent:'Study',source:'timer',status:'running',reflection:null,rating:null,
   version:1,createdAt:at,updatedAt:at,savedAt:null,
   intervals:[{id:OTHER,kind:'focus',start:at,end:null}]
  };
  setStudyApiForTests({...emptyStudyApi('demo'),activeStudyEntry:vi.fn(async()=>entry)});
  await render(<TodayFocus/>);
  expect(host.querySelector('[aria-label="Focus thoughts and drift"]')).not.toBeNull();
  const count=vi.mocked(api.events.listEvents).mock.calls.length;
  vi.mocked(isFlagOn).mockReturnValue(false);
  await render(<TodayFocus key="off"/>);
  expect(host.querySelector('[aria-label="Focus thoughts and drift"]')).toBeNull();
  expect(api.events.listEvents).toHaveBeenCalledTimes(count);
 });
});
