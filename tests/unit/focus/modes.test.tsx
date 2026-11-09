import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import TodayFocus,{focusFromEntry} from '../../../src/features/focus/TodayFocus';
import FocusAccessory from '../../../src/app/FocusAccessory';
import {setStudyApiForTests} from '../../../src/data/study';
import type {StudyApi,StudyEntryRecord,StudyTimerMode} from '../../../src/data/study/contract';

const mocks=vi.hoisted(()=>({
 createPreset:vi.fn(async (input:{mode:StudyTimerMode})=>({
  record:{id:'preset-new',mode:input.mode},actionNo:1,
 })),
}));
vi.mock('../../../src/data/presets',()=>({getPresetApi:()=>({
 listPresets:async()=>({items:[],total:0,nextCursor:null}),
 getPreset:async()=>null,createPreset:mocks.createPreset,
})}));
// Effects depend on API identity; return one stable fake per module to avoid
// a render → new API → effect → setState → render loop.
vi.mock('../../../src/data/study-events',()=>{
 const api={
  listEvents:vi.fn(async()=>({items:[],total:0,nextCursor:null})),
  recordEvent:vi.fn(async()=>({record:{},actionNo:1})),
 };
 return {getStudyEventApi:()=>api};
});
vi.mock('../../../src/data/parked-thoughts',()=>{
 const api={createThought:vi.fn(async()=>({record:{},actionNo:1}))};
 return {getThoughtApi:()=>api};
});

const time=(minutes=0)=>new Date(Date.now()+minutes*60000).toISOString();
const receipt=(record:StudyEntryRecord)=>({record,actionNo:1});
function record(mode:StudyTimerMode='pomodoro'):StudyEntryRecord{
 return {id:'active-1',intent:'Review calculus',source:'timer',status:'running',
  reflection:null,rating:null,version:1,createdAt:time(-10),updatedAt:time(-10),savedAt:null,
  mode,config:{mode,focus_minutes:25,break_minutes:5,long_break_minutes:15,cycles:4},
  phase:'focus',cycle:2,phaseEndsAt:time(15),leaseDevice:null,leaseVersion:0,leaseExpiresAt:null,
  intervals:[{id:'interval-1',kind:'focus',start:time(-10),end:null}]};
}
function adapter(initial:StudyEntryRecord|null=null){
 let active=initial;
 const api={
  mode:'demo',
  activeStudyEntry:vi.fn(async()=>active),
  listStudyEntries:vi.fn(async()=>[]),
  startStudyEntry:vi.fn(async(input:{intent:string;presetId?:string})=>{
   active={...record(input.presetId?'pomodoro':'open'),intent:input.intent};
   return receipt(active);
  }),
  takeLease:vi.fn(async()=>{
   active={...active!,version:active!.version+1,leaseDevice:'this-tab',leaseVersion:1,
    leaseExpiresAt:time(2)};return receipt(active);
  }),
  nextPhase:vi.fn(async()=>{
   active={...active!,version:active!.version+1,phase:'break',status:'paused',
    phaseEndsAt:time(5),intervals:[{id:'interval-1',kind:'focus',start:time(-10),end:time()},
    {id:'interval-2',kind:'break',start:time(),end:null}]};
   return receipt(active);
  }),
  excludeMinutes:vi.fn(async()=>{
   active={...active!,version:active!.version+1,excludedIntervals:[
    {from:time(-2),to:time(-1),reason:'Self-reported drift'}]};
   return receipt(active);
  }),
  pauseStudyEntry:vi.fn(async()=>{
   active={...active!,status:'paused',version:active!.version+1};return receipt(active);
  }),
  resumeStudyEntry:vi.fn(async()=>{
   active={...active!,status:'running',version:active!.version+1};return receipt(active);
  }),
  breakStudyEntry:vi.fn(async()=>receipt(active!)),
  discardStudyEntry:vi.fn(async()=>{const done={...active!,status:'discarded' as const};active=null;return receipt(done);}),
  saveStudyEntry:vi.fn(async()=>{const done={...active!,status:'saved' as const};active=null;return receipt(done);}),
 };
 return api as unknown as StudyApi;
}
async function render(element:React.ReactElement,api:StudyApi){
 setStudyApiForTests(api);
 const host=document.createElement('div');document.body.append(host);
 const root=createRoot(host);
 await act(async()=>{root.render(element)});
 return {host,async cleanup(){await act(async()=>root.unmount());host.remove();}};
}
async function click(node:Element|null){if(!node)throw Error('Control missing');await act(async()=>{(node as HTMLElement).click();});}
const button=(host:ParentNode,label:string)=>Array.from(host.querySelectorAll('button'))
 .find(x=>x.textContent?.trim()===label)??null;
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 window.history.replaceState(null,'','/?demo=1&flags=v6Shell');
 mocks.createPreset.mockClear();
});
afterEach(()=>{setStudyApiForTests(null);});

