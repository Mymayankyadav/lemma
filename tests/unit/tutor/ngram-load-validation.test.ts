import {readFileSync} from 'node:fs';
import {expect, test, vi} from 'vitest';
import {parseNgram} from '../../../src/features/tutor/writingAid/decoder/kn';

const fixture = () => new Uint8Array(readFileSync('tests/fixtures/typeahead/fifth-order.bin'));
const latex = () => new Uint8Array(readFileSync('public/models/typeahead/latex-v2/model.bin'));

// The baseline created one typed-array view per adjacent pair of history rows.
// Capture allocations, not noisy wall-clock timings or a device-specific threshold.
test('validates the shipped table without allocating a history view per row', () => {
  const bytes = latex(), views = vi.spyOn(Uint16Array.prototype, 'subarray');
  try {
    const {extended} = parseNgram(bytes);
    expect(extended?.rows.length).toBe(3);
    expect(views.mock.calls.length).toBeLessThanOrEqual(extended!.rows.length);
  } finally {views.mockRestore();}
});

test.each(['token', 'successor', 'backoff', 'nan', 'negative', 'too-large'] as const)(
  'rejects an invalid %s at the first and last table edges', fault => {
    for (const level of [0, 3]) {
      const bytes = fixture(), {words, extended} = parseNgram(bytes);
      const row = extended!.rows[level];
      if (fault === 'token') row.history[row.history.length - 1] = words.length;
      if (fault === 'successor') row.next[0] = words.length;
      if (fault === 'backoff') row.backoff[0] = Infinity;
      if (fault === 'nan') row.probability[0] = NaN;
      if (fault === 'negative') row.probability[0] = -.1;
      if (fault === 'too-large') row.probability[0] = 1.1;
      expect(() => parseNgram(bytes)).toThrow('Invalid n-gram table');
    }
  });

test('rejects duplicate histories, unordered successors and an edge range beyond the table', () => {
  for (const fault of ['history', 'continuation', 'range']) {
    const bytes = latex(), row = parseNgram(bytes).extended!.rows[1];
    if (fault === 'history') row.history.set(row.history.subarray(0, 2), 2);
    if (fault === 'continuation') {
      const i = row.start.findIndex((from, i) => row.start[i + 1] >= from + 2);
      expect(i).toBeGreaterThanOrEqual(0);
      row.next[row.start[i] + 1] = row.next[row.start[i]];
    }
    if (fault === 'range') row.start[1] = row.next.length + 1;
    expect(() => parseNgram(bytes)).toThrow();
  }
});
