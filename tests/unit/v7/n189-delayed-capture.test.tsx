import React,{act,type ButtonHTMLAttributes,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import CaptureSheet from '../../../src/app/v7/CaptureSheet';
import {readCapturedTaskDraft,taskInput} from '../../../src/features/tasks/taskDraft';
import type {CaptureKind} from '../../../src/app/v7/captureModel';

const f=vi.hoisted(()=>({zone:undefined as string|undefined,text:'',
 navigate:vi.fn(),createTask:vi.fn(),createBlock:vi.fn()}));
vi.mock('react-router',()=>({useNavigate:()=>f.navigate}));
vi.mock('../../../src/platform/share',()=>({takeCaptureText:()=>f.text}));
vi.mock('../../../src/platform/voice',()=>({useNativeVoice:()=>({available:false})}));
vi.mock('../../../src/app/v7/focus',()=>({useActiveFocus:()=>({entry:null})}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>vi.fn()}));
vi.mock('../../../src/data/hooks',()=>({
 useHome:()=>({data:{projects:[]}}),useSettings:()=>({data:f.zone?{timeZone:f.zone}:undefined}),
}));
vi.mock('../../../src/data/tasks',()=>({getTaskApi:()=>({createTask:f.createTask})}));
vi.mock('../../../src/data/study',()=>({getStudyApi:()=>({createCalendarBlock:f.createBlock})}));
vi.mock('../../../src/ui/v7/components',()=>({
 Sheet:({children,footer}:{children:ReactNode;footer:ReactNode})=><div>{children}{footer}</div>,
 Button:({children,onClick,disabled}:ButtonHTMLAttributes<HTMLButtonElement>)=><button onClick={onClick} disabled={disabled}>{children}</button>,
 Segmented:()=>null,
}));
const deviceZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
const ownerZone=deviceZone==='Asia/Kolkata'?'UTC':'Asia/Kolkata';
const now=new Date('2026-11-09T20:30:00.000Z');
let unmount:(()=>Promise<void>)|undefined;
async function mount(kind:CaptureKind,text:string){
 f.text=text;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const draw=()=>act(async()=>root.render(<CaptureSheet open onClose={()=>{}} initialKind={kind}/>));
 await draw();
 unmount=async()=>{await act(async()=>root.unmount());host.remove();};
 const button=(label:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===label)!;
 const click=(label:string)=>act(async()=>button(label).click());
 return {button,click,loaded:async()=>{f.zone=ownerZone;await draw();}};
}
beforeEach(()=>{
 vi.clearAllMocks();f.zone=undefined;
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now);
 f.createTask.mockResolvedValue({record:{id:'task',version:1}});
 f.createBlock.mockResolvedValue({record:{id:'block',version:1}});
});
afterEach(async()=>{await unmount?.();unmount=undefined;vi.useRealTimers();});
describe('N189: delayed owner settings never bind the device fallback zone',()=>{
 it('saves an unscheduled task immediately, but waits before expanding a draft that may acquire a time',async()=>{
  const ui=await mount('task','Local task');
  expect(ui.button('Add task').disabled).toBe(false);expect(ui.button('More options').disabled).toBe(true);
  await ui.click('More options');expect(f.navigate).not.toHaveBeenCalled();
  await ui.click('Add task');expect(f.createTask).toHaveBeenCalledWith(expect.objectContaining({title:'Local task',due:{kind:'none'}}));
 });
 it('binds the owner zone on expansion even when the task initially has no date',async()=>{
  const ui=await mount('task','Local task');
  await ui.loaded();await ui.click('More options');
  const [path,options]=f.navigate.mock.calls[0];expect(path).toBe('/tasks?new=1');
  const draft=readCapturedTaskDraft(options.state)!;
  expect(draft.zone).toBe(ownerZone);
  expect(taskInput({...draft.values,dueKind:'instant',dueDate:'2026-11-12',dueInstant:'2026-11-12T16:17'},draft.zone).due)
   .toEqual({kind:'instant',at:ownerZone==='UTC'?'2026-11-12T16:17:00.000Z':'2026-11-12T10:47:00.000Z'});
 });
 it.each(['save','expand'] as const)('blocks a bare block until owner settings load: %s',async mode=>{
  const ui=await mount('block','Read');
  expect(ui.button('Add block').disabled).toBe(true);expect(ui.button('More options').disabled).toBe(true);
  await ui.click('Add block');await ui.click('More options');expect(f.createBlock).not.toHaveBeenCalled();expect(f.navigate).not.toHaveBeenCalled();
  await ui.loaded();
  if(mode==='save'){await ui.click('Add block');expect(f.createBlock).toHaveBeenCalledWith(expect.objectContaining({title:'Read',timeZone:ownerZone}));}
  else{await ui.click('More options');expect(f.navigate.mock.calls[0][1].state.calendarBlockDraft).toMatchObject({title:'Read',zone:ownerZone});}
 });
 it('waits before directly saving a timed task; then uses the owner civil day',async()=>{
  const ui=await mount('task','Call at 4pm');
  expect(ui.button('Add task').disabled).toBe(true);await ui.click('Add task');expect(f.createTask).not.toHaveBeenCalled();
  await ui.loaded();await ui.click('Add task');
  expect(f.createTask).toHaveBeenCalledWith(expect.objectContaining({due:{kind:'instant',at:ownerZone==='UTC'?'2026-11-09T16:00:00.000Z':'2026-11-10T10:30:00.000Z'}}));
 });
});
