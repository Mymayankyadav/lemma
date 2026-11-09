import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CalendarPage from '../../../src/features/calendar/Page';
import { emptyStudyApi, type CalendarBlockRecord, type StudyEntryRecord } from '../../../src/data/study/contract';
import { setStudyApiForTests } from '../../../src/data/study';

const flags = vi.hoisted(() => ({ v6: true }));
vi.mock('../../../src/flags', () => ({ isFlagOn: () => flags.v6 }));
vi.mock('../../../src/data/mode', () => ({ getMode: () => 'demo' }));

const appointment: CalendarBlockRecord = {
  id: 'appointment', title: 'Appointment', kind: 'busy',
  startsAt: '2026-11-06T09:30:00Z', endsAt: '2026-11-06T10:30:00Z',
  status: 'planned', version: 1, timeZone: 'UTC',
};
const study: StudyEntryRecord = {
  id: 'study', source: 'timer', intent: 'Read proofs', status: 'saved',
  rating: null, reflection: null, version: 1, createdAt: '2026-11-06T09:00:00Z',
  updatedAt: '2026-11-06T10:00:00Z', savedAt: '2026-11-06T10:00:00Z',
  intervals: [{ id: 'interval', kind: 'focus', start: '2026-11-06T09:00:00Z', end: '2026-11-06T09:30:00Z' }],
};
let root: Root, host: HTMLDivElement;

function PathIndicator() {
  const location = useLocation();
  return <output data-url>{location.pathname + location.search}</output>;
}
function makeFake(initialBlocks: CalendarBlockRecord[] = [appointment], initialEntries: StudyEntryRecord[] = [study]) {
  let savedBlocks = [...initialBlocks];
  const listCalendarBlocks = vi.fn(async () => [...savedBlocks]);
  const listStudyEntries = vi.fn(async () => initialEntries);
  const createCalendarBlock = vi.fn(async (input: Parameters<ReturnType<typeof emptyStudyApi>['createCalendarBlock']>[0]) => {
    const record: CalendarBlockRecord = { ...input, id: 'new-block', version: 1, status: 'planned' };
    savedBlocks.push(record);
    return { record, actionNo: null };
  });
  const updateCalendarBlock = vi.fn(async (id: string, expectedVersion: number, patch: Parameters<ReturnType<typeof emptyStudyApi>['updateCalendarBlock']>[2]) => {
    const previous = savedBlocks.find(b => b.id === id);
    if (!previous || previous.version !== expectedVersion) throw Object.assign(new Error('conflict'), { code: 'conflict' });
    const record: CalendarBlockRecord = { ...previous, ...patch, version: previous.version + 1 };
    savedBlocks = savedBlocks.map(b => b.id === id ? record : b);
    return { record, actionNo: null };
  });
  const deleteCalendarBlock = vi.fn(async (id: string, expectedVersion: number) => {
    const previous = savedBlocks.find(b => b.id === id);
    if (!previous || previous.version !== expectedVersion) throw Object.assign(new Error('conflict'), { code: 'conflict' });
    savedBlocks = savedBlocks.filter(b => b.id !== id);
    return { record: { id }, actionNo: null };
  });
  setStudyApiForTests({
    ...emptyStudyApi('demo'), listCalendarBlocks, listStudyEntries,
    createCalendarBlock, updateCalendarBlock, deleteCalendarBlock,
  });
  return { listCalendarBlocks, listStudyEntries, createCalendarBlock, updateCalendarBlock, deleteCalendarBlock };
}
async function render(path: string) {
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/calendar" element={<><CalendarPage/><PathIndicator/></>}/>
    <Route path="/" element={<p data-home>Legacy home</p>}/>
  </Routes></MemoryRouter>));
  await vi.waitFor(() => {
    if (flags.v6) expect(host.textContent).not.toContain('Loading calendar');
  });
}
async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label || b.textContent?.trim() === label);
  expect(button, 'Missing button ' + label).toBeDefined();
  await act(async () => button!.click());
}
async function enter(selector: string, value: string) {
  const field = host.querySelector(selector) as HTMLInputElement | null;
  expect(field, 'Missing input ' + selector).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field!.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  flags.v6 = true;
  window.history.replaceState(null, '', '/');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  setStudyApiForTests(null); host.remove();
});

