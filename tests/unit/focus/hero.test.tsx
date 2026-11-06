import React, {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {emptyStudyApi, type StudyApi, type StudyEntryRecord, type StudyRange} from '../../../src/data/study/contract';
import {setStudyApiForTests} from '../../../src/data/study';
import V6StudyHero from '../../../src/features/home/V6StudyHero';

vi.mock('../../../src/data/mode',()=>({getMode:()=> 'demo'}));
const saved=(range: StudyRange):StudyEntryRecord=>({
 id:'saved-one',intent:'Completed proof',source:'timer',status:'saved',
 reflection:null,rating:null,version:2,
 createdAt:range.start,updatedAt:range.end,savedAt:range.end,
 intervals:[{id:'interval-one',kind:'focus',start:new Date(Date.parse(range.start)+60_000).toISOString(),
  end:new Date(Date.parse(range.start)+31*60_000).toISOString()}],
});
function fakeApi(overrides:Partial<StudyApi>={}):StudyApi{
 return {...emptyStudyApi('demo'),
  listStudyEntries:vi.fn(async range=>[saved(range)]),
  activeStudyEntry:vi.fn(async()=>null),
  startStudyEntry:vi.fn(async()=>({record:{...saved({start:new Date().toISOString(),end:new Date().toISOString()}),id:'running',status:'running' as const,intent:'Focused study'},actionNo:null})),
  ...overrides};
}
let root:Root, host:HTMLDivElement;
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{
 await act(async()=>root.unmount());
 host.remove();setStudyApiForTests(null);
});
async function mount(api:StudyApi){
 setStudyApiForTests(api);
 await act(async()=>root.render(<V6StudyHero/>));
}
const click=async(label:string)=>{
 const button=[...host.querySelectorAll('button')].find(element=>element.textContent?.includes(label));
 expect(button,label+' action').toBeDefined();
 await act(async()=>button!.click());
};
describe('N14.3.1 v6 Today action hero',()=>{
 it('reads the device civil day and reports only saved focus minutes',async()=>{
  const api=fakeApi();
  await mount(api);
  await vi.waitFor(()=>expect(host.textContent).toContain('Logged today: 30 min'));
  expect(api.listStudyEntries).toHaveBeenCalledTimes(1);
  expect(api.activeStudyEntry).toHaveBeenCalledTimes(1);
  const range=vi.mocked(api.listStudyEntries).mock.calls[0][0];
  expect(Date.parse(range.end)-Date.parse(range.start)).toBeGreaterThanOrEqual(23*60*60*1000);
  expect(host.textContent).toContain('Start focus');
 });
 it('starts only once through StudyApi and opens a resumable focus dialog',async()=>{
  const api=fakeApi();
  await mount(api);
  await vi.waitFor(()=>expect(host.textContent).toContain('Start focus'));
  await click('Start focus');
  await vi.waitFor(()=>expect(host.textContent).toContain('Return to focus'));
  expect(api.startStudyEntry).toHaveBeenCalledExactlyOnceWith({intent:'Focused study',source:'timer'});
  await click('Return to focus');
  expect(api.startStudyEntry).toHaveBeenCalledTimes(1);
  expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(true);
 });
 it('shows the already running entry and never issues a duplicate start',async()=>{
  const active={...saved({start:new Date().toISOString(),end:new Date().toISOString()}),status:'paused' as const,id:'active-one'};
  const api=fakeApi({activeStudyEntry:vi.fn(async()=>active)});
  await mount(api);
  await vi.waitFor(()=>expect(host.textContent).toContain('Return to focus'));
  await click('Return to focus');
  expect(host.querySelector('dialog')?.textContent).toContain(active.intent);
  expect(api.startStudyEntry).not.toHaveBeenCalled();
 });
 it('reports write errors without pretending focus started',async()=>{
  const api=fakeApi({startStudyEntry:vi.fn(async()=>{throw new Error('offline')})});
  await mount(api);
  await click('Start focus');
  await vi.waitFor(()=>expect(host.querySelector('[role="alert"]')?.textContent).toContain('could not start'));
  expect(host.textContent).toContain('Start focus');
 });
});
