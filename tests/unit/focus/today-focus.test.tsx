import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import TodayFocus,{focusFromEntry,loggedToday} from '../../../src/features/focus/TodayFocus';
import {setStudyApiForTests} from '../../../src/data/study';
import type {StudyApi,StudyEntryRecord} from '../../../src/data/study/contract';

// N102: v6Shell defaults on; this suite covers the legacy (flag-off) screen.
beforeEach(()=>{window.history.replaceState(null,'','/?flags=-v6Shell');});

const iso=(delta=0)=>new Date(Date.now()+delta*60_000).toISOString();
const receipt=<T,>(record:T)=>({record,actionNo:null});
const entry=(status:StudyEntryRecord['status']='running'):StudyEntryRecord=>({
 id:'focus-1',intent:'Prove the lemma',source:'timer',status,
 reflection:null,rating:null,version:1,createdAt:iso(-10),updatedAt:iso(-10),
 savedAt:status==='saved'?iso(-2):null,
 intervals:[{id:'interval-1',kind:'focus',start:iso(-10),end:status==='running'?null:iso(-2)}],
});
function adapter(initial?:StudyEntryRecord){
 let active=initial&&['running','paused'].includes(initial.status)?initial:null;
 const saved:StudyEntryRecord[]=initial?.status==='saved'?[initial]:[];
 let version=1;
 const api:StudyApi={
  mode:'live',
  listStudyEntries:vi.fn(async()=>saved.slice()),
  activeStudyEntry:vi.fn(async()=>active),
  startStudyEntry:vi.fn(async(input)=>{
   const at=input.startedAt??iso();
   active={...entry(),id:'focus-'+(++version),intent:input.intent,createdAt:at,updatedAt:at,
    intervals:[{id:'interval-'+version,kind:'focus',start:at,end:null}]};
   return receipt(active);
  }),
  pauseStudyEntry:vi.fn(async(_id,_version,at)=>{
   const stamp=at??iso();
   active={...active!,status:'paused',version:active!.version+1,updatedAt:stamp,
    intervals:active!.intervals.map((i,index)=>index===active!.intervals.length-1?{...i,end:stamp}:i)};
   return receipt(active);
  }),
  resumeStudyEntry:vi.fn(async(_id,_version,at)=>{
   const stamp=at??iso();
   active={...active!,status:'running',version:active!.version+1,updatedAt:stamp,
    intervals:[...active!.intervals.map(i=>i.end===null?{...i,end:stamp}:i),
     {id:'interval-'+(++version),kind:'focus',start:stamp,end:null}]};
   return receipt(active);
  }),
  breakStudyEntry:vi.fn(async(_id,_version,at)=>{
   const stamp=at??iso();
   active={...active!,status:'running',version:active!.version+1,updatedAt:stamp,
    intervals:[...active!.intervals.map(i=>i.end===null?{...i,end:stamp}:i),
     {id:'interval-'+(++version),kind:'break',start:stamp,end:null}]};
   return receipt(active);
  }),
  saveStudyEntry:vi.fn(async(_id,_version,patch)=>{
   const stamp=iso();
   const record:StudyEntryRecord={...active!,status:'saved',version:active!.version+1,
    savedAt:stamp,updatedAt:stamp,reflection:patch?.reflection??null,
    intervals:active!.intervals.map(i=>i.end===null?{...i,end:stamp}:i)};
   saved.push(record);active=null;
   return receipt(record);
  }),
  discardStudyEntry:vi.fn(async()=>{
   const record:StudyEntryRecord={...active!,status:'discarded',version:active!.version+1,
    intervals:active!.intervals.map(i=>i.end===null?{...i,end:iso()}:i)};
   active=null;return receipt(record);
  }),
  listCalendarBlocks:vi.fn(async()=>[]),
  createCalendarBlock:vi.fn(async()=>{throw Error('Not used');}),
  updateCalendarBlock:vi.fn(async()=>{throw Error('Not used');}),
  deleteCalendarBlock:vi.fn(async()=>{throw Error('Not used');}),
 };
 return api;
}
function button(scope:ParentNode,label:string){
 const found=Array.from(scope.querySelectorAll('button')).find(b=>b.textContent?.trim()===label);
 if(!found)throw Error('Missing button: '+label);
 return found;
}
async function click(node:HTMLElement){await act(async()=>{node.click();});}
async function render(api:StudyApi){
 setStudyApiForTests(api);
 const host=document.createElement('div');
 document.body.append(host);
 const root=createRoot(host);
 await act(async()=>{root.render(<TodayFocus/>);});
 await vi.waitFor(()=>expect(host.textContent).not.toContain('Loading study time'));
 return {host,root,async cleanup(){
  await act(async()=>root.unmount());host.remove();setStudyApiForTests(null);
 }};
}
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});});
afterEach(()=>{setStudyApiForTests(null);});

