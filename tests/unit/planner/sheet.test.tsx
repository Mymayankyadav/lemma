import {describe,expect,it} from 'vitest';
import {selectPlannerPlacements} from '../../../src/features/planner/selection';
import type {PlannerResult} from '../../../src/features/planner/model';

const preview:PlannerResult={
 placements:[
  {taskId:'task-a',date:'2026-11-09',start:'2026-11-09T09:00:00Z',
   end:'2026-11-09T09:30:00Z',minutes:30,part:1},
  {taskId:'task-b',date:'2026-11-09',start:'2026-11-09T09:45:00Z',
   end:'2026-11-09T10:15:00Z',minutes:30,part:1},
 ],
 days:[],unplaced:[{taskId:'task-c',estimateMinutes:45,reason:'no_capacity',
  availabilityKnown:true,suggestion:'move_to_next_free_day'}],
 placedTaskIds:['task-a','task-b']
};
describe('N68 owner-directed preview selection',()=>{
 it('keeps deselected work and genuinely unplaced tasks with reasons',()=>{
  const result=selectPlannerPlacements(preview,new Set(['task-a']));
  expect(result.selected.map(x=>x.taskId)).toEqual(['task-a']);
  expect(result.unplaced).toEqual([
   {taskId:'task-c',reason:'no_capacity'},
   {taskId:'task-b',reason:'Deselected by owner'},
  ]);
 });
 it('supports a nonoverlapping time move without mutating preview',()=>{
  const moved=selectPlannerPlacements(preview,new Set(['task-a','task-b']),
   new Map([['task-b:1',{date:'2026-11-10',
    start:'2026-11-10T10:00:00Z',end:'2026-11-10T10:30:00Z'}]]));
  expect(moved.selected[1].date).toBe('2026-11-10');
  expect(preview.placements[1].date).toBe('2026-11-09');
  expect(moved.unplaced).toEqual([{taskId:'task-c',reason:'no_capacity'}]);
 });
 it('moving a placement does not silently resize its allotted focus minutes',()=>{
  expect(()=>selectPlannerPlacements(preview,new Set(['task-a']),new Map([
   ['task-a:1',{date:'2026-11-09',
    start:'2026-11-09T10:00:00Z',end:'2026-11-09T10:45:00Z'}],
  ]))).toThrow('Moved planner interval must preserve its allocated minutes');
  expect(()=>selectPlannerPlacements(preview,new Set(['task-a']),new Map([
   ['task-a:1',{date:'2026-11-09',
    start:'2026-11-09T10:00:00Z',end:'2026-11-09T10:30:00Z'}],
  ]))).not.toThrow();
 });
 it('refuses overlaps, invalid instants and silent drops',()=>{
  const all=new Set(['task-a','task-b']);
  expect(()=>selectPlannerPlacements(preview,all,new Map([
   ['task-b:1',{date:'2026-11-09',
    start:'2026-11-09T09:15:00Z',end:'2026-11-09T09:45:00Z'}],
  ]))).toThrow(/overlap/);
  expect(()=>selectPlannerPlacements(preview,all,new Map([
   ['task-a:1',{date:'2026-11-09',start:'not-a-date',end:'2026-11-09T10:00:00Z'}],
  ]))).toThrow(/Invalid moved/);
  expect(selectPlannerPlacements(preview,new Set()).unplaced).toHaveLength(3);
 });
});

describe('N68 multi-part selection and invalid preview inputs',()=>{
 it('rejects a moved interval ending before it begins without changing source',()=>{
  expect(()=>selectPlannerPlacements(preview,new Set(['task-a']),new Map([
   ['task-a:1',{date:'2026-11-09',start:'2026-11-09T12:00:00Z',
    end:'2026-11-09T11:00:00Z'}],
  ]))).toThrow('Invalid moved planner interval');
  expect(preview.placements[0].start).toBe('2026-11-09T09:00:00Z');
 });
});

import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterAll,beforeAll,vi} from 'vitest';
import PlannerLaunch from '../../../src/features/planner/Sheet';

