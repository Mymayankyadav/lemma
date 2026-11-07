import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter,Route,Routes} from 'react-router';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import CalendarPage from '../../../src/features/calendar/Page';
import {deadlineDay,dueForDay,type CalendarDues} from
 '../../../src/features/calendar/deadlines/DueDayItems';
import {loadCalendarDues} from '../../../src/features/calendar/deadlines/load';
import {setDeadlineApiForTests} from '../../../src/data/deadlines';
import {emptyDeadlineApi,type DeadlineRecord} from '../../../src/data/deadlines/contract';
import {setPracticeTopicApiForTests} from '../../../src/data/practice-topics';
import {emptyPracticeTopicApi,type PracticeTopicRecord} from
 '../../../src/data/practice-topics/contract';
import {setStudyApiForTests} from '../../../src/data/study';
import {emptyStudyApi} from '../../../src/data/study/contract';

const flags=vi.hoisted(()=>({enabled:true}));
vi.mock('../../../src/flags',()=>({isFlagOn:()=>flags.enabled}));
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'demo'}));
const at='2026-11-06T09:00:00.000Z';
const deadline=(id:string,title:string,origin:DeadlineRecord['origin']='owner',
 due:DeadlineRecord['due']={kind:'date',date:'2026-11-06'}):DeadlineRecord=>({
 id,title,kind:origin==='owner'?'exam':'milestone',due,
 status:'open',origin,remainingMinutes:origin==='owner'?75:null,
 estimateSource:origin==='owner'?'owner':null,
 subjectId:null,projectId:origin==='project_target'?'p-1':null,
 checkpointId:origin==='checkpoint_due'?'cp-1':null,
 version:1,createdAt:at,updatedAt:at,
});
const topic=(id:string,title:string,due:string|null='2026-11-06',
 archivedAt:string|null=null):PracticeTopicRecord=>({
 id,title,subjectId:null,conceptId:null,checkpointId:null,
 nextDueDate:due,archivedAt,lastPracticedAt:null,version:1,
 cadence:{kind:'fixed_days',days:7},createdAt:at,updatedAt:at,
});
const dues:CalendarDues={
 deadlines:[
  deadline('d-1','Analysis exam'),
  deadline('d-2','Analysis path target','project_target'),
  deadline('d-3','Proof checkpoint','checkpoint_due'),
  deadline('d-4','Late assignment','owner',{kind:'date',date:'2026-11-02'}),
  {...deadline('d-5','Completed task'),status:'done'},
 ],
 topics:[topic('t-1','Spaced topology'),topic('t-2','Overdue algebra','2026-11-01'),
  topic('t-3','Archived topic','2026-11-06',at),topic('t-4','No schedule',null)],
};
let root:Root,host:HTMLDivElement;
let calls:{deadlines:ReturnType<typeof vi.fn>;topics:ReturnType<typeof vi.fn>;
 study:ReturnType<typeof vi.fn>}|null=null;
function install(input:CalendarDues=dues){
 const readDeadlines=vi.fn(async({cursor=null,limit=50}:{cursor?:string|null;limit?:number}={})=>{
  const start=Number(cursor??'0'),items=input.deadlines.slice(start,start+limit);
  return {items,total:input.deadlines.length,
   nextCursor:start+items.length<input.deadlines.length?String(start+items.length):null};
 });
 const readTopics=vi.fn(async({cursor=null,limit=50}:{cursor?:string|null;limit?:number}={})=>{
  const start=Number(cursor??'0'),items=input.topics.slice(start,start+limit);
  return {items,total:input.topics.length,
   nextCursor:start+items.length<input.topics.length?String(start+items.length):null};
 });
 const readStudy=vi.fn(async()=>[]);
 setDeadlineApiForTests({...emptyDeadlineApi('demo'),listDeadlines:readDeadlines});
 setPracticeTopicApiForTests({...emptyPracticeTopicApi('demo'),listTopics:readTopics});
 setStudyApiForTests({...emptyStudyApi('demo'),
  listStudyEntries:readStudy,listCalendarBlocks:vi.fn(async()=>[])});
 calls={deadlines:readDeadlines,topics:readTopics,study:readStudy};
 return calls;
}
async function render(path:string){
 await act(async()=>root.render(<MemoryRouter initialEntries={[path]}><Routes>
  <Route path="/calendar" element={<CalendarPage/>}/>
  <Route path="/" element={<p data-home>Existing app</p>}/>
 </Routes></MemoryRouter>));
 if(flags.enabled)await vi.waitFor(()=>{
  expect(host.textContent).not.toContain('Loading calendar');
 });
}
async function press(label:string){
 const button=[...host.querySelectorAll('button')].find(x=>
  x.getAttribute('aria-label')===label||x.textContent?.trim()===label);
 expect(button,'Missing button '+label).toBeDefined();
 await act(async()=>button!.click());
}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 flags.enabled=true;
 sessionStorage.clear();
 host=document.createElement('div');document.body.append(host);
 root=createRoot(host);calls=null;
});
afterEach(async()=>{
 await act(async()=>root.unmount());
 setDeadlineApiForTests(null);setPracticeTopicApiForTests(null);
 setStudyApiForTests(null);sessionStorage.clear();host.remove();
});

