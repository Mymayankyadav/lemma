import {beforeEach, describe, expect, it, vi} from 'vitest';
import {insightDays} from '../../../src/features/insights/v7/progressModel';
import {LiveAdapter} from '../../../src/data/live/adapter';
import {buildInsights} from '../../../src/lib/insights';
import type {InsightData} from '../../../src/data/types';

const mock = vi.hoisted(() => ({rpc: vi.fn(), getUser: vi.fn()}));
vi.mock('../../../src/data/live/client', () => ({liveClient: () => ({rpc: mock.rpc, auth: {getUser: mock.getUser}})}));

// N223 (Owner: "Tutor session stats is bs I started talking today only"): Progress → Today fetched seven days of
// insights, and the live aggregate's totals cover everything it was asked for, so a week of sessions showed as today's.
describe('Progress Today', () => {
  beforeEach(() => {
    mock.rpc.mockReset();
    mock.getUser.mockReset();
    mock.getUser.mockResolvedValue({data: {user: {id: 'owner-1'}}, error: null});
  });

  it('asks for one study day, not seven', async () => {
    expect(insightDays('day')).toBe(1);
    expect(insightDays('7')).toBe(7);
    mock.rpc.mockResolvedValue({data: {days: 1, reviews: 0, right: 0, reviewDays: [], calibration: [], sessions: 1, minutes: 25,
      typicalSession: 25, subjectMinutes: [], checkpointDays: [], mostRevisited: null}, error: null});
    const payload = await new LiveAdapter().getInsightData(insightDays('day'));
    expect(mock.rpc).toHaveBeenCalledWith('insights', {p_days: 1});
    expect(buildInsights(payload, insightDays('day')).minutes).toBe(25);
  });

  it('counts only today\'s sessions from raw history', () => {
    const now = Date.parse('2026-11-22T12:00:00Z');
    const data: InsightData = {reviews: [], checkpointEvents: [], projects: [], misconceptions: [], sessions: [
      {startedAt: '2026-11-22T08:00:00Z', minutes: 25, projectId: 'p', goalMet: null},
      {startedAt: '2026-11-20T08:00:00Z', minutes: 700, projectId: 'p', goalMet: null},
    ]};
    expect(buildInsights(data, insightDays('day'), {now, timeZone: 'UTC', rolloverHour: 4}).minutes).toBe(25);
    expect(buildInsights(data, insightDays('7'), {now, timeZone: 'UTC', rolloverHour: 4}).minutes).toBe(725);
  });
});