it('defaults to seven-day Agenda and preserves the view and civil date in the URL', async () => {
  const fake = makeFake();
  await render('/calendar?date=2026-11-06');
  expect(host.querySelector('[aria-label="Next seven days"]')).not.toBeNull();
  expect(host.textContent).toContain('Appointment');
  await click('Day');
  expect(host.querySelector('[data-url]')?.textContent).toContain('view=day');
  expect(host.querySelector('[data-url]')?.textContent).toContain('date=2026-11-06');
  expect(host.textContent).toContain('Day schedule');
  await click('Next day');
  expect(host.querySelector('[data-url]')?.textContent).toContain('date=2026-11-07');
  expect(fake.listCalendarBlocks).toHaveBeenCalled();
  expect(fake.listStudyEntries).toHaveBeenCalled();
});
it('creates a study or busy block through StudyApi and renders it in the day', async () => {
  const fake = makeFake();
  await render('/calendar?view=day&date=2026-11-06');
  await click('New time block');
  await enter('input[maxlength="200"]', 'Seminar');
  await click('Create block');
  await vi.waitFor(() => expect(fake.createCalendarBlock).toHaveBeenCalledTimes(1));
  expect(fake.createCalendarBlock.mock.calls[0][0]).toMatchObject({ kind: 'study', title: 'Seminar', timeZone: expect.any(String) });
  expect(host.textContent).toContain('Seminar');
});
it('also creates busy blocks when selected, without bypassing StudyApi', async () => {
  const fake = makeFake([], []);
  await render('/calendar?view=day&date=2026-11-06');
  await click('New time block');
  await click('Busy');
  expect(host.querySelector('[role=radio][aria-checked=true]')?.textContent).toBe('Busy');
  await enter('input[maxlength="200"]', 'Busy hour');
  await click('Create block');
  await vi.waitFor(() => expect(fake.createCalendarBlock).toHaveBeenCalledTimes(1));
  expect(fake.createCalendarBlock.mock.calls[0][0].kind).toBe('busy');
});
it('moves, marks done and deletes a block once each through StudyApi', async () => {
  const fake = makeFake();
  await render('/calendar?view=day&date=2026-11-06');
  await click('Move Appointment');
  await enter('input[aria-label="Calendar block start"]', '11:00');
  await enter('input[aria-label="Calendar block end"]', '12:00');
  await click('Save changes');
  await vi.waitFor(() => expect(fake.updateCalendarBlock).toHaveBeenCalledTimes(1));
  expect(fake.updateCalendarBlock.mock.calls[0][0]).toBe('appointment');
  expect(fake.updateCalendarBlock.mock.calls[0][2]).toHaveProperty('startsAt');
  await click('Mark Appointment done');
  await vi.waitFor(() => expect(fake.updateCalendarBlock).toHaveBeenCalledTimes(2));
  expect(fake.updateCalendarBlock.mock.calls[1][2]).toEqual({ status: 'done' });
  await click('Delete Appointment');
  await click('Confirm delete');
  await vi.waitFor(() => expect(fake.deleteCalendarBlock).toHaveBeenCalledTimes(1));
  expect(host.textContent).not.toContain('Appointment');
});
it('shows the changed-elsewhere conflict without hiding or overwriting the block', async () => {
  const fake = makeFake();
  fake.updateCalendarBlock.mockRejectedValueOnce(Object.assign(new Error('version conflict'), { code: 'conflict' }));
  await render('/calendar?view=day&date=2026-11-06');
  await click('Mark Appointment done');
  await vi.waitFor(() => expect(host.querySelector('[role=alert]')?.textContent).toContain('Changed elsewhere, reload'));
  expect(fake.updateCalendarBlock).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain('Appointment');
  await click('Reload');
  expect(fake.listCalendarBlocks).toHaveBeenCalled();
});
it('shows Nothing planned on empty days', async () => {
  makeFake([], []);
  await render('/calendar?view=day&date=2026-11-06');
  expect(host.textContent).toContain('Nothing planned.');
});
it('does not call the study API or render the v6 Calendar when the flag is off', async () => {
  flags.v6 = false;
  const fake = makeFake();
  await render('/calendar?view=day&date=2026-11-06');
  expect(host.querySelector('[data-home]')?.textContent).toBe('Legacy home');
  expect(fake.listCalendarBlocks).not.toHaveBeenCalled();
});