describe('N74 pure due/overdue civil-day projection',()=>{
 it('never shifts civil deadlines with time zones, but localizes instant deadlines',()=>{
  const civil=deadline('civil','Civil date','owner',{kind:'date',date:'2026-11-06'});
  const instant=deadline('instant','Asia time','owner',
   {kind:'instant',at:'2026-11-05T19:40:00Z'});
  expect(deadlineDay(civil,'America/Los_Angeles')).toBe('2026-11-06');
  expect(deadlineDay(instant,'UTC')).toBe('2026-11-05');
  expect(deadlineDay(instant,'Asia/Kolkata')).toBe('2026-11-06');
 });
 it('pins overdue items to the first visible day without duplicating them or including archives',()=>{
  const first=dueForDay('2026-11-06','2026-11-06','UTC',dues);
  expect(first.map(x=>x.key)).toEqual([
   'practice:t-2','deadline:d-4','deadline:d-1','deadline:d-2','deadline:d-3',
   'practice:t-1',
  ]);
  expect(first.slice(0,2).every(x=>x.overdue)).toBe(true);
  expect(first.some(x=>x.value.title==='Completed task')).toBe(false);
  expect(first.some(x=>x.value.title==='Archived topic')).toBe(false);
  expect(first.some(x=>x.value.title==='No schedule')).toBe(false);
  expect(dueForDay('2026-11-07','2026-11-06','UTC',dues)).toEqual([]);
 });
});
describe('N74 Calendar API loading and display',()=>{
 it('reads exact cursor pages beyond fifty records rather than dropping later deadlines or topics',async()=>{
  const many:CalendarDues={
   deadlines:Array.from({length:57},(_,i)=>deadline('d'+i,'Exam '+i)),
   topics:Array.from({length:54},(_,i)=>topic('p'+i,'Practice '+i)),
  };
  const f=install(many);
  const loaded=await loadCalendarDues();
  expect(loaded.deadlines).toHaveLength(57);
  expect(loaded.topics).toHaveLength(54);
  expect(f.deadlines).toHaveBeenCalledTimes(2);
  expect(f.topics).toHaveBeenCalledTimes(2);
  expect(f.deadlines.mock.calls[0][0]).toMatchObject({
   statuses:['open'],includeProjections:true,limit:50,cursor:null,
  });
  expect(f.topics.mock.calls[0][0]).toMatchObject({
   archived:'active',limit:50,cursor:null,
  });
 });
 it('rejects repeating cursors rather than pretending an incomplete snapshot is empty',async()=>{
  const f=install();
  f.deadlines.mockResolvedValue({items:[dues.deadlines[0]],total:100,
   nextCursor:'same'});
  await expect(loadCalendarDues()).rejects.toThrow(/cursor did not advance/);
 });
 it('shows standalone and both projected origins and due practice in the Agenda',async()=>{
  const f=install();
  await render('/calendar?view=agenda&date=2026-11-06');
  expect(f.deadlines).toHaveBeenCalled();
  expect(f.topics).toHaveBeenCalled();
  expect(host.textContent).toContain('Analysis exam');
  expect(host.textContent).toContain('Analysis path target');
  expect(host.textContent).toContain('Proof checkpoint');
  expect(host.textContent).toContain('Spaced topology');
  expect(host.textContent).toContain('Project target');
  expect(host.textContent).toContain('Checkpoint due');
  expect(host.textContent).toContain('75 min remaining');
  expect(host.textContent).toContain('Overdue since 2026-11-02');
  await press('Open deadline Analysis exam');
  expect(host.querySelector('[aria-label="Details for Analysis exam"]')?.textContent)
   .toContain('75 minutes remaining');
  await press('Open practice topic Spaced topology');
  expect(host.querySelector('[aria-label="Details for Spaced topology"]')?.textContent)
   .toContain('Repeat every 7 days');
  expect(host.textContent).not.toContain('Archived topic');
  expect(host.textContent).not.toContain('Completed task');
 });
 it('shows due records on Day without changing the zero saved-effort capacity',async()=>{
  install();
  await render('/calendar?view=day&date=2026-11-06');
  expect(host.querySelector('[aria-label="Day schedule"]')?.textContent)
   .toContain('Analysis exam');
  const capacity=host.querySelector('[aria-label="Day capacity"]');
  expect(capacity?.textContent).toContain('Logged 0 min');
  expect(capacity?.textContent).toContain('Planned 0 min');
  expect(capacity?.textContent).toContain('Busy 0 min');
  await press('Open deadline Proof checkpoint');
  expect(host.querySelector('[aria-label="Details for Proof checkpoint"]')?.textContent)
   .toContain('Read-only projection');
 });
 it('renders due records in Week alongside the original seven capacity columns',async()=>{
  install();
  await render('/calendar?view=week&date=2026-11-06');
  expect(host.querySelectorAll('[data-week-day]')).toHaveLength(7);
  const monday=host.querySelector('[data-week-day="2026-11-02"]');
  const friday=host.querySelector('[data-week-day="2026-11-06"]');
  expect(monday?.textContent).toContain('Overdue algebra');
  expect(friday?.textContent).toContain('Proof checkpoint');
  expect(friday?.textContent).toContain('Spaced topology');
  expect(friday?.textContent).toContain('Logged 0 min');
  await press('Open practice topic Spaced topology');
  expect(host.querySelector('[aria-label="Details for Spaced topology"]'))
   .not.toBeNull();
 });
 it('counts due items in Month cells and offers direct record details under the grid',async()=>{
  install();
  await render('/calendar?view=month&date=2026-11-06');
  expect(host.querySelectorAll('[data-month-day]')).toHaveLength(42);
  const sixth=host.querySelector('[data-month-day="2026-11-06"]');
  expect(sixth?.textContent).toContain('4 due');
  expect(sixth?.textContent).toContain('0m');
  expect(host.querySelector('[aria-label="Month deadlines and practice"]'))
   .not.toBeNull();
  await press('Open deadline Analysis path target');
  expect(host.querySelector('[aria-label="Details for Analysis path target"]')?.textContent)
   .toContain('Read-only projection');
 });
 it('surfaces failed optional due reads rather than presenting misleading zero counts',async()=>{
  const f=install();
  f.topics.mockRejectedValueOnce(new Error('Practice service unavailable'));
  await render('/calendar?view=month&date=2026-11-06');
  expect(host.querySelector('[role="alert"]')?.textContent)
   .toContain('Practice service unavailable');
  expect(host.querySelector('[aria-label="Calendar month"]')).toBeNull();
 });
 it('never queries deadlines, practice or study through the flag-off route',async()=>{
  flags.enabled=false;
  const f=install();
  await render('/calendar?view=day&date=2026-11-06');
  expect(host.querySelector('[data-home]')?.textContent).toBe('Existing app');
  expect(f.study).not.toHaveBeenCalled();
  expect(f.deadlines).not.toHaveBeenCalled();
  expect(f.topics).not.toHaveBeenCalled();
 });
});