const services=vi.hoisted(()=>({
 tasks:vi.fn(),getTask:vi.fn(),blocks:vi.fn(),entries:vi.fn(),plans:vi.fn(),
  commitPlacements:vi.fn(async()=>({actionNo:41,record:{plans:[],blockIds:[]}})),
  undoPlacements:vi.fn(async()=>undefined),notify:vi.fn(),
}));
vi.mock('../../../src/data/tasks',()=>({
 getTaskApi:()=>({listTasks:services.tasks,getTask:services.getTask}),
}));
vi.mock('../../../src/data/study',()=>({
 getStudyApi:()=>({listCalendarBlocks:services.blocks,
  listStudyEntries:services.entries}),
}));
vi.mock('../../../src/data/day-plans',()=>({
 getDayPlanApi:()=>({listPlans:services.plans,
   commitPlacements:services.commitPlacements,undoPlacements:services.undoPlacements}),
}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>services.notify}));
// N121 B8: the planner never offers a slot before now. These UI cases plan 7–10 Nov,
// so the clock is fixed before them (only Date is faked; timers and promises stay real).
beforeAll(()=>{vi.useFakeTimers({toFake:['Date'],now:new Date('2026-11-06T00:00:00Z')});});
afterAll(()=>{vi.useRealTimers();});

describe('N68 v6 native Planner launch lifecycle',()=>{
 it('does not create a dialog before opening, and removes it after close',async()=>{
  services.tasks.mockResolvedValue({items:[],total:0,nextCursor:null});
  services.blocks.mockResolvedValue([]);
  services.entries.mockResolvedValue([]);
  services.plans.mockResolvedValue({items:[],total:0,nextCursor:null});
  const host=document.createElement('div');document.body.append(host);
  const root:Root=createRoot(host);
  try{
   await act(async()=>root.render(<PlannerLaunch date="2026-11-07" zone="UTC"/>));
   expect(host.querySelector('dialog')).toBeNull();
   const launch=host.querySelector<HTMLButtonElement>('button');
   await act(async()=>launch?.click());
   await vi.waitFor(()=>expect(host.querySelector('dialog')).not.toBeNull());
   const close=[...host.querySelectorAll<HTMLButtonElement>('button')]
    .find(x=>x.getAttribute('aria-label')==='Close');
   await act(async()=>close?.click());
   expect(host.querySelector('dialog')).toBeNull();
  }finally{
   await act(async()=>root.unmount());host.remove();
  }
 });
});

describe('N68 planner commit pending dialog safety',()=>{
 it('prevents Escape/Close and editing placements while an owner write is in flight',async()=>{
  const task={id:'task-a',title:'Proof practice',version:1,priority:'normal',
   due:{kind:'none'},estimateMinutes:30,status:'backlog'};
  services.tasks.mockResolvedValue({items:[task],total:1,nextCursor:null});
  services.blocks.mockResolvedValue([]);services.entries.mockResolvedValue([]);
  services.plans.mockResolvedValue({items:[],total:0,nextCursor:null});
  let finishRead:(task:unknown)=>void=()=>{};
  services.getTask.mockImplementationOnce(()=>new Promise(resolve=>{
   finishRead=resolve as (task:unknown)=>void;
  }));
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  try{
   await act(async()=>root.render(<PlannerLaunch date="2026-11-09" zone="UTC"/>));
   await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
   await vi.waitFor(()=>expect(host.querySelector('[aria-label="Planner preview"]')).not.toBeNull());
   const commit=[...host.querySelectorAll<HTMLButtonElement>('button')]
    .find(b=>b.textContent==='Add 1 block to calendar')!;
   await act(async()=>commit.click());
   const close=[...host.querySelectorAll<HTMLButtonElement>('button')]
    .find(b=>b.getAttribute('aria-label')==='Close')!;
   expect(close.disabled).toBe(true);
   expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(true);
   expect(host.querySelector<HTMLInputElement>('input[aria-label^="Move "]')?.disabled).toBe(true);
   const cancel=new Event('cancel',{bubbles:false,cancelable:true});
   await act(async()=>host.querySelector('dialog')!.dispatchEvent(cancel));
   expect(cancel.defaultPrevented).toBe(true);
   expect(host.querySelector('dialog')).not.toBeNull();
   await act(async()=>finishRead(task));
  }finally{await act(async()=>root.unmount());host.remove();}
 });
});

