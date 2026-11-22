#!/usr/bin/env node
/** Rebuild the N219 unigram asset offline from hash-pinned, checked-in sources. */
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';

const root = fileURLToPath(new URL('../../', import.meta.url));
const destination = path.join(root, 'public/models/writing-decoder/unigram-v1');
const lock = JSON.parse(await readFile(new URL('./sources/source-lock.json', import.meta.url), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inputs = {};
for (const source of lock.sources) {
  const bytes = await readFile(path.join(root, source.path));
  if (hash(bytes) !== source.sha256) throw new Error(`Source hash mismatch: ${source.path}`);
  inputs[source.id] = bytes;
}
const scowl = new Set(inputs.scowl.toString('utf8').trim().split(/\r?\n/u).filter(word => /^[a-z]{2,32}$/u.test(word)));
const common = new Set(JSON.parse(inputs.common.toString('utf8')).common);
const ranks = JSON.parse(inputs.mathlib.toString('utf8')).unigram;
const logicMatch = inputs.wordPolicy.toString('utf8').match(/const LOGIC = new Set\(\('([^']+)'\)\.split\(' '\)\);/u);
if (!logicMatch) throw new Error('Cannot recover the pinned lexical logic tags');
const logic = new Set(logicMatch[1].split(' '));
const mobile = new Map(), excluded = new Set();
const aosp = gunzipSync(inputs.aosp, {maxOutputLength: 32 * 1024 * 1024}).toString('utf8');
const header = aosp.slice(0, aosp.indexOf('\n'));
if (header !== lock.aospHeader) throw new Error('Unexpected AOSP dictionary version');
let sourceRows = 0;
for (const row of aosp.split('\n')) {
  if (!row.startsWith(' word=')) continue;
  sourceRows++;
  const match = row.match(/^ word=(.*?),f=(\d+)(?:,(.*))?$/u);
  if (!match) throw new Error('Malformed AOSP word record');
  const [, word, frequency, attributes = ''] = match;
  const flags = attributes.match(/(?:^|,)flags=([^,]*)/u)?.[1] ?? '';
  if (!/^[a-z]{2,32}$/u.test(word)) continue;
  if (Number(frequency) === 0 || /(?:abbreviation|nonword|offensive)/u.test(flags) ||
      attributes.includes('possibly_offensive=true') || attributes.includes('not_a_word=true')) {
    excluded.add(word); continue;
  }
  mobile.set(word, Math.max(mobile.get(word) ?? 0, Number(frequency)));
}
// These are Lean command fragments in the math counts, not prose vocabulary.
// Never promote them into the new lexicon, even when SCOWL has a homographic abbreviation.
for (const word of 'rw rfl simp simpa rcases rintro rwa smul nonneg nonpos univ tendsto forall nhds coe congr'.split(' ')) excluded.add(word);
const words = new Set([...scowl, ...common, ...logic, 'preimage', 'preimages']);
let mobileAdditions = 0;
for (const [word] of [...mobile].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) {
  if (words.has(word) || excluded.has(word)) continue;
  words.add(word);
  if (++mobileAdditions === 8192) break;
}
let domainRanked = 0;
const entries = [...words].filter(word => /^[a-z]{2,32}$/u.test(word) && !excluded.has(word)).sort().map(word => {
  // Do not add rank-file tokens as words. Short code abbreviations cannot earn
  // a math boost; short mathematical terms must be in the curated common list.
  const count = (common.has(word) || word.length >= 6) && Number.isFinite(ranks[word]) ? ranks[word] : 0;
  if (count > 0) domainRanked++;
  const frequency = Math.max(1, mobile.get(word) ?? 0, Math.round(24 * Math.log1p(count)));
  return {word, frequency, ...(logic.has(word) ? {riskTags: ['logic']} : {})};
});
const lexicon = JSON.stringify({version: 1, entries}) + '\n';
const lexiconBytes = Buffer.byteLength(lexicon);
if (lexiconBytes > 2_000_000) throw new Error(`Lexicon exceeds the 2 MB initial asset target: ${lexiconBytes}`);
const manifest = {
  assetSetVersion: 'unigram-v1',
  file: {path: 'lexicon.json', bytes: lexiconBytes, sha256: hash(lexicon)},
  entryCount: entries.length,
  sources: lock.sources,
  sourceDetails: {aospHeader: header, aospWordRows: sourceRows, mobileAdditions, domainRanked},
  build: {
    command: 'node scripts/writing-decoder/build-lexicon.mjs',
    check: 'node scripts/writing-decoder/build-lexicon.mjs --check',
    normalization: 'Lowercase ASCII words of 2–32 letters; original source casing is not folded.',
    vocabulary: 'SCOWL, existing curated common/math words and lexical logic terms; 8,192 additional AOSP words by frequency; remove AOSP excluded flags and listed Lean command fragments.',
    frequency: 'max(1, AOSP f, round(24 * log1p(filtered mathlib count))); this is a heuristic rank, not a calibrated probability.',
    mathFilter: 'Use counts only for known vocabulary with length >=6 or existing curated common terms; never add raw count-file tokens.',
    risk: 'Preserve the complete LOGIC set from the pinned vendor words.mjs; application policy runs independently.',
    ordering: 'Unique ASCII lexical order; frequency rank is applied at retrieval over the entire matching range.',
  },
  qualification: 'Development unigram completion asset. No n-gram context, spatial model, calibrated autocorrection, human accuracy or phone latency claim.',
};
const files = new Map([
  ['lexicon.json', lexicon],
  ['manifest.json', JSON.stringify(manifest, null, 2) + '\n'],
  ['SCOWL-NOTICE.txt', inputs.scowlNotice],
  ['AOSP-NOTICE.txt', inputs.aospNotice],
  ['mathlib4-LICENSE.txt', inputs.mathlibNotice],
]);
const check = process.argv.includes('--check');
await mkdir(destination, {recursive: true});
for (const [name, contents] of files) {
  const target = path.join(destination, name);
  if (check) {
    if (!(await readFile(target)).equals(Buffer.from(contents))) throw new Error(`Generated file differs: ${target}`);
  } else await writeFile(target, contents);
}
console.log(JSON.stringify({mode: check ? 'check' : 'build', entries: entries.length, bytes: lexiconBytes, sha256: manifest.file.sha256}));
