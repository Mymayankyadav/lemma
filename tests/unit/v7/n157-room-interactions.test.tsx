import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
 settings:{connectorUrl:'https://example.invalid/connector',connectorLastSeenAt:null as string|null,ui:{},planning:{window_start:'08:00',window_end:'22:00',gap_minutes:10,max_consecutive_minutes:90,daily_minimum_minutes:30,daily_intention:false}},
 update:vi.fn(),refetch:vi.fn(),submit:vi.fn(),notify:vi.fn(),commit:vi.fn(),undo:vi.fn(),suggest:vi.fn(),changed:vi.fn(),show:vi.fn(),
 getTask:vi.fn(),blocks:vi.fn(),entries:vi.fn(),create:vi.fn(),remove:vi.fn(),
}));
vi.mock('../../../src/data/hooks',()=>({useSettings:()=>({data:mocks.settings,refetch:mocks.refetch}),useUpdateSettings:()=>({mutateAsync:mocks.update})}));
vi.mock('../../../src/features/new-project/useNewPath',()=>({useNewPath:()=>({name:'Abstract Algebra',setName:vi.fn(),saving:false,submit:mocks.submit})}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>mocks.notify}));
vi.mock('../../../src/features/calendar/v7/suggestions',()=>({loadSuggestions:mocks.suggest}));
vi.mock('../../../src/features/planner/commit',()=>({commitPlannerSelection:mocks.commit}));
vi.mock('../../../src/features/planner/Sheet',()=>({default:()=>null}));
vi.mock('../../../src/data/day-plans',()=>({getDayPlanApi:()=>({undoPlacements:mocks.undo})}));
vi.mock('../../../src/data/tasks',()=>({getTaskApi:()=>({getTask:mocks.getTask})}));
vi.mock('../../../src/data/study',()=>({getStudyApi:()=>({listCalendarBlocks:mocks.blocks,listStudyEntries:mocks.entries,createCalendarBlock:mocks.create,deleteCalendarBlock:mocks.remove})}));
import RoomWelcome from '../../../src/features/sign-in/v7/RoomWelcome';
import SuggestionsBanner from '../../../src/features/calendar/v7/SuggestionsBanner';
import type {SuggestedBlock} from '../../../src/features/calendar/v7/DayGrid';

let host:HTMLDivElement,root:Root;
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.clearAllMocks();mocks.settings.connectorLastSeenAt=null;mocks.update.mockResolvedValue({});mocks.submit.mockResolvedValue({kind:'created'});mocks.undo.mockResolvedValue({});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();});
async function click(label:string){
 const button=[...host.querySelectorAll('button')].find(node=>node.textContent?.trim()===label);
 expect(button,label).toBeTruthy();await act(async()=>button!.click());
}

describe('U3 first run',()=>{
 it('creates the first path before asking for a rhythm, saves the rhythm, and connects the tutor last',async()=>{
  await act(async()=>root.render(<MemoryRouter><RoomWelcome/></MemoryRouter>));
  expect(host.querySelector('h1')?.textContent).toBe('What are you studying?');
  await click('Create path');expect(mocks.submit).toHaveBeenCalledOnce();
  expect(host.querySelector('h1')?.textContent).toBe('Your rhythm');
  await click('Save rhythm');
  expect(mocks.update).toHaveBeenCalledWith({planning:expect.objectContaining({window_start:'08:00',daily_minimum_minutes:30})});
  expect(host.querySelector('h1')?.textContent).toBe('Connect your tutor');
  expect(host.querySelector('input[readonly]')?.getAttribute('value')).toBe(mocks.settings.connectorUrl);
  expect(host.querySelector('[role=status]')?.textContent).toContain('Waiting');
 });
 it('does not advance after a failed rhythm save and keeps Skip available',async()=>{
  mocks.update.mockRejectedValue(new Error('offline'));
  await act(async()=>root.render(<MemoryRouter><RoomWelcome/></MemoryRouter>));
  await click('Skip this step');await click('Save rhythm');
  expect(host.querySelector('h1')?.textContent).toBe('Your rhythm');
  await click('Skip this step');expect(host.querySelector('h1')?.textContent).toBe('Connect your tutor');
 });
 it('polls for the first tutor call only on the connection step, then shows confirmation',async()=>{
  vi.useFakeTimers();
  await act(async()=>root.render(<MemoryRouter><RoomWelcome/></MemoryRouter>));
  await act(async()=>vi.advanceTimersByTime(6000));expect(mocks.refetch).not.toHaveBeenCalled();
  await click('Skip this step');await click('Skip this step');
  await act(async()=>vi.advanceTimersByTime(3000));expect(mocks.refetch).toHaveBeenCalledOnce();
  mocks.settings.connectorLastSeenAt='2026-11-13T10:00:00Z';
  await act(async()=>root.render(<MemoryRouter><RoomWelcome/></MemoryRouter>));
  expect(host.querySelector('[role=status]')?.textContent).toContain('Connected');
  await act(async()=>vi.advanceTimersByTime(6000));expect(mocks.refetch).toHaveBeenCalledOnce();
 });
});

