import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createDemoStudyApi} from '../../../src/data/study/demo';
import {replayTimerActions} from '../../../src/platform/timer';
import type {PendingTimerAction} from '../../../src/platform/bridge';
import {effortSummary, periodFor} from '../../../src/features/progress-v6/model';
import {focusClock} from '../../../src/app/v7/focus';

const beginning = Date.parse('2026-11-14T10:00:00.000Z');
beforeEach(() => {sessionStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(beginning);});
afterEach(() => {vi.clearAllTimers(); vi.useRealTimers();});

function nativeQueue(initial: PendingTimerAction[]) {
  let pending = [...initial];
  return {
    pending: () => pending,
    timerPendingActions: vi.fn(async () => ({actions: [...pending]})),
    timerAckActions: vi.fn(async ({ids}: {ids: string[]}) => {pending = pending.filter(a => !ids.includes(a.id));}),
  };
}

describe('Additional timer data defects on main b809da0', () => {
  it('retains a pending pause when the server read temporarily fails', async () => {
    const api = createDemoStudyApi();
    const {record} = await api.startStudyEntry({source: 'timer', intent: 'Proof'});
    const native = nativeQueue([{id: 'pause-1', action: 'pause', entryId: record.id, version: record.version, at: beginning + 60_000}]);
    const unreliable = {...api, activeStudyEntry: vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))};
    await replayTimerActions(native, unreliable, async () => {});
    expect(native.pending()).toHaveLength(1);
  });

  it('replays an offline pause/resume chain without dropping the resume', async () => {
    const api = createDemoStudyApi();
    const {record} = await api.startStudyEntry({source: 'timer', intent: 'Proof'});
    const native = nativeQueue([
      {id: 'pause-1', action: 'pause', entryId: record.id, version: record.version, at: beginning + 5 * 60_000},
      {id: 'resume-1', action: 'resume', entryId: record.id, version: record.version, at: beginning + 10 * 60_000},
    ]);
    vi.setSystemTime(beginning + 15 * 60_000);
    const outcomes = await replayTimerActions(native, api, async () => {});
    expect({outcomes, status: (await api.activeStudyEntry())?.status}).toEqual({outcomes: ['applied', 'applied'], status: 'running'});
  });

  it('does not count the offline time after the user pressed Pause as focused time', async () => {
    const api = createDemoStudyApi();
    const {record} = await api.startStudyEntry({source: 'timer', intent: 'Proof'});
    const pauseAt = beginning + 5 * 60_000;
    const native = nativeQueue([{id: 'pause-1', action: 'pause', entryId: record.id, version: record.version, at: pauseAt}]);
    vi.setSystemTime(beginning + 30 * 60_000);
    await replayTimerActions(native, api, async () => {});
    expect((await api.activeStudyEntry())?.intervals[0].end).toBe(new Date(pauseAt).toISOString());
  });

  it('subtracts excluded distraction minutes from saved Progress totals', async () => {
    const api = createDemoStudyApi();
    const {record} = await api.startStudyEntry({source: 'timer', intent: 'Proof'});
    vi.setSystemTime(beginning + 25 * 60_000);
    const excluded = await api.excludeMinutes(record.id, record.version, 10, 'Distracted');
    const saved = await api.saveStudyEntry(record.id, excluded.record.version);
    expect(saved.record.excludedIntervals).toHaveLength(1);
    const summary = effortSummary([saved.record], periodFor('day', new Date(), 'UTC'), 'UTC', new Date().toISOString());
    expect(summary.minutes).toBe(15);
  });

  it('subtracts exclusions from the active timer clock too', async () => {
    const api = createDemoStudyApi();
    const {record} = await api.startStudyEntry({source: 'timer', intent: 'Proof'});
    vi.setSystemTime(beginning + 25 * 60_000);
    const excluded = await api.excludeMinutes(record.id, record.version, 10, 'Distracted');
    expect(focusClock(excluded.record, Date.now()).seconds).toBe(15 * 60);
  });
});

it('saving the displayed net minutes preserves a distraction in the middle of the session',async()=>{
 const api=createDemoStudyApi();const {record}=await api.startStudyEntry({source:'timer',intent:'Proof'});
 vi.setSystemTime(beginning+15*60000);
 const excluded=await api.excludeMinutes(record.id,record.version,10,'Distracted');
 vi.setSystemTime(beginning+25*60000);
 const saved=await api.saveStudyEntry(record.id,excluded.record.version,{minutes:15});
 expect(focusClock(saved.record,Date.now()).seconds).toBe(15*60);
 expect(saved.record.intervals[0].end).toBe(new Date(beginning+25*60000).toISOString());
});
