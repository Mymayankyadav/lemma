import {afterEach, describe, expect, test} from 'vitest';
import {correctTap, isWordPrefix, setTapCorrectionWords, type KeyBox} from '../../../src/features/tutor/tapCorrection';

// N220 (Owner report): Gboard-style tap correction on the answer keyboard. Three staggered rows of 36 × 48 px keys.
const rows: [string, number, number][] = [['qwertyuiop', 0, 0], ['asdfghjkl', 18, 56], ['zxcvbnm', 54, 112]];
const keys: KeyBox[] = rows.flatMap(([letters, left, top]) => [...letters].map((letter, index) =>
  ({letter, x: left + index * 36, y: top, width: 36, height: 48})));
const centre = (letter: string) => {
  const key = keys.find(box => box.letter === letter)!;
  return {x: key.x + key.width / 2, y: key.y + key.height / 2};
};

afterEach(() => setTapCorrectionWords(null));

describe('tap correction', () => {
  test('knows which prefixes continue a word', () => {
    setTapCorrectionWords(['the', 'then', 'tree', 'try']);
    expect(isWordPrefix('th')).toBe(true);
    expect(isWordPrefix('then')).toBe(true);
    expect(isWordPrefix('thr')).toBe(false);
    expect(isWordPrefix('z')).toBe(false);
  });

  test('a touch on the outer part of a key types the neighbour that continues the word', () => {
    setTapCorrectionWords(['the', 'then', 'tree', 'try']);
    // 14 px left of R's centre, towards E: "thr" starts no word, "the" does.
    const nearE = {x: centre('r').x - 14, y: centre('r').y};
    expect(correctTap('r', nearE, keys, 'th')).toBe('e');
    expect(correctTap('R', nearE, keys, 'TH')).toBe('E');
  });

  test('the touched letter wins at its centre, when it continues a word, and for a word’s first letter', () => {
    setTapCorrectionWords(['the', 'then', 'tree', 'try']);
    const nearE = {x: centre('r').x - 14, y: centre('r').y};
    expect(correctTap('r', centre('r'), keys, 'th')).toBe('r');
    expect(correctTap('r', nearE, keys, 't')).toBe('r');
    expect(correctTap('r', nearE, keys, '')).toBe('r');
  });

  test('nothing changes before the word list has loaded or after a non-letter', () => {
    const nearE = {x: centre('r').x - 14, y: centre('r').y};
    expect(correctTap('r', nearE, keys, 'th')).toBe('r');
    setTapCorrectionWords(['the']);
    expect(correctTap('r', nearE, keys, 't1')).toBe('r');
    expect(correctTap('1', nearE, keys, 'th')).toBe('1');
  });
});
