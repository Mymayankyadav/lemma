import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import PresetPicker,{focusPresetChoice,loadActiveFocusPresets}
 from '../../../src/features/focus/PresetPicker';
import {getPresetApi} from '../../../src/data/presets';
import type {PresetApi,PresetRecord} from '../../../src/data/presets/contract';
import TodayFocus from '../../../src/features/focus/TodayFocus';
import {setStudyApiForTests} from '../../../src/data/study';
import type {StudyApi} from '../../../src/data/study/contract';

vi.mock('../../../src/data/presets',()=>({getPresetApi:vi.fn()}));
const example=(i:number,archivedAt:string|null=null):PresetRecord=>({
 id:'preset-'+i,label:'Activity '+i,mode:'flowtime',position:i,
 focusMinutes:45,breakMinutes:7,longBreakMinutes:15,cycles:3,
 subjectId:'subject-a',projectId:'project-b',checkpointId:null,
 archivedAt,version:1,createdAt:'2026-11-07T09:00:00Z',
 updatedAt:'2026-11-07T09:00:00Z',
});
let rows:PresetRecord[],api:PresetApi,host:HTMLDivElement,root:Root;
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 rows=[example(1),example(2),example(3,'2026-11-07T10:00:00Z')];
 api={
  mode:'demo',
  listPresets:vi.fn(async({archived='active',limit=50,cursor=null}={})=>{
   const matched=rows.filter(x=>archived==='all'||
    (archived==='archived'?x.archivedAt!==null:x.archivedAt===null));
   const offset=cursor?Number(cursor):0;
   return {items:matched.slice(offset,offset+limit),total:matched.length,
    nextCursor:offset+limit<matched.length?String(offset+limit):null};
  }),
 } as unknown as PresetApi;
 vi.mocked(getPresetApi).mockReturnValue(api);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();setStudyApiForTests(null);window.history.replaceState({},'', '/');vi.clearAllMocks()});

describe('N77 Focus activity preset picker',()=>{
 it('loads active presets without exposing archive rows or writing server data',async()=>{
  const pick=vi.fn();
  await act(async()=>{root.render(<PresetPicker onPick={pick}/>);await Promise.resolve()});
  const options=host.querySelectorAll<HTMLSelectElement>('[aria-label="Focus activity"] option');
  expect([...options].map(x=>x.textContent)).toEqual([
   'No preset — use my intention','Activity 1 · flowtime · 45 min',
   'Activity 2 · flowtime · 45 min',
  ]);
  expect(api.listPresets).toHaveBeenCalledWith({
   archived:'active',limit:50,cursor:null,
  });
  const select=host.querySelector<HTMLSelectElement>('[aria-label="Focus activity"]')!;
  await act(async()=>{
   Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(select,'preset-1');
   select.dispatchEvent(new Event('change',{bubbles:true}));
  });
  expect(pick).toHaveBeenCalledWith({
   presetId:'preset-1',intent:'Activity 1',mode:'flowtime',
   subjectId:'subject-a',projectId:'project-b',checkpointId:null,
   focusMinutes:45,breakMinutes:7,longBreakMinutes:15,cycles:3,
  });
  expect(pick).toHaveBeenCalledTimes(1);
 });
 it('rejects archived choice and preserves the owner-free preparation contract',()=>{
  expect(()=>focusPresetChoice(example(3,'2026-11-07T10:00:00Z')))
   .toThrow(/Archived/);
  const choice=focusPresetChoice(example(1));
  expect(choice).not.toHaveProperty('userId');
  expect(choice).not.toHaveProperty('user_id');
  expect(choice).not.toHaveProperty('source');
  expect(choice).not.toHaveProperty('status');
 });
 it('handles more than 50 active presets and detects cyclic page cursors',async()=>{
  rows=Array.from({length:102},(_,i)=>example(i+1));
  const all=await loadActiveFocusPresets();
  expect(all).toHaveLength(102);
  expect(new Set(all.map(x=>x.id)).size).toBe(102);
  expect(api.listPresets).toHaveBeenCalledTimes(3);
  vi.mocked(api.listPresets).mockImplementation(async()=>({
   items:[example(1)],total:20,nextCursor:'repeat',
  }));
  await expect(loadActiveFocusPresets()).rejects.toThrow(/Repeated/);
 });
 it('shows API read errors and retries, rather than silently implying empty data',async()=>{
  vi.mocked(api.listPresets).mockRejectedValueOnce(Error('Offline'));
  await act(async()=>{root.render(<PresetPicker onPick={vi.fn()}/>);await Promise.resolve()});
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Activities unavailable');
  const retry=[...host.querySelectorAll('button')].find(x=>x.textContent==='Try again')!;
  await act(async()=>{retry.click();await Promise.resolve()});
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.querySelectorAll('option')).toHaveLength(3);
 });
 it('mounts the preset choice at v6 Focus start and passes its intention and owner links',async()=>{
  window.history.replaceState({},'','/?flags=v6Shell');
  const startStudyEntry=vi.fn(async()=>{throw Error('Test stopped the start before persistence')});
  setStudyApiForTests({
   mode:'demo',
   activeStudyEntry:vi.fn(async()=>null),
   listStudyEntries:vi.fn(async()=>[]),
   startStudyEntry,
  } as unknown as StudyApi);
  const focusHost=document.createElement('div');document.body.append(focusHost);
  const focusRoot=createRoot(focusHost);
  try{
   await act(async()=>{focusRoot.render(<TodayFocus/>);await Promise.resolve()});
   await vi.waitFor(()=>{
    expect(focusHost.querySelector('select[aria-label="Focus activity"]')).not.toBeNull();
    expect((focusHost.querySelector('button[type="button"]') as HTMLButtonElement).disabled).toBe(false);
    expect([...focusHost.querySelectorAll('button')].find(b=>b.textContent==='Start focus')?.hasAttribute('disabled')).toBe(false);
   });
   const selector=focusHost.querySelector<HTMLSelectElement>('[aria-label="Focus activity"]')!;
   await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(selector,'preset-2');
    selector.dispatchEvent(new Event('change',{bubbles:true}));
   });
   expect(focusHost.querySelector<HTMLInputElement>('[aria-label="Focus intention"]')?.value).toBe('Activity 2');
   await act(async()=>{
    [...focusHost.querySelectorAll('button')].find(b=>b.textContent==='Start focus')!.click();
    await Promise.resolve();
   });
   expect(startStudyEntry).toHaveBeenCalledWith(expect.objectContaining({
    intent:'Activity 2',source:'timer',
    subjectId:'subject-a',projectId:'project-b',checkpointId:null,
   }));
  }finally{
   await act(async()=>focusRoot.unmount());focusHost.remove();
  }
 });

});
