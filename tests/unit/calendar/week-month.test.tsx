import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {MemoryRouter,Route,Routes,useLocation} from 'react-router';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import CalendarPage from '../../../src/features/calendar/Page';
import {blockLanes,calendarRange,dayCapacity,weekDays,weekStartDay} from '../../../src/features/calendar/model';
import {emptyStudyApi,type CalendarBlockRecord,type StudyEntryRecord} from '../../../src/data/study/contract';
import {setStudyApiForTests} from '../../../src/data/study';

const flag=vi.hoisted(()=>({enabled:true}));
vi.mock('../../../src/flags',()=>({isFlagOn:()=>flag.enabled}));
const entry:StudyEntryRecord={
  id:'entry',intent:'Practice proofs',status:'saved',source:'timer',version:1,
  rating:null,reflection:null,createdAt:'2026-11-06T09:00:00Z',updatedAt:'2026-11-06T10:00:00Z',
  savedAt:'2026-11-06T10:00:00Z',intervals:[
    {id:'focus',kind:'focus',start:'2026-11-06T09:00:00Z',end:'2026-11-06T10:00:00Z'},
  ],
};
const blocks:CalendarBlockRecord[]=[
  {id:'busy-a',title:'Appointment',kind:'busy',status:'planned',version:1,
    timeZone:'UTC',startsAt:'2026-11-06T09:15:00Z',endsAt:'2026-11-06T10:15:00Z'},
  {id:'busy-b',title:'Seminar',kind:'busy',status:'planned',version:1,
    timeZone:'UTC',startsAt:'2026-11-06T09:45:00Z',endsAt:'2026-11-06T11:00:00Z'},
  {id:'study',title:'Reading',kind:'study',status:'planned',version:1,
    timeZone:'UTC',startsAt:'2026-11-06T10:15:00Z',endsAt:'2026-11-06T11:15:00Z'},
];
let root:Root,host:HTMLDivElement;
function Location(){const location=useLocation();return <output data-url>{location.pathname+location.search}</output>;}
function fake(entries:StudyEntryRecord[]=[entry],data:CalendarBlockRecord[]=blocks){
  const listStudyEntries=vi.fn(async()=>entries);
  const listCalendarBlocks=vi.fn(async()=>data);
  setStudyApiForTests({...emptyStudyApi('demo'),listStudyEntries,listCalendarBlocks});
  return {listStudyEntries,listCalendarBlocks};
}
async function render(path:string){
  await act(async()=>root.render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/calendar" element={<><CalendarPage/><Location/></>} />
    <Route path="/" element={<p data-home>Legacy home</p>}/>
  </Routes></MemoryRouter>));
  if(flag.enabled) await vi.waitFor(()=>expect(host.textContent).not.toContain('Loading calendar'));
}
async function press(label:string){
  const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===label||b.getAttribute('aria-label')===label);
  expect(button,'Missing button '+label).toBeDefined();
  await act(async()=>button!.click());
}
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  flag.enabled=true;
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  setStudyApiForTests(null);host.remove();
});
describe('N26.1 seven-civil-day Week slice',()=>{
  it('begins on Monday by default, supports an explicit first weekday and handles year boundaries',()=>{
    expect(weekStartDay('2026-11-06')).toBe('2026-11-02');
    expect(weekStartDay('2026-11-06',0)).toBe('2026-11-01');
    expect(weekStartDay('2027-01-01')).toBe('2026-12-28');
    expect(()=>weekStartDay('2026-02-30')).toThrow();
    expect(()=>weekStartDay('2026-11-06',8)).toThrow();
  });
  it('uses the identical dayCapacity as Day for totals, never counting overlaps twice',()=>{
    const week=weekDays('2026-11-06','UTC',[entry],blocks);
    expect(week).toHaveLength(7);
    expect(week.map(x=>x.day)).toEqual([
      '2026-11-02','2026-11-03','2026-11-04','2026-11-05',
      '2026-11-06','2026-11-07','2026-11-08',
    ]);
    const friday=week[4];
    expect(friday.capacity).toEqual(dayCapacity('2026-11-06','UTC',[entry],blocks));
    expect(friday.capacity.logged).toBe(60);
    expect(friday.capacity.busy).toBe(60);
    expect(friday.capacity.planned).toBe(15);
    expect(friday.capacity.logged+friday.capacity.busy+friday.capacity.planned+friday.capacity.free).toBe(1440);
    expect(week[1].capacity.logged).toBe(0);
  });
  it('stacks simultaneous blocks in distinct lanes, then reuses freed lanes',()=>{
    const range=calendarRange('2026-11-06','UTC');
    const displayed=blockLanes(blocks,range);
    expect(displayed.map(x=>[x.block.id,x.lane])).toEqual([
      ['busy-a',0],['busy-b',1],['study',0],
    ]);
    expect(displayed).toHaveLength(3);
    expect(blockLanes([...blocks,{...blocks[0],id:'cancelled',status:'cancelled'}],range)).toHaveLength(3);
  });
  it('clips midnight focus across both local days and retains real DST day bounds',()=>{
    const crossing={...entry,intervals:[{id:'cross',kind:'focus' as const,
      start:'2026-11-06T18:25:00Z',end:'2026-11-06T18:40:00Z'}]};
    const columns=weekDays('2026-11-06','Asia/Kolkata',[crossing],[]);
    expect(columns[4].capacity.logged).toBe(5);
    expect(columns[5].capacity.logged).toBe(10);
    const dst=weekDays('2026-03-29','Europe/London',[],[]);
    expect(dst.reduce((sum,x)=>sum+(Date.parse(x.range.end)-Date.parse(x.range.start))/3600000,0)).toBe(167);
  });
  it('renders seven columns with all overlapping items and loads exactly the Monday-week range',async()=>{
    const f=fake();
    await render('/calendar?view=week&date=2026-11-06');
    expect(host.querySelector('[aria-label="Calendar week"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-week-day]')).toHaveLength(7);
    expect(host.textContent).toContain('Practice proofs');
    expect(host.textContent).toContain('Appointment');
    expect(host.textContent).toContain('Seminar');
    expect(host.textContent).toContain('Reading');
    expect(host.querySelector('[data-week-day="2026-11-06"] [data-lane="1"]')).not.toBeNull();
    const range=calendarRange('2026-11-02',Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',7);
    expect(f.listStudyEntries).toHaveBeenCalledWith(range);
    expect(f.listCalendarBlocks).toHaveBeenCalledWith(range);
  });
  it('switches Week via keyboard arrows and opens a chosen Day while preserving URL date',async()=>{
    fake();
    await render('/calendar?view=day&date=2026-11-06');
    const day=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Day')!;
    await act(async()=>day.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
    expect(host.querySelector('[data-url]')?.textContent).toContain('view=week');
    await vi.waitFor(()=>expect(host.querySelectorAll('[data-week-day]')).toHaveLength(7));
    await press('Open 2026-11-05 in Day view');
    expect(host.querySelector('[data-url]')?.textContent).toContain('view=day');
    expect(host.querySelector('[data-url]')?.textContent).toContain('date=2026-11-05');
  });
  it('does not present unloaded or failed data as zero-effort days',async()=>{
    setStudyApiForTests({...emptyStudyApi('demo'),
      listStudyEntries:vi.fn(async()=>{throw new Error('Study source unavailable');}),
      listCalendarBlocks:vi.fn(async()=>blocks),
    });
    await render('/calendar?view=week&date=2026-11-06');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Study source unavailable');
    expect(host.querySelector('[aria-label="Calendar week"]')).toBeNull();
    expect(host.textContent).not.toContain('Logged 0 min');
  });
  it('does not mount the v6 Calendar or query StudyApi when flag is off',async()=>{
    flag.enabled=false;
    const f=fake();
    await render('/calendar?view=week&date=2026-11-06');
    expect(host.querySelector('[data-home]')?.textContent).toBe('Legacy home');
    expect(f.listCalendarBlocks).not.toHaveBeenCalled();
  });
});