describe('N14.3 v6 Today Focus UI and StudyApi contract',()=>{
 it('starts, pauses, resumes, finishes and saves through exactly one write each',async()=>{
  const api=adapter(),view=await render(api);
  try{
   await click(button(view.host,'Start focus'));
   expect(api.startStudyEntry).toHaveBeenCalledTimes(1);
   const dialog=view.host.querySelector('dialog')!;
   expect(dialog.open).toBe(true);
   await click(button(dialog,'Pause'));
   expect(api.pauseStudyEntry).toHaveBeenCalledTimes(1);
   await click(button(dialog,'Resume'));
   expect(api.resumeStudyEntry).toHaveBeenCalledTimes(1);
   await click(button(dialog,'Finish'));
   expect(dialog.textContent).toContain('Minutes to save');
   await click(button(dialog,'Save'));
   expect(api.saveStudyEntry).toHaveBeenCalledTimes(1);
   expect(api.discardStudyEntry).not.toHaveBeenCalled();
   expect(button(view.host,'Start focus')).toBeDefined();
  }finally{await view.cleanup();}
 });
 it('discards a finished entry and keeps logged-today at zero',async()=>{
  const api=adapter(),view=await render(api);
  try{
   await click(button(view.host,'Start focus'));
   const dialog=view.host.querySelector('dialog')!;
   await click(button(dialog,'Finish'));
   await click(button(dialog,'Discard'));
   expect(api.discardStudyEntry).toHaveBeenCalledTimes(1);
   expect(api.saveStudyEntry).not.toHaveBeenCalled();
   expect(view.host.querySelector('output[aria-label="Logged today"]')?.textContent).toContain('0 min');
  }finally{await view.cleanup();}
 });
 it('reads saved effort from the fake adapter',async()=>{
  const api=adapter(entry('saved')),view=await render(api);
  try{
   expect(view.host.querySelector('output[aria-label="Logged today"]')?.textContent).toContain('8 min');
   expect(api.listStudyEntries).toHaveBeenCalledTimes(1);
   expect(button(view.host,'Start focus')).toBeDefined();
  }finally{await view.cleanup();}
 });
 it('converts nullable intervals to closed saved effort and ignores active entries',()=>{
  const closed=entry('saved'),open=entry('running');
  expect(loggedToday([open,closed],{start:iso(-20),end:iso(20)},'UTC',iso())).toBeCloseTo(8,4);
  expect(loggedToday([open],{start:iso(-20),end:iso(20)},'UTC',iso())).toBe(0);
 });
 it('excludes a draft even when it is returned in the day query',async()=>{
  const api=adapter();
  vi.mocked(api.listStudyEntries).mockResolvedValue([entry('draft')]);
  const view=await render(api);
  try{
   expect(view.host.querySelector('output[aria-label="Logged today"]')?.textContent).toContain('0 min');
  }finally{await view.cleanup();}
 });
 it('keeps a parked thought as the saved reflection',async()=>{
  const api=adapter(),view=await render(api);
  try{
   await click(button(view.host,'Start focus'));
   const dialog=view.host.querySelector('dialog')!;
   const field=dialog.querySelector('textarea')!;
   const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!;
   await act(async()=>{
    setter.call(field,'Proved the key step');
    field.dispatchEvent(new Event('input',{bubbles:true}));
   });
   await click(button(dialog,'Finish'));
   await click(button(dialog,'Save'));
   expect(api.saveStudyEntry).toHaveBeenCalledWith(expect.any(String),expect.any(Number),
    expect.objectContaining({reflection:'Proved the key step'}));
  }finally{await view.cleanup();}
 });
 it('offers break, resume and a focus accessory while active',async()=>{
  const api=adapter(),view=await render(api);
  try{
   await click(button(view.host,'Start focus'));
   const dialog=view.host.querySelector('dialog')!;
   await click(button(dialog,'Take a break'));
   expect(api.breakStudyEntry).toHaveBeenCalledTimes(1);
   expect(dialog.textContent).toContain('Resume');
   expect(view.host.querySelector('[aria-label="Focus accessory"]')?.textContent).toContain('Focused study');
   await click(button(dialog,'Resume'));
   expect(api.resumeStudyEntry).toHaveBeenCalledTimes(1);
  }finally{await view.cleanup();}
 });
 it('restores paused state and elapsed time from persisted intervals',async()=>{
  const paused=entry('paused');
  const restored=focusFromEntry(paused);
  expect(restored.phase).toBe('paused');
  expect(restored.session?.intervals).toHaveLength(1);
  const api=adapter(paused),view=await render(api);
  try{
   expect(button(view.host,'Return to focus')).toBeDefined();
   expect(view.host.querySelector('[aria-label="Focus accessory"]')?.textContent).toContain('Resume');
   await click(button(view.host,'Return to focus'));
   expect(view.host.querySelector('dialog')?.textContent).toContain('Resume');
  }finally{await view.cleanup();}
 });
 it('Escape closes the native dialog and returns focus to its trigger',async()=>{
  const api=adapter(),view=await render(api);
  try{
   const trigger=button(view.host,'Start focus');
   await click(trigger);
   const dialog=view.host.querySelector('dialog')!;
   expect(dialog.open).toBe(true);
   await act(async()=>{dialog.dispatchEvent(new Event('cancel',{cancelable:true}));});
   expect(dialog.open).toBe(false);
   expect(document.activeElement).toBe(button(view.host,'Return to focus'));
  }finally{await view.cleanup();}
 });
});
