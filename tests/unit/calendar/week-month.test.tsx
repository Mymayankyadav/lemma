import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {MemoryRouter,Route,Routes,useLocation} from 'react-router';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import CalendarPage from '../../../src/features/calendar/Page';
import {blockLanes,calendarRange,dayCapacity,monthBounds,monthDays,shiftMonth,weekDays,weekStartDay} from '../../../src/features/calendar/model';
import {emptyStudyApi,type CalendarBlockRecord,type StudyEntryRecord} from '../../../src/data/study/contract';
import {setStudyApiForTests} from '../../../src/data/study';

const flag=vi.hoisted(()=>({enabled:true}));
vi.mock('../../../src/flags',()=>({isFlagOn:()=>flag.enabled}));
// The injected fake StudyApi is for demo mode; the mode guard replaces fakes
// whose mode disagrees with the active runtime mode.
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'demo'}));
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
  const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===label||b.getAttribute('aria-label')?.startsWith(label));
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
    await press('Open Thu, Nov 5 in Day view');
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

describe('N26.2 DST-safe Calendar Month grid',()=>{
  it('covers the aligned adjacent-week days without fixed 24h arithmetic',()=>{
    const november=monthBounds('2026-11-06','UTC');
    expect(november).toMatchObject({first:'2026-10-26',last:'2026-12-06',count:42});
    expect(november.range).toEqual(calendarRange('2026-10-26','UTC',42));
    const march=monthBounds('2026-03-29','Europe/London');
    expect(march).toMatchObject({first:'2026-02-23',last:'2026-04-05',count:42});
    expect((Date.parse(march.range.end)-Date.parse(march.range.start))/3600000).toBe(1007);
    expect(monthBounds('2026-11-06','UTC',0).first).toBe('2026-11-01');
    expect(()=>monthBounds('2026-02-30','UTC')).toThrow();
  });
  it('keeps civil-day totals equal to Day and Week, including midnight focus',()=>{
    const month=monthDays('2026-11-06','UTC',[entry],blocks);
    const friday=month.days.find(row=>row.day==='2026-11-06')!;
    const week=weekDays('2026-11-06','UTC',[entry],blocks);
    expect(friday.capacity).toEqual(dayCapacity('2026-11-06','UTC',[entry],blocks));
    expect(friday.capacity).toEqual(week[4].capacity);
    expect(friday.capacity.logged).toBe(60);
    expect(friday.blocks.map(block=>block.id)).toEqual(['busy-a','busy-b','study']);
    expect(month.days.filter(row=>row.inMonth)).toHaveLength(30);
    const crossing={...entry,intervals:[{id:'cross',kind:'focus' as const,
      start:'2026-11-06T18:25:00Z',end:'2026-11-06T18:40:00Z'}]};
    const local=monthDays('2026-11-06','Asia/Kolkata',[crossing],[]);
    expect(local.days.find(row=>row.day==='2026-11-06')?.capacity.logged).toBe(5);
    expect(local.days.find(row=>row.day==='2026-11-07')?.capacity.logged).toBe(10);
  });
  it('clamps month navigation on short months instead of skipping them',()=>{
    expect(shiftMonth('2026-01-31',1)).toBe('2026-02-28');
    expect(shiftMonth('2028-01-31',1)).toBe('2028-02-29');
    expect(shiftMonth('2026-03-31',-1)).toBe('2026-02-28');
    expect(shiftMonth('2026-12-15',1)).toBe('2027-01-15');
  });
  it('loads one bounded month-grid range, includes outside dates and opens Day',async()=>{
    const f=fake();
    await render('/calendar?view=month&date=2026-11-06');
    expect(host.querySelector('[aria-label="Calendar month"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-month-day]')).toHaveLength(42);
    expect(host.querySelectorAll('[data-outside-month]')).toHaveLength(12);
    const target=host.querySelector('[data-month-day="2026-11-06"]');
    expect(target?.textContent).not.toContain('0m');
    expect(target?.getAttribute('aria-label')).toContain('1 h logged');
    expect(target?.getAttribute('aria-label')).toContain('3 blocks');
    expect(target?.getAttribute('aria-label')).toContain('Open Fri, Nov 6 in Day view');
    const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
    expect(f.listStudyEntries).toHaveBeenCalledWith(monthBounds('2026-11-06',zone).range);
    expect(f.listCalendarBlocks).toHaveBeenCalledWith(monthBounds('2026-11-06',zone).range);
    await press('Open Tue, Oct 27 in Day view');
    expect(host.querySelector('[data-url]')?.textContent).toContain('view=day');
    expect(host.querySelector('[data-url]')?.textContent).toContain('date=2026-10-27');
  });
  it('navigates Month with the existing keyboard switcher and calendar month steps',async()=>{
    fake();
    await render('/calendar?view=week&date=2026-01-31');
    const week=[...host.querySelectorAll('button')].find(button=>button.textContent?.trim()==='Week')!;
    await act(async()=>week.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
    expect(host.querySelector('[data-url]')?.textContent).toContain('view=month');
    await vi.waitFor(()=>expect(host.querySelector('[aria-label="Calendar month"]')).not.toBeNull());
    await press('Next month');
    expect(host.querySelector('[data-url]')?.textContent).toContain('date=2026-02-28');
    await vi.waitFor(()=>expect(host.querySelector('[data-month-day="2026-02-28"]')).not.toBeNull());
    await press('Previous month');
    expect(host.querySelector('[data-url]')?.textContent).toContain('date=2026-01-28');
  });
  it('distinguishes failed data from an actually loaded empty month',async()=>{
    setStudyApiForTests({...emptyStudyApi('demo'),
      listStudyEntries:vi.fn(async()=>{throw new Error('Source unavailable');}),
      listCalendarBlocks:vi.fn(async()=>[]),
    });
    await render('/calendar?view=month&date=2026-11-06');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Source unavailable');
    expect(host.querySelector('[aria-label="Calendar month"]')).toBeNull();
    expect(host.textContent).not.toContain('0m');
  });
  it('keeps the legacy flag-off route without reading any month data',async()=>{
    flag.enabled=false;
    const f=fake();
    await render('/calendar?view=month&date=2026-11-06');
    expect(host.querySelector('[data-home]')?.textContent).toBe('Legacy home');
    expect(f.listStudyEntries).not.toHaveBeenCalled();
    expect(f.listCalendarBlocks).not.toHaveBeenCalled();
  });
});
