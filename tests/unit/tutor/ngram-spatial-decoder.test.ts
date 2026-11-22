import {readFileSync} from 'node:fs';
import {afterEach, beforeAll, describe, expect, test} from 'vitest';
import {padEdit} from '../../../src/features/pad/padEdit';
import {parseDecoderLexicon} from '../../../src/features/tutor/writingAid/decoder/lexicon';
import {
  clearKeyTouches, decodeWord, keyCentre, languageLog, recordKeyTouch, setDecoderContext, setDecoderLexicon, spatialLog,
  touchesFor, writingDecoderReady,
} from '../../../src/features/tutor/writingAid/decoder/ngramSpatial';
import {predictWritingAid} from '../../../src/features/tutor/writingAid/engine';
import {applyWritingAidProposal, type WritingAidRequest} from '../../../src/features/tutor/writingAid/policy';

// N221 (Owner task): a simple n-gram + spatial decoder over N219's licensed lexicon.
const lexicon = parseDecoderLexicon(JSON.parse(readFileSync('public/models/writing-decoder/unigram-v1/lexicon.json', 'utf8')));
const words = (before: string, typed: string) => decodeWord(before, typed, before.length).map(item => item.word);

function request(text: string): WritingAidRequest {
  return {
    cursor: padEdit(text), anchor: {text, start: 0}, mode: 'balanced', composing: false, readOnly: false,
    target: {scopeKey: 'owner:checkpoint', mountId: 'one', editorRevision: 1, selectionRevision: 1, modeRevision: 1},
  };
}

beforeAll(() => setDecoderLexicon(lexicon));
afterEach(() => {clearKeyTouches(); setDecoderContext([]);});

describe('spatial model', () => {
  test('a tap is likeliest for its own key, less for a neighbour and negligible two keys away', () => {
    const centre = keyCentre('g')!;
    expect(spatialLog(centre, 'g')).toBe(-0);
    expect(spatialLog(centre, 'h')).toBeLessThan(0);
    expect(spatialLog(centre, 'h')).toBeGreaterThan(spatialLog(centre, 'j'));
    expect(spatialLog(centre, 'k')).toBeLessThan(-6);
    // Gboard's staggered rows: a sits half a key right of q, z a key right of q.
    expect(keyCentre('a')).toEqual({x: 1, y: 1.5});
    expect(keyCentre('z')).toEqual({x: 2, y: 2.5});
  });

  test('recorded taps are used while their letters are unchanged, and key centres otherwise', () => {
    recordKeyTouch(4, 'g', {x: 5.4, y: 1.5});
    expect(touchesFor('tg', 3)).toEqual([keyCentre('t'), {x: 5.4, y: 1.5}]);
    expect(touchesFor('th', 3)).toEqual([keyCentre('t'), keyCentre('h')]);
  });
});

describe('decoder', () => {
  test('completes a prefix with frequent words and the bigram context', () => {
    expect(writingDecoderReady()).toBe(true);
    expect(words('', 'seq')[0]).toBe('sequence');
    expect(words('proof of ', 't')[0]).toBe('the');
    expect(languageLog('the', 'of')).toBeGreaterThan(languageLog('the', ''));
    expect(words('', 'Seq')[0]).toBe('Sequence');
  });

  test('decodes near-miss taps to the word the learner meant', () => {
    expect(words('we ', 'hsve')[0]).toBe('have');
    expect(words('', 'thw').slice(0, 3)).toContain('the');
    expect(words('hello ', 'wprld')[0]).toBe('world');
    const decoded = decodeWord('we ', 'hsve', 3).find(item => item.word === 'have');
    expect(decoded?.correction).toBe(true);
  });

  test('a tap on the edge between two keys counts for the nearer one', () => {
    const typed = 'tge';
    const plain = decodeWord('', typed, 0).find(item => item.word === 'the')!.score;
    recordKeyTouch(1, 'g', {x: 5.95, y: 1.5});
    const edge = decodeWord('', typed, 0).find(item => item.word === 'the')!.score;
    expect(edge).toBeGreaterThan(plain);
  });

  test("the tutor's question favours its own words", () => {
    const before = decodeWord('', 'cau', 0).findIndex(item => item.word.toLowerCase() === 'cauchy');
    setDecoderContext(['Show that every Cauchy sequence is bounded.']);
    const decoded = decodeWord('', 'cau', 0);
    expect(decoded[0].word).toBe('Cauchy');
    expect(before === -1 || before > 0).toBe(true);
    // A word the question writes in lower case stays lower case.
    expect(decodeWord('', 'boun', 0)[0].word).toBe('bounded');
  });
});

describe('writing aid with the decoder', () => {
  test('offers a name from the tutor\'s question with its capital, replacing the typed letters', () => {
    setDecoderContext(['Show that every Cauchy sequence is bounded.']);
    const input = request('Every cau');
    const name = predictWritingAid(input).words.find(item => item.label === 'Cauchy');
    expect(name).toBeDefined();
    expect(applyWritingAidProposal(input, name!)).toEqual(padEdit('Every Cauchy '));
  });

  test('offers the decoded word in the strip as an explicit choice', () => {
    const input = request('We hsve');
    const {words: offered} = predictWritingAid(input);
    const have = offered.find(item => item.label === 'have');
    expect(have).toBeDefined();
    expect(input.cursor.text).toBe('We hsve');
    expect(applyWritingAidProposal(input, have!)).toEqual(padEdit('We have '));
  });

  test("keeps the existing engine's word in its family and fills the strip with the decoder's", () => {
    // The engine offers notation; the decoder's notate must not take its family's slot.
    expect(predictWritingAid(request('Read the nota')).words.map(item => item.label)).toContain('notation');
    // The engine offers automatic; the decoder's relatives fill the other two slots.
    const automatic = predictWritingAid(request('This is automati')).words.map(item => item.label);
    expect(automatic).toHaveLength(3);
    expect(automatic).toContain('automatic');
  });

  test('keeps the existing guards: no words in a protected proof gap or for complete proof words', () => {
    expect(predictWritingAid(request('Let X and Y be sets. Take a in ')).words).toHaveLength(0);
    expect(predictWritingAid(request('Every bounded sequence converges.')).words).toHaveLength(0);
    // Proof words are never offered as near-tap corrections of a short stem.
    expect(predictWritingAid(request('This is nkt')).words.map(item => item.label)).not.toContain('not');
  });
});
