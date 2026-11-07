import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import FocusNotes from '../../../src/features/focus/FocusNotes';
import {setThoughtApiForTests} from '../../../src/data/parked-thoughts';
import {setStudyEventApiForTests} from '../../../src/data/study-events';
import type {ThoughtApi} from '../../../src/data/parked-thoughts/contract';
import type {StudyEventApi} from '../../../src/data/study-events/contract';

const ENTRY='11111111-1111-4111-8111-111111111111';
const receipt=<T,>(record:T)=>({record,actionNo:null});
let saved:{entryId:string;text:string}[]=[];
let recorded:{entryId:string;kind:string;durationMinutes?:number|null}[]=[];
const thought=():ThoughtApi=>({
 mode:'demo',listThoughts:vi.fn(async()=>({items:[],total:0,nextCursor:null})),
 getThought:vi.fn(async()=>null),
 createThought:vi.fn(async(input)=>{saved.push({entryId:input.studyEntryId!,text:input.text});return receipt({} as never)}),
 editThought:vi.fn(async()=>{throw Error('not used')}),dismissThought:vi.fn(async()=>{throw Error('not used')}),
 reopenThought:vi.fn(async()=>{throw Error('not used')}),deleteThought:vi.fn(async()=>{throw Error('not used')}),
 convertToTask:vi.fn(async()=>{throw Error('not used')}),
});
const events=():StudyEventApi=>({
 mode:'demo',
 listEvents:vi.fn(async()=>({items:[],total:4,nextCursor:null})),
 getEvent:vi.fn(async()=>null),
 recordEvent:vi.fn(async(input)=>{recorded.push({...input});return receipt({} as never)}),
 editEvent:vi.fn(async()=>{throw Error('not used')}),
 voidEvent:vi.fn(async()=>{throw Error('not used')}),
 restoreEvent:vi.fn(async()=>{throw Error('not used')}),
});
async function render(){
 const host=document.createElement('div');document.body.append(host);
 const root=createRoot(host);
 await act(async()=>{root.render(<FocusNotes entryId={ENTRY}/>);});
 return {host,root,async cleanup(){await act(async()=>root.unmount());host.remove()}};
}
const button=(host:ParentNode,text:string)=>{
 const match=Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.trim()===text);
 if(!match)throw Error('Missing button '+text);return match;
};
async function click(el:HTMLElement){await act(async()=>el.click())}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 saved=[];recorded=[];
 setThoughtApiForTests(thought());setStudyEventApiForTests(events());
});
afterEach(()=>{setThoughtApiForTests(null);setStudyEventApiForTests(null)});
describe('N71 parked thoughts and drift preserve live focus time',()=>{
 it('displays the durable notice count, and links parked thought without pausing the timer',async()=>{
  const view=await render();
  try{
   await vi.waitFor(()=>expect(view.host.querySelector('output')?.textContent).toBe('4'));
   await click(button(view.host,'Park a thought'));
   const dialog=view.host.querySelector('dialog')!;
   expect(dialog.open).toBe(true);
   const input=dialog.querySelector('textarea')!;
   await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'Review the edge case');
    input.dispatchEvent(new Event('input',{bubbles:true}));
   });
   await click(button(dialog,'Park thought'));
   expect(saved).toEqual([{entryId:ENTRY,text:'Review the edge case'}]);
   expect(view.host.querySelector('dialog')).toBeNull();
   expect(view.host.textContent).toContain('Thought parked for later');
  }finally{await view.cleanup()}
 });
 it('records positive whole drift minutes, never makes a time deduction',async()=>{
  const view=await render();
  try{
   await click(button(view.host,'I drifted'));
   const input=view.host.querySelector('input[type=number]')!;
   await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'7');
    input.dispatchEvent(new Event('input',{bubbles:true}));
   });
   await click(button(view.host,'Record drift'));
   expect(recorded).toEqual([{entryId:ENTRY,kind:'drift',durationMinutes:7}]);
   expect(view.host.textContent).toContain('Focus minutes are unchanged');
   await click(button(view.host,'I drifted'));
   const field=view.host.querySelector('input[type=number]')!;
   await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,'0');
    field.dispatchEvent(new Event('input',{bubbles:true}));
   });
   await click(button(view.host,'Record drift'));
   expect(recorded).toHaveLength(1);
  }finally{await view.cleanup()}
 });
 it('Escape cancels a native dialog without writing and restores the actions',async()=>{
  const view=await render();
  try{
   await click(button(view.host,'Park a thought'));
   await act(async()=>view.host.querySelector('dialog')!.dispatchEvent(
    new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
   expect(view.host.querySelector('dialog')).toBeNull();
   expect(saved).toHaveLength(0);
   expect(button(view.host,'Park a thought')).toBeDefined();
  }finally{await view.cleanup()}
 });
 it('reloads notices from the persisted study-event API on remount',async()=>{
  const one=await render();
  await vi.waitFor(()=>expect(one.host.querySelector('output')?.textContent).toBe('4'));
  await one.cleanup();
  const two=await render();
  try{await vi.waitFor(()=>expect(two.host.querySelector('output')?.textContent).toBe('4'))}
  finally{await two.cleanup()}
 });
});
