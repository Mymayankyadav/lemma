import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProgressV6 from '../../../src/features/progress-v6/Page';
import InsightsPage from '../../../src/features/insights/Page';
import { emptyStudyApi, type StudyEntryRecord } from '../../../src/data/study/contract';
import { setStudyApiForTests } from '../../../src/data/study';
import { useV6HeaderTitleStore } from '../../../src/app/v6Title';

const flags = vi.hoisted(() => ({ on: true }));
vi.mock('../../../src/flags', () => ({ isFlagOn: () => flags.on }));
vi.mock('../../../src/data/mode', () => ({ getMode: () => 'demo' }));
vi.mock('../../../src/data/hooks', () => ({
  useInsightData: () => ({ isPending: true, data: undefined }),
  useSettings: () => ({ isPending: true, data: undefined }),
}));

const record: StudyEntryRecord = {
  id:'math', intent:'Study mathematics', source:'timer', status:'saved', version:1,
  reflection:null, rating:null, createdAt:'2026-11-07T09:00:00Z', updatedAt:'2026-11-07T10:00:00Z',
  savedAt:'2026-11-07T10:00:00Z', subjectId:'Number theory',
  intervals:[{ id:'minute', kind:'focus', start:'2026-11-07T09:00:00Z', end:'2026-11-07T10:00:00Z' }],
};
let host: HTMLDivElement, root: Root;
function Location() { const location=useLocation(); return <output data-url>{location.pathname + location.search}</output>; }
function fakeStudyApi(entries: StudyEntryRecord[] = [record]) {
  const listStudyEntries = vi.fn(async () => entries);
  setStudyApiForTests({ ...emptyStudyApi('demo'), listStudyEntries });
  return listStudyEntries;
}
async function render(path = '/insights?range=day', integrated = false) {
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}>
    {integrated ? <InsightsPage/> : <ProgressV6/>}<Location/>
  </MemoryRouter>));
}
async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label);
  expect(button, 'Missing ' + label).toBeDefined();
  await act(async () => button!.click());
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT:true });
  vi.useFakeTimers({ toFake:['Date'] });
  vi.setSystemTime(new Date('2026-11-07T12:00:00Z'));
  flags.on = true;
  window.history.replaceState(null, '', '/');
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  setStudyApiForTests(null);host.remove();vi.useRealTimers();
});
it('reads StudyApi, shows saved totals, and preserves the range in the URL', async () => {
  const list = fakeStudyApi();
  await render();
  await vi.waitFor(() => expect(host.textContent).toContain('60 min'));
  expect(list).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain('Number theory');
  expect(host.textContent).toContain('Subject totals: 60 min');
  await click('Week');
  await vi.waitFor(() => expect(host.querySelector('[aria-label="Daily logged minutes"]')).not.toBeNull());
  expect(host.querySelector('[data-url]')?.textContent).toContain('range=week');
  expect(host.querySelectorAll('[aria-label="Daily logged minutes"] time')).toHaveLength(7);
  await click('Month');
  await vi.waitFor(() => expect(host.querySelectorAll('[aria-label="Daily logged minutes"] time')).toHaveLength(30));
  expect(host.querySelector('[data-url]')?.textContent).toContain('range=month');
});
it('does not count draft or discarded records and shows the empty state', async () => {
  fakeStudyApi([{ ...record, status:'draft' }, { ...record, id:'discarded', status:'discarded' }]);
  await render();
  await vi.waitFor(() => expect(host.textContent).toContain('0 min'));
  expect(host.textContent).toContain('No saved study time in this range.');
});
it('shows errors and permits retry', async () => {
  const list = fakeStudyApi();
  list.mockRejectedValueOnce(new Error('Offline'));
  await render();
  await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain('Offline'));
  await click('Retry');
  await vi.waitFor(() => expect(host.textContent).toContain('60 min'));
  expect(list).toHaveBeenCalledTimes(2);
});
it('keeps legacy Insights unchanged and does not mount v6 StudyApi when flag is off', async () => {
  flags.on=false;
  const list = fakeStudyApi();
  await render('/insights', true);
  expect(host.textContent).toContain('Insights');
  expect(host.textContent).toContain('Loading insights');
  expect(host.textContent).not.toContain('Study effort');
  expect(list).not.toHaveBeenCalled();
});
it('renders v6 effort on Overview and the legacy Insights content on Learning when enabled', async () => {
  flags.on=true;
  fakeStudyApi();
  await render('/insights?range=day', true);
  await vi.waitFor(() => expect(host.textContent).toContain('60 min'));
  // N115: Overview carries the stat tiles and saved effort; Learning carries the legacy charts.
  expect(host.textContent).toContain('Study effort');
  // #1330: the subtitle lives in the shell header, not in the page body.
  expect(useV6HeaderTitleStore.getState().subtitle).toBe('Small steps, seen over time.');
  expect(host.textContent).not.toContain('Small steps');
  expect(host.textContent).not.toContain('Insights');
  await click('Learning');
  expect(host.textContent).toContain('Insights');
  expect(host.querySelector('[data-url]')?.textContent).toContain('view=learning');
  expect(host.textContent).not.toContain('Study effort');
});

it('#1319 shows the overlap notice with a Time log link when saved focus overlaps, and not otherwise', async () => {
  flags.on=true;
  fakeStudyApi([record]);
  await render('/insights?range=7', true);
  await vi.waitFor(() => expect(host.textContent).toContain('Time range'));
  expect(host.textContent).not.toContain('overlap or need correction');
  await act(async () => root.unmount()); root=createRoot(host); host.replaceChildren();
  const overlapping={...record,id:'math-2',intervals:[{ id:'second', kind:'focus' as const, start:'2026-11-07T09:30:00Z', end:'2026-11-07T10:30:00Z' }]};
  fakeStudyApi([record,overlapping]);
  await render('/insights?range=7', true);
  await vi.waitFor(() => expect(host.textContent).toContain('Some saved time entries overlap or need correction. Each minute is counted once.'));
  expect(host.querySelector('a[href="#/log"]')?.textContent).toBe('Check your log');
});
