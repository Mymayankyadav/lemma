import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoStudyApi } from '../../../src/data/study/demo';
import { inProgressMinutes, loggedMinutes } from '../../../src/lib/effort';
import type { StudyEntryRecord } from '../../../src/data/study/contract';

const t = (minute: number) => new Date(Date.parse('2026-11-06T10:00:00Z') + minute * 60_000).toISOString();
const range = { start: t(-120), end: t(240) };
const input = { intent: 'Prove a theorem', source: 'timer' as const, subjectId: 'subject-analysis', startedAt: t(0) };
const logged = (record: StudyEntryRecord) => loggedMinutes(
  [{ ...record, intervals: record.intervals.map(i => ({ ...i, end: i.end ?? i.start })) }],
  range, 'UTC', range.end).minutes;
const blockInput = {
  kind: 'study' as const, title: 'Proof practice', startsAt: t(60), endsAt: t(90),
  timeZone: 'Asia/Kolkata', subjectId: 'subject-analysis',
};

describe('N14.2 in-memory demo StudyApi', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(t(0)));
  });
  afterEach(() => { vi.useRealTimers(); sessionStorage.clear(); });

  it('seeds saved study entries and calendar blocks in this week, sorted and independently copied', async () => {
    const api = createDemoStudyApi();
    expect(api.mode).toBe('demo');
    const week = { start: '2026-11-01T00:00:00Z', end: '2026-11-09T00:00:00Z' };
    const entries = await api.listStudyEntries(week);
    const blocks = await api.listCalendarBlocks(week);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(entries.every(e => e.status === 'saved' && e.savedAt && e.intervals.length > 0)).toBe(true);
    expect(new Set(entries.map(e => e.id)).size).toBe(entries.length);
    expect(entries.map(e => e.createdAt)).toEqual([...entries.map(e => e.createdAt)].sort());
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks.map(b => b.startsAt)).toEqual([...blocks.map(b => b.startsAt)].sort());
    entries[0].intervals.length = 0;
    blocks[0].title = 'Tampered';
    expect((await api.listStudyEntries(week))[0].intervals.length).toBeGreaterThan(0);
    expect((await api.listCalendarBlocks(week))[0].title).not.toBe('Tampered');
  });

  it('starts a single versioned active entry and rejects a second concurrent start', async () => {
    const api = createDemoStudyApi();
    const started = await api.startStudyEntry(input);
    expect(started.actionNo).toBeNull();
    expect(started.record).toMatchObject({ status: 'running', version: 1, source: 'timer', intent: input.intent });
    expect(started.record.intervals).toMatchObject([{ kind: 'focus', start: t(0), end: null }]);
    expect((await api.activeStudyEntry())?.id).toBe(started.record.id);
    await expect(api.startStudyEntry(input)).rejects.toMatchObject({ code: 'conflict' });
    expect((await api.listStudyEntries({ start: t(200), end: t(201) })).some(e => e.id === started.record.id)).toBe(true);
  });

  it('pauses and resumes using immutable interval boundaries and monotonic version numbers', async () => {
    const api = createDemoStudyApi();
    const start = (await api.startStudyEntry(input)).record;
    const paused = await api.pauseStudyEntry(start.id, start.version, t(12));
    expect(paused.record).toMatchObject({ status: 'paused', version: 2 });
    expect(paused.record.intervals[0].end).toBe(t(12));
    const resumed = await api.resumeStudyEntry(start.id, paused.record.version, t(20));
    expect(resumed.record).toMatchObject({ status: 'running', version: 3 });
    expect(resumed.record.intervals).toHaveLength(2);
    expect(resumed.record.intervals[1]).toMatchObject({ kind: 'focus', start: t(20), end: null });
    expect(start.intervals[0].end).toBeNull();
    await expect(api.pauseStudyEntry(start.id, paused.record.version, t(30))).rejects.toMatchObject({ code: 'conflict' });
    await expect(api.resumeStudyEntry(start.id, resumed.record.version, t(40))).rejects.toMatchObject({ code: 'conflict' });
    await expect(api.pauseStudyEntry(start.id, resumed.record.version, t(19))).rejects.toMatchObject({ code: 'invalid' });
  });

  it('never counts breaks as focus, including when saving directly from a break', async () => {
    const api = createDemoStudyApi();
    const start = (await api.startStudyEntry(input)).record;
    const breaking = (await api.breakStudyEntry(start.id, start.version, t(10))).record;
    expect(breaking.status).toBe('paused');
    expect(breaking.intervals.map(i => i.kind)).toEqual(['focus', 'break']);
    expect(breaking.intervals[1].end).toBeNull();
    const resumed = (await api.resumeStudyEntry(start.id, breaking.version, t(25))).record;
    vi.setSystemTime(new Date(t(45)));
    const saved = (await api.saveStudyEntry(start.id, resumed.version)).record;
    expect(saved.status).toBe('saved');
    expect(saved.intervals.map(i => i.kind)).toEqual(['focus', 'break', 'focus']);
    expect(saved.intervals.every(i => i.end !== null)).toBe(true);
    expect(logged(saved)).toBe(30);
    expect((await api.activeStudyEntry())).toBeNull();
  });

  it('rebuilds running and paused elapsed focus from sessionStorage timestamps after reload', async () => {
    const first = createDemoStudyApi();
    const start = (await first.startStudyEntry(input)).record;
    vi.setSystemTime(new Date(t(14)));
    const reloaded = createDemoStudyApi();
    const active = await reloaded.activeStudyEntry();
    expect(active?.id).toBe(start.id);
    expect(active?.intervals[0]).toMatchObject({ start: t(0), end: null });
    const measured = inProgressMinutes({ startedAt: active!.createdAt, focusMinutes: 60,
      intervals: active!.intervals.map(i => ({ ...i, end: i.end ?? t(14) })) }, t(14));
    expect(measured).toBe(14);
    const paused = (await reloaded.pauseStudyEntry(start.id, active!.version, t(14))).record;
    vi.setSystemTime(new Date(t(59)));
    const again = await createDemoStudyApi().activeStudyEntry();
    expect(again).toMatchObject({ id: start.id, status: 'paused', version: paused.version });
    expect(inProgressMinutes({ startedAt: again!.createdAt, focusMinutes: 60,
      phase: 'paused', intervals: again!.intervals.map(i => ({ ...i, end: i.end! })) }, t(59))).toBe(14);
  });

  it('saves once, keeps its receipt stable on retry, persists reflection and rating', async () => {
    const api = createDemoStudyApi();
    const started = (await api.startStudyEntry(input)).record;
    vi.setSystemTime(new Date(t(17)));
    const once = await api.saveStudyEntry(started.id, started.version, { reflection: 'Understand the proof', rating: 4 });
    const twice = await api.saveStudyEntry(started.id, started.version, { reflection: 'Overwritten', minutes: 0 });
    expect(once).toEqual(twice);
    expect(once.actionNo).toBeNull();
    expect(once.record).toMatchObject({ status: 'saved', version: 2, rating: 4, reflection: 'Understand the proof' });
    expect((await createDemoStudyApi().listStudyEntries(range)).find(e => e.id === started.id)).toEqual(once.record);
    await expect(api.discardStudyEntry(started.id, once.record.version)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('supports edited logged minutes without counting persisted break spans', async () => {
    const api = createDemoStudyApi();
    const started = (await api.startStudyEntry(input)).record;
    const paused = (await api.breakStudyEntry(started.id, started.version, t(10))).record;
    const resumed = (await api.resumeStudyEntry(started.id, paused.version, t(20))).record;
    vi.setSystemTime(new Date(t(30)));
    const saved = (await api.saveStudyEntry(started.id, resumed.version, { minutes: 15 })).record;
    expect(saved.intervals.some(i => i.kind === 'break')).toBe(true);
    expect(logged(saved)).toBe(15);
    const second = (await api.startStudyEntry({ ...input, startedAt: t(30) })).record;
    vi.setSystemTime(new Date(t(40)));
    const larger = (await api.saveStudyEntry(second.id, second.version, { minutes: 25 })).record;
    expect(logged(larger)).toBe(25);
  });

  it('discards intervals, logs zero and lets a new entry start', async () => {
    const api = createDemoStudyApi();
    const start = (await api.startStudyEntry(input)).record;
    vi.setSystemTime(new Date(t(30)));
    const discarded = await api.discardStudyEntry(start.id, start.version);
    expect(discarded.actionNo).toBeNull();
    expect(discarded.record).toMatchObject({ status: 'discarded', intervals: [], savedAt: null, version: 2 });
    expect(logged(discarded.record)).toBe(0);
    expect(await api.activeStudyEntry()).toBeNull();
    expect((await api.startStudyEntry({ ...input, startedAt: t(30) })).record.status).toBe('running');
    await expect(api.discardStudyEntry(start.id, discarded.record.version)).rejects.toMatchObject({ code: 'conflict' });
    await expect(api.saveStudyEntry(start.id, discarded.record.version)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('filters saved entries and calendar blocks by half-open overlap, not containment', async () => {
    const api = createDemoStudyApi();
    const start = (await api.startStudyEntry(input)).record;
    vi.setSystemTime(new Date(t(30)));
    await api.saveStudyEntry(start.id, start.version);
    expect((await api.listStudyEntries({ start: t(29), end: t(31) })).some(e => e.id === start.id)).toBe(true);
    expect((await api.listStudyEntries({ start: t(30), end: t(31) })).some(e => e.id === start.id)).toBe(false);
    expect((await api.listStudyEntries({ start: t(-1), end: t(0) })).some(e => e.id === start.id)).toBe(false);
    const block = (await api.createCalendarBlock(blockInput)).record;
    expect((await api.listCalendarBlocks({ start: t(89), end: t(100) })).some(b => b.id === block.id)).toBe(true);
    expect((await api.listCalendarBlocks({ start: t(90), end: t(100) })).some(b => b.id === block.id)).toBe(false);
    await expect(api.listCalendarBlocks({ start: t(50), end: t(50) })).rejects.toMatchObject({ code: 'invalid' });
  });

  it('creates, moves, marks done and deletes a calendar block with version checks', async () => {
    const api = createDemoStudyApi();
    const created = await api.createCalendarBlock(blockInput);
    expect(created.actionNo).toBeNull();
    expect(created.record).toMatchObject({ kind: 'study', title: blockInput.title, status: 'planned', version: 1 });
    const moved = await api.updateCalendarBlock(created.record.id, 1, { startsAt: t(70), endsAt: t(100) });
    expect(moved.record).toMatchObject({ startsAt: t(70), endsAt: t(100), version: 2 });
    const done = await api.updateCalendarBlock(created.record.id, 2, { status: 'done', title: 'Solved' });
    expect(done.record).toMatchObject({ status: 'done', title: 'Solved', version: 3 });
    await expect(api.updateCalendarBlock(created.record.id, 1, { status: 'cancelled' })).rejects.toMatchObject({ code: 'conflict' });
    expect((await createDemoStudyApi().listCalendarBlocks({ start: t(70), end: t(101) })).find(b => b.id === created.record.id)).toEqual(done.record);
    const deleted = await api.deleteCalendarBlock(created.record.id, 3);
    expect(deleted).toEqual({ record: { id: created.record.id }, actionNo: null });
    await expect(api.deleteCalendarBlock(created.record.id, 3)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects missing resources and invalid data without modifying snapshots', async () => {
    const api = createDemoStudyApi();
    await expect(api.pauseStudyEntry('missing', 1)).rejects.toMatchObject({ code: 'not_found' });
    await expect(api.updateCalendarBlock('missing', 1, {})).rejects.toMatchObject({ code: 'not_found' });
    await expect(api.startStudyEntry({ ...input, intent: '  ' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(api.createCalendarBlock({ ...blockInput, endsAt: blockInput.startsAt })).rejects.toMatchObject({ code: 'invalid' });
    await expect(api.createCalendarBlock({ ...blockInput, timeZone: 'Not/Valid' })).rejects.toMatchObject({ code: 'invalid' });
    const started = (await api.startStudyEntry(input)).record;
    vi.setSystemTime(new Date(t(10)));
    await expect(api.saveStudyEntry(started.id, started.version, { minutes: -5 })).rejects.toMatchObject({ code: 'invalid' });
    expect((await api.activeStudyEntry())?.version).toBe(1);
  });
});
