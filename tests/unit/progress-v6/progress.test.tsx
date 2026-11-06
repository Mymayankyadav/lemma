import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router';
import { progressMetrics, progressWindow } from '../../../src/features/progress-v6/metrics';
import ProgressV6 from '../../../src/features/progress-v6/Page';
import InsightsPage from '../../../src/features/insights/Page';
import { emptyStudyApi, type StudyEntryRecord, type StudyInterval } from '../../../src/data/study/contract';
import { setStudyApiForTests } from '../../../src/data/study';
import { isFlagOn } from '../../../src/flags';

vi.mock('../../../src/flags', () => ({isFlagOn: vi.fn(() => false)}));
vi.mock('../../../src/data/hooks', () => ({
  useInsightData: () => ({isPending: true}),
  useSettings: () => ({isPending: true}),
}));

const at = (value: string) => new Date(value).toISOString();
function entry(id: string, spans: StudyInterval[], subjectId: string | null = null, status: StudyEntryRecord['status']='saved'): StudyEntryRecord {
  const createdAt = spans[0]?.start ?? '2026-11-01T10:00:00Z';
  return {id,intent:id,source:'timer',status,reflection:null,rating:null,version:1,
    createdAt,updatedAt:createdAt,savedAt:status==='saved'?createdAt:null,
    subjectId,projectId:null,checkpointId:null,sessionId:null,intervals:spans};
}
const span = (a:string,b:string,kind:'focus'|'break'='focus'): StudyInterval =>
  ({id:a,kind,start:at(a),end:at(b)});

const now = '2026-11-06T12:00:00Z';

describe('N18 civil-day effort metrics', () => {
  it('calculates Day / Week / Month totals from the same saved intervals', () => {
    const records = [
      entry('oct',[span('2026-10-31T09:00Z','2026-10-31T09:50Z')]),
      entry('month',[span('2026-11-01T10:00Z','2026-11-01T10:40Z')]),
      entry('week',[span('2026-11-03T08:00Z','2026-11-03T08:30Z')]),
      entry('day',[span('2026-11-06T09:00Z','2026-11-06T09:15Z')]),
    ];
    expect(progressMetrics(records,'day','UTC',now).total).toBe(15);
    expect(progressMetrics(records,'week','UTC',now).total).toBe(45);
    expect(progressMetrics(records,'month','UTC',now).total).toBe(85);
    expect(progressMetrics(records,'week','UTC',now).perDay).toHaveLength(7);
    expect(progressMetrics(records,'month','UTC',now).perDay).toHaveLength(30);
    expect(progressMetrics(records,'day','UTC',now).perDay).toEqual([]);
  });

  it('partitions overlaps once, excludes breaks, drafts and discards, and keeps exact totals', () => {
    const records = [
      entry('A',[
        span('2026-11-05T23:30Z','2026-11-06T00:30Z'),
        span('2026-11-05T23:45Z','2026-11-06T00:00Z','break'),
      ],'subject-A'),
      entry('B',[span('2026-11-06T00:20Z','2026-11-06T00:50Z')],null),
      entry('draft',[span('2026-11-06T05:00Z','2026-11-06T06:00Z')],'subject-C','draft'),
      entry('discarded',[span('2026-11-06T06:00Z','2026-11-06T07:00Z')],'subject-C','discarded'),
    ];
    const week = progressMetrics(records,'week','UTC',now);
    expect(week.total).toBe(65);
    expect(week.perDay.find(day => day.date==='2026-11-05')?.minutes).toBe(15);
    expect(week.perDay.find(day => day.date==='2026-11-06')?.minutes).toBe(50);
    expect(week.subjects.map(row=>[row.name,row.minutes])).toEqual([['subject-A',45],['Unassigned',20]]);
    expect(week.subjects.reduce((sum,row)=>sum+row.minutes,0)).toBe(week.total);
    expect(progressMetrics(records,'day','UTC',now).total).toBe(50);
  });

  it('splits a saved interval across the Asia/Kolkata local midnight', () => {
    const records = [entry('edge', [span('2026-11-05T18:15Z','2026-11-05T18:45Z')])];
    const day = progressMetrics(records,'day','Asia/Kolkata',now);
    expect(day.range.start).toBe('2026-11-05T18:30:00.000Z');
    expect(day.total).toBe(15);
    const week = progressMetrics(records,'week','Asia/Kolkata',now);
    expect(week.total).toBe(30);
    expect(week.perDay.find(x=>x.date==='2026-11-05')?.minutes).toBe(15);
    expect(week.perDay.find(x=>x.date==='2026-11-06')?.minutes).toBe(15);
  });

  it('uses the 23-hour Europe/London day at the spring DST boundary', () => {
    const window=progressWindow('day','Europe/London','2026-03-29T11:00:00Z');
    expect(window.range).toEqual({start:'2026-03-29T00:00:00.000Z',end:'2026-03-29T23:00:00.000Z'});
    expect(Date.parse(window.range.end)-Date.parse(window.range.start)).toBe(23*60*60*1000);
    const records=[entry('late',[span('2026-03-29T22:40Z','2026-03-29T23:20Z')])];
    expect(progressMetrics(records,'day','Europe/London','2026-03-29T22:59:00Z').total).toBe(19);
  });

  it('excludes future time and never double counts duplicate saved entries', () => {
    const records=[
      entry('x',[span('2026-11-06T11:30Z','2026-11-06T13:00Z')],'math'),
      entry('y',[span('2026-11-06T11:40Z','2026-11-06T12:30Z')],'physics'),
      entry('x',[span('2026-11-06T11:30Z','2026-11-06T13:00Z')],'math'),
    ];
    const metrics=progressMetrics(records,'day','UTC',now);
    expect(metrics.total).toBe(30);
    expect(metrics.subjects.reduce((sum,s)=>sum+s.minutes,0)).toBe(metrics.total);
    expect(metrics.subjects[0]).toMatchObject({id:'math',minutes:30});
  });
});

