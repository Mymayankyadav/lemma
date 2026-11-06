import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import V6Header from '../../../src/app/V6Header';
import TaskSheet,{taskInput} from '../../../src/features/tasks/TaskSheet';
import {setTaskApiForTests} from '../../../src/data/tasks';
import {emptyTaskApi,type TaskRecord} from '../../../src/data/tasks/contract';
import {useToast} from '../../../src/ui/Toast';

vi.mock('../../../src/data/hooks',()=>({
 useHome:()=>({data:{pendingProposals:0}}),
 useProjects:()=>({data:[{id:'project-analysis',title:'Real Analysis',status:'active'}]}),
 useSubjects:()=>({data:[{id:'subject-analysis',name:'Analysis'}]}),
}));
vi.mock('../../../src/ui/Toast',()=>({useToast:vi.fn()}));

const record:TaskRecord={
 id:'created-task',title:'Review the proof',body:'',status:'backlog',
 estimateMinutes:25,priority:'high',due:{kind:'none'},position:0,
 completedAt:null,createdAt:'2026-11-06T08:00:00Z',updatedAt:'2026-11-06T08:00:00Z',
 version:1,subjectId:null,projectId:null,checkpointId:null,
};
const saved=()=>({record:{...record},actionNo:null});
let host:HTMLDivElement,root:Root,notify:ReturnType<typeof vi.fn>;
let create:ReturnType<typeof vi.fn>,remove:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 notify=vi.fn();vi.mocked(useToast).mockReturnValue(notify);
 create=vi.fn(async()=>saved());remove=vi.fn(async()=>({record:{id:record.id},actionNo:null}));
 setTaskApiForTests({...emptyTaskApi('live'),createTask:create,deleteTask:remove});
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});
});
afterEach(async()=>{await act(async()=>{root.unmount();});host.remove();setTaskApiForTests(null);vi.clearAllMocks();});

async function renderHeader(){
 await act(async()=>{root.render(<MemoryRouter><V6Header pathname="/"/></MemoryRouter>);});
}
async function click(node:HTMLElement){await act(async()=>node.click());}
function button(label:string,scope:ParentNode=host){
 const result=[...scope.querySelectorAll('button')].find(node=>node.textContent?.trim()===label);
 if(!result)throw Error('Missing button '+label);
 return result;
}
async function openSheet(){
 const add=[...host.querySelectorAll('summary')].find(node=>node.textContent?.trim()==='Add')!;
 expect(add).toBeDefined();
 await click(add);
 expect(host.textContent).toContain('New path');
 await click(button('Task'));
 await act(async()=>{await Promise.resolve();});
 const dialog=host.querySelector('dialog');
 expect(dialog?.open).toBe(true);
 return {dialog:dialog!,add};
}
async function setField(label:string,value:string){
 const control=[...host.querySelectorAll('input,select')].find(node=>node.getAttribute('aria-label')===label);
 if(!control)throw Error('Missing field '+label);
 await act(async()=>{
  const proto=control instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(control,value);
  control.dispatchEvent(new Event('input',{bubbles:true}));
  control.dispatchEvent(new Event('change',{bubbles:true}));
 });
}
async function submit(){
 const form=host.querySelector('dialog form')!;
 await act(async()=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
}

describe('N25.1 task sheet',()=>{
 it('preserves New path and creates a task from the shared flag-on Add menu',async()=>{
  await renderHeader();
  const {dialog}=await openSheet();
  expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
  await setField('Task title',' Review the proof ');
  await setField('Estimate minutes','25');
  await setField('Task priority','high');
  await setField('Task subject','subject-analysis');
  await setField('Task path','project-analysis');
  await submit();
  expect(create).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledWith(expect.objectContaining({
   title:'Review the proof',estimateMinutes:25,priority:'high',due:{kind:'none'},
   subjectId:'subject-analysis',projectId:'project-analysis',
  }));
  expect(host.querySelector('dialog')).toBeNull();
  expect(notify).toHaveBeenCalledTimes(1);
  expect(notify.mock.calls[0][0]).toBe('Task saved');
 });
 it('rejects empty titles, invalid estimates and missing dates without calling TaskApi',async()=>{
  await renderHeader();
  await openSheet();
  await submit();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Enter a task title');
  expect(create).not.toHaveBeenCalled();
  await setField('Task title','  Plan study  ');
  await setField('Estimate minutes','-1');
  await submit();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('whole minutes');
  expect(create).not.toHaveBeenCalled();
  await setField('Estimate minutes','');
  await setField('Due type','date');
  await submit();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('due date');
  expect(create).not.toHaveBeenCalled();
 });
 it('keeps civil dates separate from time instants and rejects daylight-gap shifts',()=>{
  const base={title:'Study',estimate:'',priority:'normal' as const,dueKind:'date' as const,
   dueDate:'2026-11-08',dueInstant:'',subjectId:'',projectId:''};
  expect(taskInput(base).due).toEqual({kind:'date',date:'2026-11-08'});
  expect(taskInput({...base,dueKind:'instant',dueInstant:'2026-11-08T16:30'}).due)
   .toMatchObject({kind:'instant',at:expect.stringMatching(/T/)});
  expect(()=>taskInput({...base,dueDate:'2026-02-30'})).toThrow('valid due date');
  expect(()=>taskInput({...base,dueKind:'instant',dueInstant:'nonsense'})).toThrow('valid local');
 });
 it('offers one Undo on a successful save and deletes only the returned version',async()=>{
  await renderHeader();
  await openSheet();
  await setField('Task title','Undo me');
  await submit();
  expect(notify).toHaveBeenCalledTimes(1);
  const options=notify.mock.calls[0][1] as {action:{label:string;onClick:()=>void}};
  expect(options.action.label).toBe('Undo');
  await act(async()=>{options.action.onClick();await Promise.resolve();});
  expect(remove).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith(record.id,record.version);
 });
 it('keeps the native dialog open on save failure, with no success or Undo toast',async()=>{
  create.mockRejectedValueOnce(new Error('Server unavailable'));
  await renderHeader();
  await openSheet();
  await setField('Task title','Retryable task');
  await submit();
  expect(host.querySelector('dialog')?.open).toBe(true);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Server unavailable');
  expect(notify).not.toHaveBeenCalled();
 });
 it('restores focus to the Add trigger on Escape and Cancel',async()=>{
  await renderHeader();
  const {dialog,add}=await openSheet();
  await act(async()=>{dialog.dispatchEvent(new Event('cancel',{bubbles:true,cancelable:true}));await Promise.resolve();});
  expect(host.querySelector('dialog')).toBeNull();
  expect(document.activeElement).toBe(add);
  await openSheet();
  await click(button('Cancel'));
  await act(async()=>{await Promise.resolve();});
  expect(host.querySelector('dialog')).toBeNull();
  expect(document.activeElement).toBe(add);
 });
 it('disables additional submits while the first save is in flight',async()=>{
  let resolve!: (value:ReturnType<typeof saved>)=>void;
  create.mockImplementation(()=>new Promise(done=>{resolve=done;}));
  await renderHeader();
  await openSheet();
  await setField('Task title','Single write');
  const form=host.querySelector('dialog form')!;
  await act(async()=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await act(async()=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  expect(create).toHaveBeenCalledTimes(1);
  await act(async()=>{resolve(saved());await Promise.resolve();});
  expect(host.querySelector('dialog')).toBeNull();
 });
});