describe('U3 one-tap Calendar suggestions',()=>{
 const placements=[
  {taskId:'t1',date:'2026-11-13',start:'2026-11-13T10:00:00Z',end:'2026-11-13T10:30:00Z',minutes:30,part:1},
  {taskId:'t2',date:'2026-11-13',start:'2026-11-13T11:00:00Z',end:'2026-11-13T11:30:00Z',minutes:30,part:1},
 ];
 const render=async(inline=true)=>{
  mocks.suggest.mockResolvedValue({result:{placements,unplaced:[]},tasks:[{id:'t1',title:'First task',version:1},{id:'t2',title:'Second task',version:1}],blocks:[],entries:[]});
  mocks.commit.mockResolvedValue({actionNo:7});
  mocks.getTask.mockResolvedValue({id:'t1',title:'First task',version:1,status:'backlog'});
  mocks.blocks.mockResolvedValue([]);mocks.entries.mockResolvedValue([]);mocks.create.mockResolvedValue({record:{id:'block1',version:1},actionNo:7});mocks.remove.mockResolvedValue({});
  await act(async()=>root.render(<SuggestionsBanner inline={inline} date="2026-11-13" zone="UTC" openPlanner={false} onChanged={mocks.changed} onPlannerClosed={vi.fn()} onSuggest={mocks.show}/>));
 };
 const suggestions=()=>mocks.show.mock.calls.at(-1)![0] as SuggestedBlock[];
 it('writes only the tapped block and Undo deletes that exact returned version',async()=>{
  await render();expect(suggestions()).toHaveLength(2);
  await act(async()=>suggestions()[0].onAccept!());
  expect(mocks.create).toHaveBeenCalledOnce();expect(mocks.commit).not.toHaveBeenCalled();
  expect(mocks.create).toHaveBeenCalledWith({kind:'study',title:'First task',startsAt:placements[0].start,endsAt:placements[0].end,timeZone:'UTC',taskId:'t1'});
  expect(suggestions().map(item=>item.id)).toEqual(['t2:1']);
  expect(mocks.changed).toHaveBeenCalledOnce();
  const options=mocks.notify.mock.calls[0][1];
  await act(async()=>options.action.onClick());
  expect(mocks.remove).toHaveBeenCalledWith('block1',1);
  expect(suggestions()).toHaveLength(2);
 });
 it('guards two taps in the same turn so the placement cannot be written twice',async()=>{
  await render();const accept=suggestions()[0].onAccept!;
  let finish!:(value:unknown)=>void;mocks.create.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  await act(async()=>{accept();accept();});expect(mocks.create).toHaveBeenCalledOnce();
  await act(async()=>finish({record:{id:'block1',version:1},actionNo:8}));
 });
 it('finds the exact existing task/time on retry after a lost acknowledgement, without another write',async()=>{
  await render();mocks.create.mockRejectedValueOnce(new Error('network'));
  await act(async()=>suggestions()[0].onAccept!());
  mocks.blocks.mockResolvedValue([{id:'block1',version:1,taskId:'t1',kind:'study',status:'planned',startsAt:placements[0].start,endsAt:placements[0].end}]);
  await act(async()=>suggestions()[0].onAccept!());
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.notify.mock.calls.at(-1)?.[0]).toBe('This block is already planned');
 });
 it('keeps Add all on the existing atomic planner and its journal Undo',async()=>{
  await render(false);await click('Add all');
  expect(mocks.commit).toHaveBeenCalledOnce();expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.commit.mock.calls[0][0].selection.selected).toEqual(placements);
  await act(async()=>mocks.notify.mock.calls[0][1].action.onClick());expect(mocks.undo).toHaveBeenCalledWith(7);
 });
 it('refuses a changed task or an occupied slot before writing',async()=>{
  await render();mocks.getTask.mockResolvedValue({id:'t1',title:'First task',version:2,status:'backlog'});
  await act(async()=>suggestions()[0].onAccept!());expect(mocks.create).not.toHaveBeenCalled();
  mocks.getTask.mockResolvedValue({id:'t1',title:'First task',version:1,status:'backlog'});
  mocks.blocks.mockResolvedValue([{id:'busy',kind:'busy',status:'planned',startsAt:placements[0].start,endsAt:placements[0].end}]);
  await act(async()=>suggestions()[0].onAccept!());expect(mocks.create).not.toHaveBeenCalled();
 });
});