let node: HTMLDivElement;
let root: Root | null;
function RouteEcho(){const location=useLocation();return <output data-testid="route-query">{location.search}</output>}
async function render(view: ReactElement, path='/insights?range=day') {
  root=createRoot(node);
  await act(async()=>{root!.render(<MemoryRouter initialEntries={[path]}>{view}<RouteEcho/></MemoryRouter>)});
}

beforeEach(()=>{
  node=document.createElement('div');document.body.append(node);
  root=null;
  vi.mocked(isFlagOn).mockReturnValue(false);
  setStudyApiForTests({...emptyStudyApi('live'),listStudyEntries:vi.fn(async()=>[])});
});
afterEach(async()=>{
  if(root) await act(async()=>root!.unmount());
  node.remove();setStudyApiForTests(null);vi.clearAllMocks();
});

describe('N18 flagged Progress UI',()=>{
  it('loads StudyApi once per range and preserves other URL params on Week and Month', async()=>{
    const read=vi.fn(async()=>[]);
    setStudyApiForTests({...emptyStudyApi('live'),listStudyEntries:read});
    await render(<ProgressV6/>,'/insights?range=day&keep=yes');
    expect(read).toHaveBeenCalledTimes(1);
    expect(node.querySelector('[data-testid="v6-logged-total"]')?.textContent).toBe('0 min');
    const click=async(label:string)=>{
      const target=Array.from(node.querySelectorAll('button')).find(button=>button.textContent===label);
      expect(target).toBeDefined();
      await act(async()=>target!.click());
    };
    await click('Week');
    expect(node.querySelector('[data-testid="route-query"]')?.textContent).toContain('range=week');
    expect(node.querySelector('[data-testid="route-query"]')?.textContent).toContain('keep=yes');
    expect(node.querySelectorAll('li[aria-label*="min"]')).toHaveLength(7);
    await click('Month');
    expect(node.querySelector('[data-testid="route-query"]')?.textContent).toContain('range=month');
    expect(node.querySelectorAll('li[aria-label*="min"]')).toHaveLength(new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate());
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('preserves the original Insights page with the shell flag off',async()=>{
    await render(<InsightsPage/>);
    expect(node.textContent).toContain('Insights');
    expect(node.textContent).toContain('Loading insights');
    expect(node.querySelector('[aria-label="Effort progress"]')).toBeNull();
    expect(node.querySelector('[data-testid="v6-logged-total"]')).toBeNull();
  });
});