describe('N68 split placement choices',()=>{
 it('can deselect one part without dropping a separately selected part',()=>{
  const split:PlannerResult={...preview,placements:[
   {taskId:'split',date:'2026-11-09',start:'2026-11-09T09:00:00Z',
    end:'2026-11-09T09:30:00Z',minutes:30,part:1},
   {taskId:'split',date:'2026-11-09',start:'2026-11-09T10:00:00Z',
    end:'2026-11-09T10:30:00Z',minutes:30,part:2},
  ],unplaced:[],placedTaskIds:['split']};
  const chosen=selectPlannerPlacements(split,new Set(['split:2']));
  expect(chosen.selected).toEqual([split.placements[1]]);
  expect(chosen.unplaced).toEqual([{taskId:'split',reason:'Deselected by owner'}]);
 });
});

import {validatePlannerWindow} from '../../../src/features/planner/selection';
describe('N68 moved placement owner-day and busy-block guard',()=>{
 const moved=[{taskId:'task-a',date:'2026-11-09',
  start:'2026-11-09T10:00:00Z',end:'2026-11-09T10:30:00Z',
  minutes:30,part:1}];
 const window=()=>validatePlannerWindow(moved,[],'2026-11-09',
  '2026-11-09','UTC');
 it('accepts an available placement on the owner date',()=>{
  expect(window).not.toThrow();
 });
 it('rejects placements moved out of the selected range or across midnight',()=>{
  expect(()=>validatePlannerWindow(moved,[],'2026-11-10',
   '2026-11-10','UTC')).toThrow(/chosen owner-local/);
  expect(()=>validatePlannerWindow(moved,[],'2026-11-09',
   '2026-11-09','Pacific/Kiritimati')).toThrow(/chosen owner-local/);
  expect(()=>validatePlannerWindow([{...moved[0],end:'2026-11-10T00:00:01Z'}],
   [],'2026-11-09','2026-11-09','UTC')).toThrow(/chosen owner-local/);
 });
 it('refuses overlapping selected intervals even if UI selection checks are bypassed',()=>{
  expect(()=>validatePlannerWindow([
   ...moved,{...moved[0],taskId:'task-b',
    start:'2026-11-09T10:15:00Z',end:'2026-11-09T10:45:00Z'},
  ],[],'2026-11-09','2026-11-09','UTC'))
   .toThrow('Selected planner placements overlap each other');
 });
 it('also rejects a resized block supplied directly to commit preflight',()=>{
  expect(()=>validatePlannerWindow([
   {...moved[0],end:'2026-11-09T10:45:00Z'},
  ],[],'2026-11-09','2026-11-09','UTC'))
   .toThrow('Selected planner interval changed its allocated minutes');
 });
 it('rejects clashes with a busy or study block but ignores cancelled blocks',()=>{
  const active={startsAt:'2026-11-09T10:15:00Z',
   endsAt:'2026-11-09T10:45:00Z',status:'planned'};
  expect(()=>validatePlannerWindow(moved,[active],'2026-11-09',
   '2026-11-09','UTC')).toThrow(/overlaps/);
  expect(()=>validatePlannerWindow(moved,[{...active,status:'done'}],
   '2026-11-09','2026-11-09','UTC')).toThrow(/overlaps/);
  expect(()=>validatePlannerWindow(moved,[{...active,status:'cancelled'}],
   '2026-11-09','2026-11-09','UTC')).not.toThrow();
 });
});


import {commitPlannerSelection,savedFocusSignature,PlannerCommitError,
 type PlannerCommitApis,type PlannerCommitSnapshot} from '../../../src/features/planner/commit';
