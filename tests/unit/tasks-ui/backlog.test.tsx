import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import TasksPage,{appendTaskPage,movedPosition} from '../../../src/features/tasks/Page';
import V6Header from '../../../src/app/V6Header';
import {setTaskApiForTests} from '../../../src/data/tasks';
import {emptyTaskApi,type TaskRecord,type TaskApi,type TaskPatch} from '../../../src/data/tasks/contract';
import {isFlagOn} from '../../../src/flags';
import {useToast} from '../../../src/ui/Toast';

vi.mock('../../../src/flags',()=>({isFlagOn:vi.fn(()=>true)}));
vi.mock('../../../src/data/hooks',()=>({
 useHome:()=>({data:{pendingProposals:0}}),
 useProjects:()=>({data:[]}),
 useSubjects:()=>({data:[]}),
}));
vi.mock('../../../src/ui/Toast',()=>({useToast:vi.fn()}));

const timestamp='2026-11-06T08:00:00.000Z';
const status=(index:number):TaskRecord['status']=>
 index<25?'backlog':index<35?'in_progress':index<40?'completed':'cancelled';
const task=(index:number):TaskRecord=>({
 id:'task-'+index,title:'Task '+index,body:'',status:status(index),
 position:index,estimateMinutes:index,priority:'normal',
 due:index===0?{kind:'date',date:'2026-11-12'}:{kind:'none'},
 subjectId:null,projectId:null,checkpointId:null,
 completedAt:status(index)==='completed'?timestamp:null,
 createdAt:timestamp,updatedAt:timestamp,version:1,
});
const allStatuses=['backlog','in_progress','completed','cancelled'];
const ordered=(a:TaskRecord,b:TaskRecord)=>
 allStatuses.indexOf(a.status)-allStatuses.indexOf(b.status)||a.position-b.position||a.id.localeCompare(b.id);

