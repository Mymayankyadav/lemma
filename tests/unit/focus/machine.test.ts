import {describe,expect,it} from 'vitest';
import {loggedMinutes} from '../../../src/lib/effort';
import {
  idleFocus, inProgressFocusMinutes, remainingFocusMinutes, transitionFocus,
  type FocusState,
} from '../../../src/lib/focus/machine';

const origin = Date.parse('2026-11-06T10:00:00.000Z');
const at = (minute: number) => new Date(origin + minute * 60_000).toISOString();
const start = (focusMinutes = 25) => transitionFocus(idleFocus(), {
  type: 'start', id: 'focus-1', intent: 'Prove compactness', focusMinutes, at: at(0),
});
const next = (state: FocusState, type: 'pause' | 'resume' | 'break' | 'finish' | 'discard', minute: number) =>
  transitionFocus(state, {type, at: at(minute)});
const savedLog = (state: FocusState) => {
  if (!state.session) return 0;
  const intervals = state.session.intervals.map(span => ({
    kind: span.kind, start: span.start, end: span.end ?? at(120),
  }));
  return loggedMinutes([{id: state.session.id, status: state.phase === 'saved' ? 'saved' : 'discarded', intervals}],
    {start: at(0), end: at(120)}, 'Asia/Kolkata', at(120)).minutes;
};

describe('N14.1 timestamp-driven Focus machine', () => {
  it('starts from idle with an open focus interval', () => {
    const running = start();
    expect(running.phase).toBe('running');
    expect(running.session?.intent).toBe('Prove compactness');
    expect(running.session?.intervals).toEqual([{kind: 'focus', start: at(0), end: null}]);
    expect(inProgressFocusMinutes(running, at(6))).toBe(6);
    expect(remainingFocusMinutes(running, at(6))).toBe(19);
  });

  it('pauses without losing accumulated elapsed focus', () => {
    const running = start();
    const paused = next(running, 'pause', 8);
    expect(paused.phase).toBe('paused');
    expect(inProgressFocusMinutes(paused, at(40))).toBe(8);
    expect(paused.session?.intervals[0].end).toBe(at(8));
    expect(running.session?.intervals[0].end).toBeNull();
  });

  it('resumes from a pause and counts only active intervals', () => {
    const paused = next(start(), 'pause', 5);
    const resumed = next(paused, 'resume', 15);
    expect(resumed.phase).toBe('running');
    expect(resumed.session?.intervals).toHaveLength(2);
    expect(inProgressFocusMinutes(resumed, at(20))).toBe(10);
  });

  it('excludes a break while retaining focus before and after it', () => {
    const breaking = next(start(), 'break', 4);
    expect(breaking.phase).toBe('break');
    expect(inProgressFocusMinutes(breaking, at(18))).toBe(4);
    expect(breaking.session?.intervals[1].kind).toBe('break');
    const resumed = next(breaking, 'resume', 18);
    const finished = next(resumed, 'finish', 24);
    expect(inProgressFocusMinutes(finished, at(30))).toBe(10);
    expect(finished.session?.intervals.every(span => span.end !== null)).toBe(true);
  });

  it('finishes running focus and freezes elapsed time from timestamps', () => {
    const finished = next(start(), 'finish', 12);
    expect(finished.phase).toBe('finishing');
    expect(finished.session?.finishedAt).toBe(at(12));
    expect(inProgressFocusMinutes(finished, at(60))).toBe(12);
  });

  it('finishes paused focus without creating a new interval', () => {
    const paused = next(start(), 'pause', 6);
    const finished = next(paused, 'finish', 20);
    expect(finished.phase).toBe('finishing');
    expect(finished.session?.intervals).toHaveLength(1);
    expect(inProgressFocusMinutes(finished, at(80))).toBe(6);
  });

  it('restores elapsed effort from serialized timestamps instead of ticks', () => {
    const running = next(next(start(), 'pause', 7), 'resume', 19);
    const restored = JSON.parse(JSON.stringify(running)) as FocusState;
    expect(inProgressFocusMinutes(restored, at(24))).toBe(12);
    expect(inProgressFocusMinutes(restored, at(25))).toBe(13);
    expect(remainingFocusMinutes(restored, at(25))).toBe(12);
  });

  it('caps a three-hour open Pomodoro at its configured focus length', () => {
    const running = start(20);
    expect(inProgressFocusMinutes(running, at(180))).toBe(20);
    expect(remainingFocusMinutes(running, at(180))).toBe(0);
  });

  it('saves only after finishing and preserves the optional edited minutes and reflection', () => {
    const finished = next(start(), 'finish', 13);
    const saved = transitionFocus(finished, {type: 'save', at: at(15), minutes: 12, reflection: 'Understood'});
    expect(saved.phase).toBe('saved');
    expect(saved.session?.savedMinutes).toBe(12);
    expect(saved.session?.reflection).toBe('Understood');
    expect(savedLog(saved)).toBe(13);
    expect(inProgressFocusMinutes(saved, at(90))).toBe(0);
  });

  it('uses measured minutes when no manual edit is supplied', () => {
    const finished = next(start(), 'finish', 9);
    const saved = transitionFocus(finished, {type: 'save', at: at(15)});
    expect(saved.session?.savedMinutes).toBe(9);
  });

  it('discards without contributing saved focus time', () => {
    const finished = next(start(), 'finish', 10);
    const discarded = next(finished, 'discard', 12);
    expect(discarded.phase).toBe('discarded');
    expect(discarded.session?.savedMinutes).toBeNull();
    expect(savedLog(discarded)).toBe(0);
  });

  it('rejects double save and invalid terminal transitions', () => {
    const saved = transitionFocus(next(start(), 'finish', 10), {type: 'save', at: at(11)});
    expect(() => transitionFocus(saved, {type: 'save', at: at(12)})).toThrow(/Finish Focus/);
    expect(() => next(saved, 'resume', 13)).toThrow(/resume/);
    expect(() => next(saved, 'discard', 14)).toThrow(/Finish Focus/);
  });

  it('rejects invalid transitions without mutating the state', () => {
    const idle = idleFocus();
    expect(() => next(idle, 'pause', 1)).toThrow(/not started/);
    const running = start();
    const snapshot = JSON.stringify(running);
    expect(() => next(running, 'resume', 1)).toThrow(/resume/);
    expect(() => next(running, 'finish', -1)).toThrow(/backwards/);
    expect(JSON.stringify(running)).toBe(snapshot);
    const breaking = next(running, 'break', 1);
    expect(() => next(breaking, 'finish', 2)).toThrow(/finish/);
    expect(() => next(breaking, 'pause', 2)).toThrow(/pause/);
  });

  it('rejects invalid ids, durations, timestamps and edited minutes', () => {
    expect(() => transitionFocus(idleFocus(), {
      type: 'start', id: '  ', intent: '', focusMinutes: 25, at: at(0),
    })).toThrow(/id required/);
    expect(() => start(0)).toThrow(/Positive focusMinutes/);
    expect(() => transitionFocus(start(), {type: 'pause', at: 'not-a-time'})).toThrow(/timestamp/);
    const finished = next(start(), 'finish', 2);
    expect(() => transitionFocus(finished, {type: 'save', at: at(1)})).toThrow(/backwards/);
    expect(() => transitionFocus(finished, {type: 'save', at: at(3), minutes: -1})).toThrow(/saved minutes/);
    expect(() => transitionFocus(finished, {type: 'save', at: at(3), minutes: Infinity})).toThrow(/saved minutes/);
  });
});