describe('N72 focus modes and shell accessory',()=>{
 it('starts an explicit quick Pomodoro through an owner preset and captures server mode',async()=>{
  const api=adapter(),view=await render(<TodayFocus/>,api);
  try{
   await vi.waitFor(()=>expect(view.host.textContent).not.toContain('Loading study time'));
   const select=view.host.querySelector<HTMLSelectElement>('select[aria-label="Timer mode"]')!;
   await act(async()=>{
    const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!;
    setter.call(select,'pomodoro');select.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await click(button(view.host,'Start focus'));
   expect(mocks.createPreset).toHaveBeenCalledWith(expect.objectContaining({mode:'pomodoro'}));
   expect(api.startStudyEntry).toHaveBeenCalledWith(expect.objectContaining({presetId:'preset-new'}));
   expect(api.takeLease).toHaveBeenCalledTimes(1);
   expect(view.host.querySelector('dialog')?.textContent).toContain('Mode: pomodoro');
   expect(view.host.querySelector('dialog')?.textContent).toContain('Phase ends at');
  }finally{await view.cleanup();}
 });
 it('requires explicit takeover after restoration and advances only through StudyApi',async()=>{
  const start=record();
  const api=adapter(start),view=await render(<TodayFocus/>,api);
  try{
   await vi.waitFor(()=>expect(view.host.textContent).not.toContain('Loading study time'));
   await click(button(view.host,'Return to focus'));
   const dialog=view.host.querySelector('dialog')!;
   const advance=button(dialog,'Skip to next phase') as HTMLButtonElement;
   expect(advance.disabled).toBe(true);
   await click(button(dialog,'Take control of timer'));
   expect(advance.disabled).toBe(false);
   await click(advance);
   expect(api.nextPhase).toHaveBeenCalledWith('active-1',2);
   expect(dialog.textContent).toContain('Break · Cycle 2');
  }finally{await view.cleanup();}
 });
 it('uses captured focus length and exposes the long-session guard',async()=>{
  const old={...record(),createdAt:time(-240)};
  expect(focusFromEntry(old).session?.focusMinutes).toBe(25);
  expect(focusFromEntry(record('open')).session?.focusMinutes).toBe(1440);
  const api=adapter(old),view=await render(<TodayFocus/>,api);
  try{
   await vi.waitFor(()=>expect(view.host.textContent).not.toContain('Loading study time'));
   await click(button(view.host,'Return to focus'));
   expect(view.host.querySelector('dialog')?.textContent).toContain('over three hours old');
  }finally{await view.cleanup();}
 });
 it('keeps one accessory available on another route with pause and open actions',async()=>{
  const api=adapter(record()),view=await render(<MemoryRouter initialEntries={['/calendar']}>
   <FocusAccessory/>
  </MemoryRouter>,api);
  try{
   await vi.waitFor(()=>expect(view.host.querySelector('[aria-label="Focus accessory"]')).not.toBeNull());
   // N110: the dock shows the mockup's mm:ss clock; the minutes stay its accessible name.
   expect(view.host.querySelector('#cr-mobile-dock time')?.getAttribute('aria-label')).toBe('15 min to phase deadline');
   expect(view.host.querySelector('#cr-mobile-dock time')?.textContent).toMatch(/^1[45]:\d\d$/);
   await click(button(view.host,'Pause'));
   expect(api.pauseStudyEntry).toHaveBeenCalledTimes(1);
   await click(view.host.querySelector('button[aria-label="Open focus"]'));
   expect(view.host.querySelector('[aria-label="Focus accessory"]')).not.toBeNull();
  }finally{await view.cleanup();}
 });
});