import {DayPlanError} from '../../../src/data/day-plans/contract';
import type {TaskRecord} from '../../../src/data/tasks/contract';
import type {StudyEntryRecord} from '../../../src/data/study/contract';
const makeTask=(id:string,version=1)=>({id,version,title:'Learn '+id}) as TaskRecord;
const OP='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function commitFixture(){
 const apis={
  tasks:{getTask:vi.fn(async(id:string)=>makeTask(id))},
  study:{
   listCalendarBlocks:vi.fn(async()=>[]),
   listStudyEntries:vi.fn(async()=>[]),
  },
  plans:{
   listPlans:vi.fn(async()=>({items:[],total:0,nextCursor:null})),
   commitPlacements:vi.fn(async()=>({actionNo:41,record:{plans:[],blockIds:['b1','b2']}})),
  },
 } as unknown as PlannerCommitApis;
 const selection={selected:[
  {taskId:'task-a',part:1,date:'2026-11-09',start:'2026-11-09T09:00:00Z',
   end:'2026-11-09T09:30:00Z',minutes:30},
  {taskId:'task-b',part:1,date:'2026-11-10',start:'2026-11-10T09:00:00Z',
   end:'2026-11-10T09:30:00Z',minutes:30},
 ],unplaced:[{taskId:'task-c',reason:'no_capacity'}]};
 const snapshot:PlannerCommitSnapshot={
  from:'2026-11-09',through:'2026-11-10',zone:'UTC',
  tasks:[makeTask('task-a'),makeTask('task-b'),makeTask('task-c')],
  entries:[],blocks:[],selection,
 };
 const sent=()=>vi.mocked(apis.plans.commitPlacements).mock.calls[0]?.[0];
 return {apis,snapshot,sent};
}
describe('N68 single atomic commit (N107)',()=>{
 it('sends every selected day in ONE commitPlacements call with captured versions and returns its action',async()=>{
  const f=commitFixture();
  const result=await commitPlannerSelection(f.snapshot,f.apis,OP);
  expect(f.apis.plans.commitPlacements).toHaveBeenCalledTimes(1);
  expect(result).toEqual({committedDays:['2026-11-09','2026-11-10'],actionNo:41});
  const input=f.sent()!;
  expect(input.operationId).toBe(OP);
  expect(input.days.map(d=>d.planDate)).toEqual(['2026-11-09','2026-11-10']);
  expect(input.days[0].placements).toEqual([{taskId:'task-a',title:'Learn task-a',
   startsAt:'2026-11-09T09:00:00Z',endsAt:'2026-11-09T09:30:00Z',position:0}]);
  expect(input.days[0].unplaced).toEqual([{taskId:'task-c',reason:'no_capacity',position:1}]);
  expect(input.days[1].unplaced).toEqual([]);
  expect(input.days[0].sources).toEqual(expect.arrayContaining([
   {resource:'tasks',id:'task-a',version:1},{resource:'tasks',id:'task-c',version:1}]));
 });
 it('reuses a draft or previewed plan with its exact version and refuses a committed day before writing',async()=>{
  const f=commitFixture();
  vi.mocked(f.apis.plans.listPlans).mockResolvedValue({items:[
   {id:'plan-9',planDate:'2026-11-09',status:'previewed',version:4}],total:1,nextCursor:null} as never);
  await commitPlannerSelection(f.snapshot,f.apis,OP);
  expect(f.sent()!.days[0]).toMatchObject({planId:'plan-9',expectedVersion:4});
  const g=commitFixture();
  vi.mocked(g.apis.plans.listPlans).mockResolvedValue({items:[
   {id:'plan-10',planDate:'2026-11-10',status:'committed',version:2}],total:1,nextCursor:null} as never);
  await expect(commitPlannerSelection(g.snapshot,g.apis,OP)).rejects.toThrow(
   'An already committed day plan exists on 2026-11-10');
  expect(g.apis.plans.commitPlacements).not.toHaveBeenCalled();
 });
 it('captures existing calendar blocks and saved focus entries as sources for the server to recheck',async()=>{
  const f=commitFixture();
  const busy={id:'busy-1',version:3,kind:'busy',status:'planned',
   startsAt:'2026-11-09T12:00:00Z',endsAt:'2026-11-09T13:00:00Z'};
  const saved={id:'entry-1',version:2,status:'saved',intervals:[{id:'i1',kind:'focus',
   start:'2026-11-09T14:00:00Z',end:'2026-11-09T14:30:00Z'}]} as unknown as StudyEntryRecord;
  f.snapshot.blocks=[busy as never];f.snapshot.entries=[saved];
  vi.mocked(f.apis.study.listCalendarBlocks).mockResolvedValue([busy as never]);
  vi.mocked(f.apis.study.listStudyEntries).mockResolvedValue([saved]);
  await commitPlannerSelection(f.snapshot,f.apis,OP);
  for(const day of f.sent()!.days)expect(day.sources).toEqual(expect.arrayContaining([
   {resource:'calendar_blocks',id:'busy-1',version:3},
   {resource:'study_entries',id:'entry-1',version:2}]));
 });
 it('refuses stale tasks, changed calendars and new saved focus before calling the server',async()=>{
  const stale=commitFixture();
  vi.mocked(stale.apis.tasks.getTask).mockResolvedValueOnce(makeTask('task-a',2));
  await expect(commitPlannerSelection(stale.snapshot,stale.apis,OP)).rejects.toThrow('Task changed since preview');
  const cal=commitFixture();
  vi.mocked(cal.apis.study.listCalendarBlocks).mockResolvedValue([{id:'new',version:1} as never]);
  await expect(commitPlannerSelection(cal.snapshot,cal.apis,OP)).rejects.toThrow('Calendar changed since preview');
  const focus=commitFixture();
  vi.mocked(focus.apis.study.listStudyEntries).mockResolvedValue([{id:'e',version:1,status:'saved',
   intervals:[{id:'i',kind:'focus',start:'2026-11-09T07:00:00Z',end:'2026-11-09T07:30:00Z'}]} as never]);
  await expect(commitPlannerSelection(focus.snapshot,focus.apis,OP)).rejects.toThrow('Saved focus time changed');
  for(const f of [stale,cal,focus])expect(f.apis.plans.commitPlacements).not.toHaveBeenCalled();
 });
 it('reports a typed server refusal as nothing written, and a transport failure as uncertain',async()=>{
  const f=commitFixture();
  vi.mocked(f.apis.plans.commitPlacements).mockRejectedValueOnce(
   new DayPlanError('conflict','Atomic planner source/version conflict'));
  await expect(commitPlannerSelection(f.snapshot,f.apis,OP)).rejects.toMatchObject({
   uncertain:false,message:expect.stringContaining('Nothing was written')});
  const g=commitFixture();
  vi.mocked(g.apis.plans.commitPlacements).mockRejectedValueOnce(Error('Failed to fetch'));
  const error=await commitPlannerSelection(g.snapshot,g.apis,OP).catch(e=>e);
  expect(error).toBeInstanceOf(PlannerCommitError);
  expect(error.uncertain).toBe(true);
  expect(error.message).toContain('may or may not have been saved');
 });
 it('requires at least one selected placement and keeps the saved-focus signature order-stable',async()=>{
  const f=commitFixture();f.snapshot.selection.selected=[];
  await expect(commitPlannerSelection(f.snapshot,f.apis,OP)).rejects.toThrow('Choose at least one placement');
  const a={id:'a',version:1,status:'saved',intervals:[{id:'1',kind:'focus',start:'x',end:'y'}]};
  const b={id:'b',version:1,status:'saved',intervals:[{id:'1',kind:'focus',start:'x',end:'y'}]};
  expect(savedFocusSignature([a,b] as never)).toBe(savedFocusSignature([b,a] as never));
 });
});

