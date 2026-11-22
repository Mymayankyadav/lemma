#!/usr/bin/env node
/**
 * N221 · rebuild the complete unigram lexicon (unigram-v2) offline from hash-pinned, checked-in sources.
 *
 * N219's unigram-v1 kept the SCOWL spelling list and added only 8,192 AOSP words, so ordinary words such as "restate"
 * were missing. v2 keeps every v1 entry (its frequency and logic tag) and adds every AOSP LatinIME en_US word the same
 * rules accept: lowercase ASCII of 2–32 letters, frequency above 0, and none of the abbreviation, non-word or
 * offensive flags, nor the listed Lean command fragments. The file is one "word<TAB>frequency[<TAB>logic]" line per
 * word in byte order, so it stays small and needs no JSON parsing.
 *
 *   node scripts/writing-decoder/build-lexicon-v2.mjs          # write public/models/writing-decoder/unigram-v2
 *   node scripts/writing-decoder/build-lexicon-v2.mjs --check  # verify the checked-in output byte for byte
 */
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';

const root = fileURLToPath(new URL('../../', import.meta.url));
const v1 = path.join(root, 'public/models/writing-decoder/unigram-v1');
const destination = path.join(root, 'public/models/writing-decoder/unigram-v2');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = [
  {id: 'unigram-v1', path: 'public/models/writing-decoder/unigram-v1/lexicon.json',
    sha256: '3c60a7226fcabd574caaf0f152fc8451c9d7173af8e2470a96052f3bd5ed2594', license: 'see unigram-v1/ATTRIBUTION.md'},
  {id: 'aosp', path: 'scripts/writing-decoder/sources/aosp-en_US-v54.combined.gz',
    sha256: '0f78dd455b532be169a23f233227b811fabced4b5bd7fc9c40cc05839793bcbd', license: 'Apache-2.0',
    url: 'https://android.googlesource.com/platform/packages/inputmethods/LatinIME/+/127336e9f29d69607eab55982324b210279ae8c5/dictionaries/en_US_wordlist.combined.gz'},
];
const inputs = {};
for (const source of sources) {
  const bytes = await readFile(path.join(root, source.path));
  if (hash(bytes) !== source.sha256) throw new Error(`Source hash mismatch: ${source.path}`);
  inputs[source.id] = bytes;
}

const words = new Map();
for (const entry of JSON.parse(inputs['unigram-v1'].toString('utf8')).entries) {
  words.set(entry.word, {frequency: entry.frequency, logic: Boolean(entry.riskTags?.includes('logic'))});
}
const v1Count = words.size;
const aosp = gunzipSync(inputs.aosp, {maxOutputLength: 32 * 1024 * 1024}).toString('utf8');
const header = aosp.slice(0, aosp.indexOf('\n'));
if (header !== 'dictionary=main:en_us,locale=en_US,description=English (US),date=1414726260,version=54') {
  throw new Error('Unexpected AOSP dictionary version');
}
// The same exclusions as unigram-v1 (scripts/writing-decoder/build-lexicon.mjs on the N219 branch).
const excluded = new Set('rw rfl simp simpa rcases rintro rwa smul nonneg nonpos univ tendsto forall nhds coe congr'.split(' '));
let added = 0;
for (const row of aosp.split('\n')) {
  if (!row.startsWith(' word=')) continue;
  const match = row.match(/^ word=(.*?),f=(\d+)(?:,(.*))?$/u);
  if (!match) throw new Error('Malformed AOSP word record');
  const [, word, frequency, attributes = ''] = match;
  const flags = attributes.match(/(?:^|,)flags=([^,]*)/u)?.[1] ?? '';
  if (!/^[a-z]{2,32}$/u.test(word) || excluded.has(word)) continue;
  if (Number(frequency) === 0 || /(?:abbreviation|nonword|offensive)/u.test(flags) ||
      attributes.includes('possibly_offensive=true') || attributes.includes('not_a_word=true')) continue;
  const known = words.get(word);
  if (known) known.frequency = Math.max(known.frequency, Number(frequency));
  else {words.set(word, {frequency: Number(frequency), logic: false}); added++;}
}
const lines = [...words].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  .map(([word, {frequency, logic}]) => word + '\t' + frequency + (logic ? '\tlogic' : ''));
const lexicon = lines.join('\n') + '\n';
const bytes = Buffer.byteLength(lexicon);
if (bytes > 3_000_000) throw new Error(`Lexicon exceeds its 3 MB budget: ${bytes}`);
const manifest = {
  assetSetVersion: 'unigram-v2',
  file: {path: 'lexicon.tsv', bytes, sha256: hash(lexicon)},
  entryCount: lines.length,
  sources,
  sourceDetails: {aospHeader: header, unigramV1Entries: v1Count, aospAdditions: added},
  build: {
    command: 'node scripts/writing-decoder/build-lexicon-v2.mjs',
    check: 'node scripts/writing-decoder/build-lexicon-v2.mjs --check',
    format: 'One "word<TAB>frequency[<TAB>logic]" line per word, sorted by code point.',
    vocabulary: 'Every unigram-v1 entry, plus every AOSP word with frequency above 0 and no abbreviation, non-word or offensive flag; listed Lean command fragments excluded.',
    frequency: 'max(unigram-v1 frequency, AOSP f); a heuristic rank, not a calibrated probability.',
  },
};
const attribution = `# Writing decoder unigram asset v2 (N221)

The complete word list for the keyboard's n-gram and touch decoder. It extends N219's \`unigram-v1\` (kept unchanged
beside it) with every word of the same pinned AOSP LatinIME en_US dictionary that v1's rules accept; v1 added only
8,192 of them, so words such as "restate" were missing.

| Source | Licence | Use |
| --- | --- | --- |
| \`unigram-v1/lexicon.json\` (N219) | See \`unigram-v1/ATTRIBUTION.md\`: AOSP LatinIME (Apache-2.0), SCOWL notices, mathlib4 (Apache-2.0) | Every entry, its frequency and its logic tag |
| AOSP LatinIME \`dictionaries/en_US_wordlist.combined.gz\`, revision 127336e9, version 54 | Apache-2.0 (\`AOSP-NOTICE.txt\`) | The remaining words and their frequency field \`f\` |

Changes made by Lemma: lowercase ASCII words of 2–32 letters only; AOSP entries with frequency 0 or an abbreviation,
non-word or offensive flag are excluded, as are the Lean command fragments v1 excludes. Frequencies are
max(v1 frequency, AOSP f). Rebuild or verify with \`node scripts/writing-decoder/build-lexicon-v2.mjs [--check]\`.
`;
const files = new Map([
  ['lexicon.tsv', lexicon],
  ['manifest.json', JSON.stringify(manifest, null, 2) + '\n'],
  ['ATTRIBUTION.md', attribution],
  ['AOSP-NOTICE.txt', await readFile(path.join(v1, 'AOSP-NOTICE.txt'))],
  ['SCOWL-NOTICE.txt', await readFile(path.join(v1, 'SCOWL-NOTICE.txt'))],
  ['mathlib4-LICENSE.txt', await readFile(path.join(v1, 'mathlib4-LICENSE.txt'))],
]);
const check = process.argv.includes('--check');
await mkdir(destination, {recursive: true});
for (const [name, contents] of files) {
  const target = path.join(destination, name);
  if (check) {
    if (!(await readFile(target)).equals(Buffer.from(contents))) throw new Error(`Generated file differs: ${target}`);
  } else await writeFile(target, contents);
}
console.log(JSON.stringify({mode: check ? 'check' : 'build', entries: lines.length, aospAdditions: added, bytes, sha256: manifest.file.sha256}));