let host:HTMLDivElement,root:Root,records:TaskRecord[];
let list:ReturnType<typeof vi.fn>,update:ReturnType<typeof vi.fn>;
let create:ReturnType<typeof vi.fn>,notify:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.mocked(isFlagOn).mockReturnValue(true);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 records=Array.from({length:45},(_,i)=>task(i));
 list=vi.fn(async(query:{limit?:number;cursor?:string|null;status?:string[]}={})=>{
  const items=records.filter(item=>!query.status||query.status.includes(item.status)).sort(ordered);
  const start=Number(query.cursor??0),limit=query.limit??20;
  return {items:items.slice(start,start+limit).map(item=>({...item})),
   total:items.length,nextCursor:start+limit<items.length?String(start+limit):null};
 });
 update=vi.fn(async(id:string,expected:number,patch:TaskPatch)=>{
  const index=records.findIndex(x=>x.id===id);
  if(index<0)throw new Error('Not found');
  if(records[index].version!==expected)throw Object.assign(new Error('Stale version'),{code:'conflict'});
  const before=records[index],nextStatus=patch.status??before.status;
  const changed={...before,...patch,status:nextStatus,version:before.version+1,
   completedAt:nextStatus==='completed'?(before.completedAt??timestamp):null};
  records[index]=changed;
  return {record:{...changed},actionNo:null};
 });
 create=vi.fn(async()=>({record:task(46),actionNo:null}));
 const api:TaskApi={...emptyTaskApi('live'),listTasks:list,updateTask:update,
  getTask:async id=>records.find(x=>x.id===id)??null,
  createTask:create,deleteTask:async id=>({record:{id},actionNo:null})};
 setTaskApiForTests(api);
 notify=vi.fn();vi.mocked(useToast).mockReturnValue(notify);
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,
  value:function(this:HTMLDialogElement){this.open=true;}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,
  value:function(this:HTMLDialogElement){this.open=false;}});
});
afterEach(async()=>{
 await act(async()=>root.unmount());
 host.remove();setTaskApiForTests(null);vi.clearAllMocks();
});
async function render(url='/tasks',withHeader=false){
 await act(async()=>root.render(<MemoryRouter initialEntries={[url]}><Routes>
  <Route path="/" element={withHeader?<V6Header pathname="/"/>:<p>Home route</p>}/>
  <Route path="/tasks" element={<TasksPage/>}/>
 </Routes></MemoryRouter>));
 await act(async()=>{await Promise.resolve();});
}
async function click(label:string){
 const control=[...host.querySelectorAll('button')].find(el=>el.getAttribute('aria-label')===label||el.textContent?.trim()===label);
 if(!control)throw Error('Missing '+label);
 await act(async()=>control.click());
}
async function field(label:string,value:string){
 const control=[...host.querySelectorAll('input,select')].find(el=>el.getAttribute('aria-label')===label)!;
 expect(control).toBeDefined();
 await act(async()=>{
  const p=control instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(p,'value')!.set!.call(control,value);
  control.dispatchEvent(new Event('input',{bubbles:true}));
  control.dispatchEvent(new Event('change',{bubbles:true}));
 });
}
async function submit(){
 await act(async()=>host.querySelector('dialog form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
}

describe('N25.2 v6 Tasks backlog and sheet handoff',()=>{
 it('loads only twenty per opaque cursor and keeps separate status groups and totals',async()=>{
  await render();
  expect(list).toHaveBeenCalledWith({limit:20,status:allStatuses});
  expect(host.querySelectorAll('section[aria-label="Backlog"] li')).toHaveLength(20);
  expect(host.textContent).toContain('20 shown of 45 tasks');
  await click('Show more');
  expect(list).toHaveBeenLastCalledWith({limit:20,status:allStatuses,cursor:'20'});
  expect(host.querySelectorAll('section[aria-label="Backlog"] li')).toHaveLength(25);
  expect(host.querySelectorAll('section[aria-label="In progress"] li')).toHaveLength(10);
  expect(host.querySelectorAll('section[aria-label="Completed"] li')).toHaveLength(5);
  await click('Show more');
  expect(host.querySelectorAll('section[aria-label="Cancelled"] li')).toHaveLength(5);
  expect(host.textContent).toContain('45 shown of 45 tasks');
  expect([...host.querySelectorAll('button')].some(b=>b.textContent?.trim()==='Show more')).toBe(false);
 });
 it('sends versioned complete/reopen and adjacent reorder through updateTask',async()=>{
  await render();
  await click('Complete Task 0');
  expect(update).toHaveBeenCalledWith('task-0',1,{status:'completed'});
  expect(host.querySelector('section[aria-label="Completed"]')?.textContent).toContain('Task 0');
  await click('Reopen Task 0');
  expect(update).toHaveBeenLastCalledWith('task-0',2,{status:'backlog'});
  await click('Move Task 0 down');
  expect(update).toHaveBeenLastCalledWith('task-0',3,expect.objectContaining({position:2}));
  const visible=[...host.querySelectorAll('section[aria-label="Backlog"] li h3')].map(n=>n.textContent);
  expect(visible[0]).toBe('Task 1');
 });
 it('edits the same TaskSheet with existing due date and optimistic version',async()=>{
  await render();
  await click('Edit Task 0');
  expect(host.querySelector('dialog')?.getAttribute('aria-labelledby')).toBeTruthy();
  expect(host.querySelector('dialog')?.textContent).toContain('Edit task');
  expect((host.querySelector('[aria-label="Due type"]') as HTMLSelectElement).value).toBe('date');
  expect((host.querySelector('[aria-label="Due date"]') as HTMLInputElement).value).toBe('2026-11-12');
  await field('Task title','Updated proof');
  await submit();
  expect(update).toHaveBeenCalledWith('task-0',1,expect.objectContaining({
   title:'Updated proof',due:{kind:'date',date:'2026-11-12'},
  }));
  expect(host.querySelector('dialog')).toBeNull();
  expect(host.textContent).toContain('Updated proof');
 });
 it('reloads a stale row and tells the user what changed',async()=>{
  await render();
  update.mockRejectedValueOnce(Object.assign(new Error('Stale version'),{code:'conflict'}));
  records[0]={...records[0],title:'Remote revision',version:4};
  await click('Complete Task 0');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('changed elsewhere');
  expect(host.textContent).toContain('Remote revision');
 });
 it('keeps one Undo toast and shows a separate View in backlog action after creation',async()=>{
  await render('/',true);
  const add=[...host.querySelectorAll('summary')].find(el=>el.textContent?.trim()==='Add')!;
  await act(async()=>add.click());
  await click('Task');
  await act(async()=>{await Promise.resolve();});
  await field('Task title','New path task');
  await submit();
  expect(create).toHaveBeenCalledTimes(1);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(notify.mock.calls[0][1].action.label).toBe('Undo');
  expect(host.querySelector('dialog')).toBeNull();
  const link=[...host.querySelectorAll('a')].find(el=>el.textContent?.includes('View in backlog'))!;
  expect(link?.getAttribute('href')).toBe('/tasks');
  await act(async()=>link.click());
  expect(host.textContent).toContain('20 shown of 45 tasks');
 });
 it('redirects /tasks when v6Shell is off without querying tasks',async()=>{
  vi.mocked(isFlagOn).mockReturnValue(false);
  await render();
  expect(host.textContent).toContain('Home route');
  expect(list).not.toHaveBeenCalled();
 });
 it('deduplicates overlapping page IDs and constrains moves to a single status',()=>{
  const first=task(0),again={...first,title:'Newest'};
  const output=appendTaskPage([first],{items:[again],total:1,nextCursor:null});
  expect(output).toHaveLength(1);
  expect(output[0].title).toBe('Newest');
  expect(movedPosition(task(2),task(1),true)).toBe(0);
  expect(()=>movedPosition(task(0),task(30),false)).toThrow('status');
 });
});