describe('N68 stale planner preview isolation',()=>{
 it('discards an old failed request after the owner closes and reopens the dialog',async()=>{
  services.tasks.mockReset();
  let rejectOld:(error:Error)=>void=()=>{};
  services.tasks.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{rejectOld=reject;}));
  services.tasks.mockResolvedValue({items:[],total:0,nextCursor:null});
  services.blocks.mockResolvedValue([]);
  services.entries.mockResolvedValue([]);
  services.plans.mockResolvedValue({items:[],total:0,nextCursor:null});
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  try{
   await act(async()=>root.render(<PlannerLaunch date="2026-11-07" zone="UTC"/>));
   await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
   const close=[...host.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='Close');
   await act(async()=>close!.click());
   await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
   await vi.waitFor(()=>expect(host.querySelector('[aria-label="Planner preview"]')).not.toBeNull());
   await act(async()=>rejectOld(Error('Stale offline response')));
   expect(host.querySelector('[aria-label="Planner preview"]')).not.toBeNull();
   expect(host.textContent).not.toContain('Stale offline response');
   const picker=host.querySelector<HTMLSelectElement>('select')!;
   await act(async()=>{
    const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!;
    setter.call(picker,'2');picker.dispatchEvent(new Event('change',{bubbles:true}));
   });
   // N121 B8: changing Days reloads a fresh preview at once (no Refresh button), never reusing the old one.
   await vi.waitFor(()=>expect(services.tasks).toHaveBeenCalledTimes(3));
   expect(host.textContent).not.toContain('Stale offline response');
  }finally{
   await act(async()=>root.unmount());host.remove();
  }
 });
 it('rejects a repeated cursor before looping through hundreds of stale tasks',async()=>{
  services.tasks.mockReset();
  services.tasks.mockResolvedValue({items:[],total:1,nextCursor:'repeated'});
  services.blocks.mockResolvedValue([]);
  services.entries.mockResolvedValue([]);
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  try{
   await act(async()=>root.render(<PlannerLaunch date="2026-11-07" zone="UTC"/>));
   await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
   await vi.waitFor(()=>expect(host.querySelector('[role="alert"]')?.textContent)
    .toContain('Repeated owner task cursor'));
   expect(services.tasks.mock.calls.length).toBeLessThan(10);
  }finally{
   await act(async()=>root.unmount());host.remove();
  }
 });
});


