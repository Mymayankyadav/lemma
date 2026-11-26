import {readFileSync} from 'node:fs';
import {afterEach, beforeAll, describe, expect, test} from 'vitest';
import {padEdit} from '../../../src/features/pad/padEdit';
import {parseLexiconTsv} from '../../../src/features/tutor/writingAid/decoder/completeLexicon';
import {createDecoderLexicon, searchDecoderLexicon} from '../../../src/features/tutor/writingAid/decoder/lexicon';
import {
  clearKeyTouches, decodeWord, keyCentre, languageLog, recordKeyTouch, setDecoderContext, setDecoderLexicon, spatialLog,
  touchesFor, writingDecoderReady,
} from '../../../src/features/tutor/writingAid/decoder/ngramSpatial';
import {predictWritingAid} from '../../../src/features/tutor/writingAid/engine';
import {applyWritingAidProposal, type WritingAidRequest} from '../../../src/features/tutor/writingAid/policy';

// N221 (Owner task): a simple n-gram + spatial decoder over N219's licensed lexicon.
const lexicon = parseLexiconTsv(readFileSync('public/models/writing-decoder/unigram-v2/lexicon.tsv', 'utf8'));
const words = (before: string, typed: string) => decodeWord(before, typed, before.length).map(item => item.word);
/** Letters tapped on the answer keyboard, each at its key's centre. */
function tap(start: number, letters: string) {
  [...letters].forEach((letter, offset) => recordKeyTouch(start + offset, letter, keyCentre(letter)!));
}

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
    expect(touchesFor('tg', 3)).toEqual([keyCentre('t'), {x: 5.4, y: 1.5, tapped: true}]);
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
    tap(3, 'hsve');
    expect(words('we ', 'hsve')[0]).toBe('have');
    const decoded = decodeWord('we ', 'hsve', 3).find(item => item.word === 'have');
    expect(decoded?.correction).toBe(true);
    clearKeyTouches();
    tap(0, 'thw');
    expect(words('', 'thw').slice(0, 3)).toContain('the');
    clearKeyTouches();
    tap(6, 'wprld');
    expect(words('hello ', 'wprld')[0]).toBe('world');
  });

  test('letters without a recorded tap (a hardware keyboard) are not swapped for neighbouring keys', () => {
    expect(words('we ', 'hsve')).not.toContain('have');
    expect(words('', 'restate').filter(word => !word.startsWith('restate'))).toEqual([]);
  });

  test('a tap on the edge between two keys counts for the nearer one', () => {
    const typed = 'tge';
    tap(0, typed);
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
    tap(3, 'hsve');
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

describe('proof-steering words', () => {
  test('are not offered from a short stem or as the next word, only nearly typed in full', () => {
    const offered = (draft: string) => predictWritingAid(request(draft)).words.map(item => item.label.toLowerCase());
    for (const draft of ['The set is closed b', 'It is bounded a', 'x is positive s', 'It is bounded ']) {
      for (const word of ['because', 'by', 'as', 'since', 'so', 'hence', 'therefore']) expect(offered(draft)).not.toContain(word);
    }
    expect(offered('It is bounded becaus')).toContain('because');
  });
});

describe('complete lexicon', () => {
  test('indexed top completions match a stable full scan for literal Unicode and compound prefixes', () => {
    const spellings = ['a', 'apple', 'apt', 'aé', 'a𐐨', 'bother', 'école', 'étale', 'e\u0301cole', 'e\u0301tale',
      "can't", "can’t", "can’tfail", "can’tstop", 'pre-image', 'pre-ordered', 'pre−image', 'pre−ordered'];
    const entries = [...spellings].sort().map((word, index) => ({word, frequency: index % 3 === 0 ? 9 : 5}));
    const index = createDecoderLexicon({version: 1, entries});
    for (const prefix of ['a', 'aé', 'a𐐨', 'é', 'e\u0301', 'can', "can'", 'can’t', 'pre-', 'pre−', 'absent']) {
      const reference = entries.filter(row => row.word !== prefix && row.word.startsWith(prefix))
        .sort((a, b) => b.frequency - a.frequency);
      for (const limit of [1, 2, 24]) expect(searchDecoderLexicon(index, prefix, limit)).toEqual(reference.slice(0, limit));
    }
  });

  test('has the ordinary words v1 missed, keeps logic tags and rejects malformed files', () => {
    const words = new Set(lexicon.entries.map(entry => entry.word));
    for (const word of ['restate', 'restated', 'preimage', 'the', 'because']) expect(words.has(word)).toBe(true);
    expect(lexicon.entries.length).toBeGreaterThan(100_000);
    expect(lexicon.entries.find(entry => entry.word === 'injective')?.riskTags).toEqual(['logic']);
    expect(() => parseLexiconTsv('beta\t3\nalpha\t2\n')).toThrow();
    expect(() => parseLexiconTsv('alpha\tmany\n')).toThrow();
    expect(() => parseLexiconTsv('alpha\t2\tproof\n')).toThrow();
    expect(parseLexiconTsv('alpha\t2\nbeta\t3\tlogic\n').entries).toHaveLength(2);
  });
});

describe('typing slips', () => {
  test('a swapped, missing or extra letter decodes to the word', () => {
    expect(words('we wrote ', 'teh')[0]).toBe('the');
    expect(words('a ', 'functon').slice(0, 3)).toContain('function');
    expect(words('', 'thhe').slice(0, 3)).toContain('the');
  });

  test('a real word is not corrected into a neighbouring one', () => {
    for (const draft of ['could you restate', 'We prove this', 'The limit']) {
      const typed = draft.split(' ').at(-1)!;
      const offered = predictWritingAid(request(draft)).words.map(item => item.label);
      expect(offered.filter(label => !label.toLowerCase().startsWith(typed.toLowerCase()))).toEqual([]);
    }
  });
});
