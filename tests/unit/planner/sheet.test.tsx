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
import {vi} from 'vitest';
import PlannerLaunch from '../../../src/features/planner/Sheet';

const services=vi.hoisted(()=>({
 tasks:vi.fn(),blocks:vi.fn(),entries:vi.fn(),plans:vi.fn(),
}));
vi.mock('../../../src/data/tasks',()=>({
 getTaskApi:()=>({listTasks:services.tasks}),
}));
vi.mock('../../../src/data/study',()=>({
 getStudyApi:()=>({listCalendarBlocks:services.blocks,
  listStudyEntries:services.entries}),
}));
vi.mock('../../../src/data/day-plans',()=>({
 getDayPlanApi:()=>({listPlans:services.plans}),
}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>vi.fn()}));

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
    .find(x=>x.textContent==='Close');
   await act(async()=>close?.click());
   expect(host.querySelector('dialog')).toBeNull();
  }finally{
   await act(async()=>root.unmount());host.remove();
  }
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
import type {TaskRecord} from '../../../src/data/tasks/contract';
import type {StudyEntryRecord} from '../../../src/data/study/contract';
const makeTask=(id:string,version=1)=>({id,version,title:'Learn '+id}) as TaskRecord;
function commitFixture(){
 const written:string[]=[],deleted:string[]=[],cleared:string[]=[];
 let latestVersion=1;
 const apis={
  tasks:{getTask:vi.fn(async(id:string)=>makeTask(id))},
  study:{
   listCalendarBlocks:vi.fn(async()=>[]),
   listStudyEntries:vi.fn(async()=>[]),
   createCalendarBlock:vi.fn(async(input:{taskId?:string|null})=>{
    const id='block-'+(written.length+1);
    written.push(id);
    return {actionNo:11,record:{id,version:1,...input}};
   }),
   deleteCalendarBlock:vi.fn(async(id:string)=>{deleted.push(id);return {actionNo:12,record:{id}}}),
  },
  plans:{
   listPlans:vi.fn(async()=>({items:[],total:0,nextCursor:null})),
   createPlan:vi.fn(async(input:{planDate:string})=>({
    actionNo:21,record:{id:'plan-'+input.planDate,status:'draft',
     version:1,planDate:input.planDate,timeZone:'UTC'},
   })),
   previewPlan:vi.fn(async(id:string,_version:number,items:unknown[])=>({
    actionNo:22,record:{id,status:'previewed',version:2,planDate:id.slice(5),items},
   })),
   commitPlan:vi.fn(async(id:string)=>({
    actionNo:23,record:{id,status:'committed',version:3},
   })),
   getPlan:vi.fn(async(id:string)=>({id,version:latestVersion,status:'previewed'})),
   updatePlan:vi.fn(async(id:string)=>{cleared.push(id);
    latestVersion++;return {actionNo:24,record:{id,status:'draft',version:latestVersion}};}),
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
 return {apis,snapshot,written,deleted,cleared};
}
describe('N68 owner commit preflight and partial-failure containment',()=>{
 it('checks every day-plan state before creating even the first block',async()=>{
  const f=commitFixture();
  vi.mocked(f.apis.plans.listPlans).mockResolvedValueOnce({
   items:[{id:'another',planDate:'2026-11-10',status:'committed',
    version:3}],total:1,nextCursor:null,
  } as never);
  await expect(commitPlannerSelection(f.snapshot,f.apis)).rejects.toThrow(
   'already committed day plan');
  expect(f.written).toEqual([]);
  expect(f.apis.plans.commitPlan).not.toHaveBeenCalled();
 });
 it('clears only the failed second-day preview and its block, retaining a committed first day',async()=>{
  const f=commitFixture();
  vi.mocked(f.apis.plans.commitPlan).mockImplementation(async(id:string)=>{
   if(id==='plan-2026-11-10')throw Error('Stale source version');
   return {actionNo:23,record:{id,status:'committed',version:3}} as never;
  });
  await expect(commitPlannerSelection(f.snapshot,f.apis)).rejects.toMatchObject({
   name:'PlannerCommitError',committedDays:['2026-11-09'],orphanBlockIds:[],
  } satisfies Partial<PlannerCommitError>);
  expect(f.written).toEqual(['block-1','block-2']);
  expect(f.cleared).toEqual(['plan-2026-11-10']);
  expect(f.deleted).toEqual(['block-2']);
 });
 it('rejects new saved focus intervals without writing any block',async()=>{
  const f=commitFixture();
  const saved:StudyEntryRecord={id:'e1',source:'timer',intent:'Study',status:'saved',
   version:1,reflection:null,rating:null,savedAt:'2026-11-09T10:00:00Z',
   createdAt:'2026-11-09T09:00:00Z',updatedAt:'2026-11-09T10:00:00Z',
   intervals:[{id:'i1',kind:'focus',start:'2026-11-09T09:00:00Z',
    end:'2026-11-09T09:30:00Z'}]};
  vi.mocked(f.apis.study.listStudyEntries).mockResolvedValueOnce([saved]);
  await expect(commitPlannerSelection(f.snapshot,f.apis)).rejects.toThrow(
   'Saved focus time changed since preview');
  expect(f.written).toEqual([]);
  expect(savedFocusSignature([saved])).not.toBe(savedFocusSignature([]));
 });
 it('persists unplaced reasons on the anchor even if all selected blocks start later',async()=>{
  const f=commitFixture();f.snapshot.selection.selected=[f.snapshot.selection.selected[1]];
  const result=await commitPlannerSelection(f.snapshot,f.apis);
  expect(result.committedDays).toEqual(['2026-11-09','2026-11-10']);
  const previews=vi.mocked(f.apis.plans.previewPlan).mock.calls;
  expect(previews[0][0]).toBe('plan-2026-11-09');
  expect(previews[0][2]).toEqual([{
   taskId:'task-c',blockId:null,disposition:'unplaced',reason:'no_capacity',position:0,
  }]);
  expect(f.written).toEqual(['block-1']);
 });
 it('rejects an unrelated new calendar block as a stale preview before any write',async()=>{
  const f=commitFixture();
  vi.mocked(f.apis.study.listCalendarBlocks).mockResolvedValueOnce([{
   id:'new',startsAt:'2026-11-09T09:00:00Z',
   endsAt:'2026-11-09T10:00:00Z',version:1,status:'planned',
  }] as never);
  await expect(commitPlannerSelection(f.snapshot,f.apis)).rejects.toThrow(
   'Calendar changed since preview');
  expect(f.written).toEqual([]);
 });
 it('refuses a source task version change and a local-timezone move',async()=>{
  const f=commitFixture();
  vi.mocked(f.apis.tasks.getTask).mockResolvedValueOnce(makeTask('task-a',2));
  await expect(commitPlannerSelection(f.snapshot,f.apis)).rejects.toThrow(
   'Task changed since preview');
  expect(f.written).toEqual([]);
  expect(()=>selectPlannerPlacements(preview,new Set(['task-a']),
   new Map([['task-a:1',{date:'2026-11-09',
    start:'2026-11-09T09:00:00',end:'2026-11-09T09:30:00'}]])))
   .toThrow('Invalid moved planner interval');
 });
});