describe('N68 Calendar owner date navigation',()=>{

 it('preserves the new day commit lock when the old day fails late',async()=>{
  services.tasks.mockReset();services.getTask.mockReset();
  const task={id:'task-a',title:'Proof practice',version:1,priority:'normal',
   due:{kind:'none'},estimateMinutes:30,status:'backlog'};
  services.tasks.mockResolvedValue({items:[task],total:1,nextCursor:null});
  services.blocks.mockResolvedValue([]);services.entries.mockResolvedValue([]);
  services.plans.mockResolvedValue({items:[],total:0,nextCursor:null});
  let rejectOld:(e:Error)=>void=()=>{},finishNew:(x:unknown)=>void=()=>{};
  services.getTask.mockImplementationOnce(()=>new Promise((_res,rej)=>{rejectOld=rej;}))
   .mockImplementationOnce(()=>new Promise(resolve=>{finishNew=resolve;}));
  services.commitPlacements.mockResolvedValue({record:{plans:[{id:'plan-new',version:3,status:'committed'}],blockIds:['block-new']},actionNo:14});
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  const commit=()=>[...host.querySelectorAll<HTMLButtonElement>('button')]
   .find(b=>b.textContent==='Add 1 block to calendar'||b.textContent==='Saving…');
  try{
   await act(async()=>root.render(<PlannerLaunch date="2026-11-09" zone="UTC"/>));
   await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
   await vi.waitFor(()=>expect(host.querySelector('[aria-label="Planner preview"]')).not.toBeNull());
   await act(async()=>commit()!.click());
   await vi.waitFor(()=>expect(services.getTask).toHaveBeenCalledTimes(1));
   await act(async()=>root.render(<PlannerLaunch date="2026-11-10" zone="UTC"/>));
   await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
   await vi.waitFor(()=>expect(host.querySelector('[aria-label="Planner preview"]')).not.toBeNull());
   await act(async()=>commit()!.click());
   await vi.waitFor(()=>expect(services.getTask).toHaveBeenCalledTimes(2));
   await act(async()=>rejectOld(Error('Earlier date rejected')));
   const close=[...host.querySelectorAll<HTMLButtonElement>('button')]
    .find(b=>b.getAttribute('aria-label')==='Close')!;
   expect(close.disabled).toBe(true);
   expect(commit()?.textContent).toBe('Saving…');
   expect(host.textContent).not.toContain('Earlier date rejected');
   await act(async()=>finishNew(task));
   await vi.waitFor(()=>expect(services.commitPlacements).toHaveBeenCalledTimes(1));
   expect(host.querySelector('dialog')).toBeNull();
  }finally{await act(async()=>root.unmount());host.remove();}
 });
 it('does not dismiss a fresh A dialog on an older A commit after A-B-A navigation',async()=>{
  services.tasks.mockReset();services.getTask.mockReset();
  const task={id:'task-a',title:'Proof practice',version:1,priority:'normal',
   due:{kind:'none'},estimateMinutes:30,status:'backlog'};
  services.tasks.mockResolvedValue({items:[task],total:1,nextCursor:null});
  services.blocks.mockResolvedValue([]);services.entries.mockResolvedValue([]);
  services.plans.mockResolvedValue({items:[],total:0,nextCursor:null});
  services.commitPlacements.mockResolvedValue({record:{plans:[{id:'plan-aba',version:3,status:'committed'}],blockIds:['block-aba']},actionNo:24});
  let finishOld:(x:unknown)=>void=()=>{};
  services.getTask.mockImplementationOnce(()=>new Promise(resolve=>{finishOld=resolve;}));
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  try{
   await act(async()=>root.render(<PlannerLaunch date="2026-11-09" zone="UTC"/>));
   await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
   await vi.waitFor(()=>expect(host.querySelector('[aria-label="Planner preview"]')).not.toBeNull());
   await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('button')]
    .find(b=>b.textContent==='Add 1 block to calendar')!.click());
   await vi.waitFor(()=>expect(services.getTask).toHaveBeenCalledTimes(1));
   await act(async()=>root.render(<PlannerLaunch date="2026-11-10" zone="UTC"/>));
   await act(async()=>root.render(<PlannerLaunch date="2026-11-09" zone="UTC"/>));
   await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
   await vi.waitFor(()=>expect(host.querySelector('[aria-label="Planner preview"]')).not.toBeNull());
   await act(async()=>finishOld(task));
   await vi.waitFor(()=>expect(services.commitPlacements).toHaveBeenCalledTimes(1));
   expect(host.querySelector('dialog')).not.toBeNull();
   expect(host.querySelector('[aria-label="Planner preview"]')).not.toBeNull();
  }finally{await act(async()=>root.unmount());host.remove();}
 });

 it('closes an old date preview when the selected calendar day changes without unmounting',async()=>{
  services.tasks.mockReset();
  services.tasks.mockResolvedValue({items:[],total:0,nextCursor:null});
  services.blocks.mockResolvedValue([]);
  services.entries.mockResolvedValue([]);
  services.plans.mockResolvedValue({items:[],total:0,nextCursor:null});
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  try{
   await act(async()=>root.render(<PlannerLaunch date="2026-11-07" zone="UTC"/>));
   await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
   await vi.waitFor(()=>expect(host.querySelector('[aria-label="Planner preview"]')).not.toBeNull());
   await act(async()=>root.render(<PlannerLaunch date="2026-11-08" zone="UTC"/>));
   expect(host.querySelector('dialog')).toBeNull();
   expect(host.querySelector('[aria-label="Planner preview"]')).toBeNull();
   await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
   await vi.waitFor(()=>expect(host.querySelector('[aria-label="Planner preview"]')).not.toBeNull());
   expect(host.textContent).toContain('Plan your tasks');
   expect(host.textContent).not.toMatch(/\d{4}-\d\d-\d\dT\d\d:\d\d/);
  }finally{
   await act(async()=>root.unmount());host.remove();
  }
 });
 it('isolates a late failed commit after Calendar navigates to another owner day',async()=>{
  services.tasks.mockReset();services.getTask.mockReset();
  const task={id:'task-a',title:'Proof practice',version:1,priority:'normal',
   due:{kind:'none'},estimateMinutes:30,status:'backlog'};
  services.tasks.mockResolvedValue({items:[task],total:1,nextCursor:null});
  services.blocks.mockResolvedValue([]);services.entries.mockResolvedValue([]);
  services.plans.mockResolvedValue({items:[],total:0,nextCursor:null});
  let rejectOld:(e:Error)=>void=()=>{};
  services.getTask.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{
   rejectOld=reject;
  }));
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  try{
   await act(async()=>root.render(<PlannerLaunch date="2026-11-09" zone="UTC"/>));
   await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
   await vi.waitFor(()=>expect(host.querySelector('[aria-label="Planner preview"]')).not.toBeNull());
   await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('button')]
    .find(b=>b.textContent==='Add 1 block to calendar')!.click());
   await vi.waitFor(()=>expect(services.getTask).toHaveBeenCalledWith(task.id));
   await act(async()=>root.render(<PlannerLaunch date="2026-11-10" zone="UTC"/>));
   expect(host.querySelector('dialog')).toBeNull();
   await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
   await vi.waitFor(()=>expect(host.querySelector('[aria-label="Planner preview"]')).not.toBeNull());
   await act(async()=>rejectOld(Error('Previous-day owner source failed')));
   expect(host.querySelector('dialog')).not.toBeNull();
   expect(host.textContent).not.toContain('Previous-day owner source failed');
  }finally{await act(async()=>root.unmount());host.remove();}
 });
 it('does not close a new Planner when the previous-day commit succeeds late',async()=>{
  services.tasks.mockReset();services.getTask.mockReset();
  const task={id:'task-a',title:'Proof practice',version:1,priority:'normal',
   due:{kind:'none'},estimateMinutes:30,status:'backlog'};
  services.tasks.mockResolvedValue({items:[task],total:1,nextCursor:null});
  services.blocks.mockResolvedValue([]);services.entries.mockResolvedValue([]);
  services.plans.mockResolvedValue({items:[],total:0,nextCursor:null});
  services.commitPlacements.mockResolvedValue({record:{plans:[{id:'plan-new',version:3,status:'committed'}],blockIds:['block-new']},actionNo:14});
  let finishOld:(value:unknown)=>void=()=>{};
  services.getTask.mockImplementationOnce(()=>new Promise(resolve=>{finishOld=resolve;}));
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  try{
   await act(async()=>root.render(<PlannerLaunch date="2026-11-09" zone="UTC"/>));
   await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
   await vi.waitFor(()=>expect(host.querySelector('[aria-label="Planner preview"]')).not.toBeNull());
   await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('button')]
    .find(b=>b.textContent==='Add 1 block to calendar')!.click());
   await vi.waitFor(()=>expect(services.getTask).toHaveBeenCalledWith(task.id));
   await act(async()=>root.render(<PlannerLaunch date="2026-11-10" zone="UTC"/>));
   await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
   await vi.waitFor(()=>expect(host.querySelector('[aria-label="Planner preview"]')).not.toBeNull());
   await act(async()=>finishOld(task));
   await vi.waitFor(()=>expect(services.commitPlacements).toHaveBeenCalledTimes(1));
   expect(host.querySelector('dialog')).not.toBeNull();
   expect(host.querySelector('[aria-label="Planner preview"]')).not.toBeNull();
  }finally{await act(async()=>root.unmount());host.remove();}
 });

});

