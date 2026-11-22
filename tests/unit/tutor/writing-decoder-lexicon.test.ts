import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {
  createDecoderLexicon, MAX_DECODER_CANDIDATES, MAX_DECODER_WORDS,
  parseDecoderLexicon, searchDecoderLexicon,
  type DecoderCandidate,
} from '../../../src/features/tutor/writingAid/decoder/lexicon';

const assetPath = 'public/models/writing-decoder/unigram-v1/';
const readAsset = () => parseDecoderLexicon(JSON.parse(readFileSync(assetPath + 'lexicon.json', 'utf8')));
const fixture = (entries: DecoderCandidate[]) => parseDecoderLexicon({version: 1, entries});

describe('writing decoder unigram lexicon', () => {
  it('ranks the whole matching range, including high-frequency words after long alphabetical tails', () => {
    const asset = fixture([
      {word: 'aaa', frequency: 2}, {word: 'aab', frequency: 3},
      {word: 'aac', frequency: 3}, {word: 'aaz', frequency: 100},
      {word: 'abacus', frequency: 999},
    ]);
    expect(searchDecoderLexicon(createDecoderLexicon(asset), 'aa', 3).map(row => row.word))
      .toEqual(['aaz', 'aab', 'aac']);
  });

  it('matches a full sort oracle across varied prefix ranges and top-k sizes', () => {
    const entries: DecoderCandidate[] = [];
    for (let i = 0; i < 4096; i++) {
      const word = 're' + [i >>> 8 & 15, i >>> 4 & 15, i & 15].map(x => String.fromCharCode(97 + x)).join('');
      entries.push({word, frequency: 1 + (i * 7919) % 103});
    }
    const asset = fixture(entries), index = createDecoderLexicon(asset);
    for (const prefix of ['r', 're', 'rea', 'rem', 'repp', 'refg', 'z']) {
      for (const limit of [1, 3, 8, 32, 64, 120]) {
        const expected = entries.filter(row => row.word.startsWith(prefix) && row.word !== prefix)
          .sort((a, b) => b.frequency - a.frequency || (a.word < b.word ? -1 : 1))
          .slice(0, Math.min(MAX_DECODER_CANDIDATES, limit));
        expect(searchDecoderLexicon(index, prefix, limit)).toEqual(expected);
      }
    }
  });

  it('returns only completions, never a literal or a zero-prefix next word', () => {
    const index = createDecoderLexicon(fixture([
      {word: 'cat', frequency: 10}, {word: 'cats', frequency: 1}, {word: 'dog', frequency: 20},
    ]));
    expect(searchDecoderLexicon(index, 'CAT').map(row => row.word)).toEqual(['cats']);
    for (const prefix of ['', 'cat ', 'ca_t', '\\ca', 'é', 'a'.repeat(33)]) {
      expect(searchDecoderLexicon(index, prefix)).toEqual([]);
    }
    for (const limit of [NaN, Infinity, -1, 0]) expect(searchDecoderLexicon(index, 'ca', limit)).toEqual([]);
  });

  it('preserves source logic risk tags through JSON and ranked retrieval', () => {
    const asset = readAsset();
    const index = createDecoderLexicon(asset);
    const result = ['nonneg', 'nonpos'].flatMap(prefix => searchDecoderLexicon(index, prefix));
    for (const word of ['nonnegative', 'nonpositive']) {
      expect(result.find(row => row.word === word)?.riskTags).toEqual(['logic']);
    }
    const encoded = JSON.parse(JSON.stringify(result));
    expect(encoded.find((row: DecoderCandidate) => row.word === 'nonnegative').riskTags).toEqual(['logic']);
  });

  it.each([
    null, {}, {version: 2, entries: [{word: 'word', frequency: 1}]}, {version: 1, entries: []},
    {version: 1, entries: [{word: 'Word', frequency: 1}]},
    {version: 1, entries: [{word: '__proto__', frequency: 1}]},
    {version: 1, entries: [{word: 'word', frequency: 0}]},
    {version: 1, entries: [{word: 'word', frequency: Infinity}]},
    {version: 1, entries: [{word: 'word', frequency: 1_000_001}]},
    {version: 1, entries: [{word: 'word', frequency: 1, riskTags: ['unknown']}]},
    {version: 1, entries: [{word: 'word', frequency: 1, riskTags: ['logic', 'logic']}]},
    {version: 1, entries: [{word: 'word', frequency: 1, riskTags: 'logic'}]},
    {version: 1, entries: [{word: 'word', frequency: 1}, {word: 'word', frequency: 2}]},
    {version: 1, entries: [{word: 'zebra', frequency: 1}, {word: 'word', frequency: 1}]},
  ])('rejects malformed, unbounded or ambiguously ordered data %#', value => {
    expect(() => parseDecoderLexicon(value)).toThrow();
  });

  it('rejects oversized word arrays before allocating a search tree', () => {
    expect(() => parseDecoderLexicon({version: 1, entries: Array(MAX_DECODER_WORDS + 1)})).toThrow();
  });

  it('keeps source abbreviations out while retaining real mathematical vocabulary', () => {
    const words = new Map(readAsset().entries.map(row => [row.word, row]));
    for (const token of ['rw', 'simp', 'simpa', 'rfl', 'rcases', 'nonneg', 'forall', 'coe']) {
      expect(words.has(token), token).toBe(false);
    }
    for (const word of ['continuous', 'preimage', 'preimages', 'homomorphism', 'nonnegative']) {
      expect(words.has(word), word).toBe(true);
    }
    expect(words.get('continuous')!.frequency).toBeGreaterThan(100);
  });

  it('ships the exact hash-pinned asset and reproduces it offline from pinned sources', () => {
    const bytes = readFileSync(assetPath + 'lexicon.json');
    const manifest = JSON.parse(readFileSync(assetPath + 'manifest.json', 'utf8'));
    expect(bytes.length).toBe(manifest.file.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.file.sha256);
    expect(readAsset().entries).toHaveLength(manifest.entryCount);
    const result = execFileSync(process.execPath, ['scripts/writing-decoder/build-lexicon.mjs', '--check'], {encoding: 'utf8'});
    expect(JSON.parse(result)).toMatchObject({mode: 'check', sha256: manifest.file.sha256});
  });
});
