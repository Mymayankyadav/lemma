import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {getGoalApi, setGoalApiForTests} from '../../../src/data/study-goals';
import {getStudyApi, setStudyApiForTests} from '../../../src/data/study';

const range = {start: '2026-11-01T00:00:00Z', end: '2026-11-30T00:00:00Z'};
function selectDemo(profile: '1' | 'first-use') {
  window.history.replaceState(null, '', '/?demo=' + profile);
}

beforeEach(() => {
  sessionStorage.clear();
  vi.useFakeTimers({toFake: ['Date']});
  vi.setSystemTime(new Date('2026-11-09T12:00:00Z'));
});

afterEach(() => {
  setStudyApiForTests(null);
  setGoalApiForTests(null);
  window.history.replaceState(null, '', '/');
  sessionStorage.clear();
  vi.useRealTimers();
});

it('keeps first-use study history, calendar blocks and goals separate from the populated demo', async () => {
  selectDemo('1');
  const populatedStudy = getStudyApi();
  const populatedGoals = getGoalApi();
  const exampleEntries = await populatedStudy.listStudyEntries(range);
  const exampleBlocks = await populatedStudy.listCalendarBlocks(range);
  const exampleGoals = await populatedGoals.listGoals();
  expect(exampleEntries).not.toHaveLength(0);
  expect(exampleBlocks).not.toHaveLength(0);
  expect(exampleGoals.items).not.toHaveLength(0);

  selectDemo('first-use');
  const firstStudy = getStudyApi();
  const firstGoals = getGoalApi();
  expect(await firstStudy.listStudyEntries(range)).toEqual([]);
  expect(await firstStudy.listCalendarBlocks(range)).toEqual([]);
  expect((await firstGoals.listGoals()).items).toEqual([]);

  const {record: entry} = await firstStudy.createManualStudyEntry({
    intent: 'Read a proof',
    intervals: [{kind: 'focus', start: '2026-11-09T10:00:00Z', end: '2026-11-09T10:30:00Z'}],
  });
  const {record: block} = await firstStudy.createCalendarBlock({
    kind: 'study', title: 'Finish the proof',
    startsAt: '2026-11-10T10:00:00Z', endsAt: '2026-11-10T11:00:00Z', timeZone: 'UTC',
  });
  const {record: goal} = await firstGoals.createGoal({
    period: 'week', startDate: '2026-11-09', endDate: '2026-11-15', targetMinutes: 60, timeZone: 'UTC',
  });

  selectDemo('1');
  expect(await getStudyApi().listStudyEntries(range)).toEqual(exampleEntries);
  expect(await getStudyApi().listCalendarBlocks(range)).toEqual(exampleBlocks);
  expect(await getGoalApi().listGoals()).toEqual(exampleGoals);

  selectDemo('first-use');
  expect(await getStudyApi().listStudyEntries(range)).toEqual([entry]);
  expect(await getStudyApi().listCalendarBlocks(range)).toEqual([block]);
  expect((await getGoalApi().listGoals()).items).toEqual([goal]);
});