describe('N68 one toast with a truthful Undo',()=>{
 async function commitOnce(actionNo:number|null){
  services.tasks.mockReset();services.getTask.mockReset();services.notify.mockReset();
  services.undoPlacements.mockReset();services.undoPlacements.mockResolvedValue(undefined);
  const task={id:'task-a',title:'Proof practice',version:1,priority:'normal',
   due:{kind:'none'},estimateMinutes:30,status:'backlog'};
  services.tasks.mockResolvedValue({items:[task],total:1,nextCursor:null});
  services.getTask.mockResolvedValue(task);
  services.blocks.mockResolvedValue([]);services.entries.mockResolvedValue([]);
  services.plans.mockResolvedValue({items:[],total:0,nextCursor:null});
  services.commitPlacements.mockReset();
  services.commitPlacements.mockResolvedValue({actionNo,record:{plans:[],blockIds:['b']}});
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  try{
   await act(async()=>root.render(<PlannerLaunch date="2026-11-09" zone="UTC"/>));
   await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
   await vi.waitFor(()=>expect(host.querySelector('[aria-label="Planner preview"]')).not.toBeNull());
   const commit=[...host.querySelectorAll<HTMLButtonElement>('button')]
    .find(b=>b.textContent==='Add 1 block to calendar')!;
   await act(async()=>commit.click());
   await vi.waitFor(()=>expect(services.notify).toHaveBeenCalledTimes(1));
   expect(services.commitPlacements).toHaveBeenCalledTimes(1);
   return services.notify.mock.calls[0];
  }finally{await act(async()=>root.unmount());host.remove();}
 }
 it('offers Undo for the whole live commit and undoes exactly that action',async()=>{
  const [message,options]=await commitOnce(57);
  expect(message).toMatch(/Added 1 block to your calendar/);
  expect(options.action.label).toBe('Undo');
  await act(async()=>options.action.onClick());
  expect(services.undoPlacements).toHaveBeenCalledWith(57);
 });
 it('offers no Undo when the receipt has no journal action (demo)',async()=>{
  const [,options]=await commitOnce(null);
  expect(options.action).toBeUndefined();
 });
});

