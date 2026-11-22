#!/usr/bin/env node
/** Bounded, local-only declaration/integrity audit. This never trains a model. */
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {realpath, stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const CORPUS_PROTOCOL = 'n219-corpus-audit-v1';
export const CORPUS_LIMITS = Object.freeze({
  manifestBytes: 64 * 1024, evidenceBytes: 128 * 1024, corpusBytes: 16 * 1024 * 1024,
  sources: 32, documents: 20_000, lineBytes: 128 * 1024, textCharacters: 32_768, words: 500_000,
});
const SPLITS = ['train', 'validation', 'test'];
const ROLES = ['learner', 'tutor', 'public', 'synthetic'];
const PROVENANCE = ['typed', 'manual-accept', 'manual-fix', 'transcribed', 'published', 'generated',
  'automatic', 'paste', 'restore', 'mixed', 'unknown'];
const LEARNER_TARGET = new Set(['typed', 'manual-accept', 'manual-fix', 'transcribed']);
const SHA256 = /^[a-f0-9]{64}$/u;
const hash = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value, max = 2048) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/u.test(value);
const utcTimestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export class CorpusAuditError extends Error {
  constructor(code, location = {}) {
    super(code);
    this.name = 'CorpusAuditError';
    this.code = code;
    // Only ordinal locations. Never attach text, document IDs, URLs or parse errors.
    this.location = location;
  }
}
const requireValue = (condition, code, location) => { if (!condition) throw new CorpusAuditError(code, location); };
const parseJson = (text, code, location) => {
  try { return JSON.parse(text); } catch { throw new CorpusAuditError(code, location); }
};
const decode = (bytes, code, location) => {
  try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
  catch { throw new CorpusAuditError(code, location); }
};
const httpsUrl = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
};

async function boundedRead(file, maxBytes, location) {
  try {
    const info = await stat(file);
    requireValue(info.isFile() && info.size <= maxBytes, 'FILE_LIMIT', location);
    const chunks = [];
    let bytes = 0;
    for await (const chunk of createReadStream(file)) {
      bytes += chunk.length;
      requireValue(bytes <= maxBytes, 'FILE_LIMIT', location);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, bytes);
  } catch (error) {
    if (error instanceof CorpusAuditError) throw error;
    throw new CorpusAuditError('FILE_UNAVAILABLE', location);
  }
}

async function pinnedFile(base, reference, limit, location) {
  requireValue(object(reference) && string(reference.path, 240) && !path.isAbsolute(reference.path) &&
    Number.isSafeInteger(reference.bytes) && reference.bytes > 0 && reference.bytes <= limit &&
    typeof reference.sha256 === 'string' && SHA256.test(reference.sha256), 'FILE_REFERENCE', location);
  const resolved = path.resolve(base, reference.path);
  requireValue(resolved.startsWith(base + path.sep), 'FILE_PATH', location);
  let canonical;
  try { canonical = await realpath(resolved); } catch { throw new CorpusAuditError('FILE_UNAVAILABLE', location); }
  requireValue(canonical.startsWith(base + path.sep), 'FILE_PATH', location);
  const bytes = await boundedRead(canonical, limit, location);
  requireValue(bytes.length === reference.bytes && hash(bytes) === reference.sha256, 'FILE_INTEGRITY', location);
  return bytes;
}

function validateSource(source, sourceIndex) {
  const at = {sourceIndex};
  requireValue(object(source) && identifier(source.id) && ['public', 'owner', 'synthetic'].includes(source.kind) &&
    string(source.revision) && string(source.attribution) && Array.isArray(source.obligations) &&
    source.obligations.length <= 20 && source.obligations.every(item => string(item)), 'SOURCE_SCHEMA', at);
  requireValue(string(source.license, 120) && !/^(?:unknown|unlicensed|none|pending|tbd)$/iu.test(source.license.trim()),
    'SOURCE_LICENSE', at);
  requireValue(source.kind !== 'public' || httpsUrl(source.url), 'SOURCE_URL', at);
  requireValue(source.kind === 'owner' ? identifier(source.ownerScope) : source.ownerScope === undefined,
    'SOURCE_OWNER_SCOPE', at);
  const review = source.review;
  requireValue(object(review) && review.status === 'reviewed' && string(review.reviewedBy, 160) &&
    utcTimestamp(review.reviewedAt) && review.scope === 'offline-preparation' && string(review.notes),
  'SOURCE_REVIEW', at);
}

function validateRecord(record, sources, recordIndex) {
  const at = {recordIndex};
  requireValue(object(record) && identifier(record.id) && identifier(record.sourceId) &&
    identifier(record.documentId) && identifier(record.groupId) && SPLITS.includes(record.split) &&
    ROLES.includes(record.role) && ['target', 'context'].includes(record.purpose) &&
    PROVENANCE.includes(record.provenance), 'RECORD_SCHEMA', at);
  const source = sources.get(record.sourceId);
  requireValue(Boolean(source), 'RECORD_SOURCE', at);
  requireValue(string(record.text, CORPUS_LIMITS.textCharacters) && !/[\uD800-\uDFFF]/u.test(record.text) &&
    record.text === record.text.normalize('NFC'),
    'TEXT_NFC', at);
  requireValue(typeof record.textSha256 === 'string' && SHA256.test(record.textSha256) &&
    hash(record.text) === record.textSha256, 'TEXT_INTEGRITY', at);
  const expectedRoles = {owner: ['learner', 'tutor'], public: ['public'], synthetic: ['synthetic']}[source.kind];
  requireValue(expectedRoles.includes(record.role), 'SOURCE_ROLE', at);
  requireValue(record.role !== 'tutor' || record.purpose === 'context', 'TUTOR_TARGET', at);
  requireValue(record.role === 'tutor' ? ['prompt', 'given', 'suggested-wording'].includes(record.tutorRole) :
    record.tutorRole === undefined, 'TUTOR_ROLE', at);
  if (record.role === 'learner' && record.purpose === 'target') {
    requireValue(LEARNER_TARGET.has(record.provenance), 'TARGET_PROVENANCE', at);
  }
  if (record.role === 'public') requireValue(record.provenance === 'published', 'PUBLIC_PROVENANCE', at);
  if (source.kind === 'owner') {
    requireValue(utcTimestamp(record.timestamp), 'OWNER_TIMESTAMP', at);
    requireValue(record.ownerScope === source.ownerScope, 'RECORD_OWNER_SCOPE', at);
  } else requireValue(record.ownerScope === undefined, 'RECORD_OWNER_SCOPE', at);
  if (record.role === 'synthetic') {
    requireValue(record.provenance === 'generated' && object(record.generator) &&
      string(record.generator.version, 120) && Number.isSafeInteger(record.generator.seed) && record.generator.seed >= 0,
    'SYNTHETIC_PROVENANCE', at);
  }
  return source;
}

// This audit tokenizer is deliberately separate from any future model tokenizer.
// NFC is checked, not rewritten; TeX/math text remains byte-for-byte untouched.
const wordsOf = text => text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.map(word => word.toLowerCase()) ?? [];
function* shingles(words) {
  for (let i = 0; i + 13 <= words.length; i++) yield hash(words.slice(i, i + 13).join('\0'));
}

/** Read only the selected local manifest and its bounded, hash-pinned files. */
export async function auditCorpus(manifestPath) {
  let canonical;
  try { canonical = await realpath(manifestPath); } catch { throw new CorpusAuditError('FILE_UNAVAILABLE'); }
  const manifestBytes = await boundedRead(canonical, CORPUS_LIMITS.manifestBytes);
  const manifest = parseJson(decode(manifestBytes, 'MANIFEST_UTF8'), 'MANIFEST_JSON');
  requireValue(object(manifest) && manifest.version === 1 && manifest.protocol === CORPUS_PROTOCOL &&
    manifest.normalization === 'nfc-v1' && manifest.auditTokenizer === 'unicode-word-v1' &&
    manifest.ownerSplit === 'utc-days-floor-60-80-v1' && Array.isArray(manifest.sources) &&
    manifest.sources.length > 0 && manifest.sources.length <= CORPUS_LIMITS.sources, 'MANIFEST_SCHEMA');
  const base = path.dirname(canonical), sources = new Map();
  const hasOwner = manifest.sources.some(source => object(source) && source.kind === 'owner');
  requireValue(hasOwner ? identifier(manifest.ownerScope) : manifest.ownerScope === undefined, 'MANIFEST_OWNER_SCOPE');
  for (let i = 0; i < manifest.sources.length; i++) {
    const source = manifest.sources[i];
    validateSource(source, i);
    requireValue(source.kind !== 'owner' || source.ownerScope === manifest.ownerScope, 'SOURCE_OWNER_SCOPE', {sourceIndex: i});
    requireValue(!sources.has(source.id), 'DUPLICATE_SOURCE', {sourceIndex: i});
    await pinnedFile(base, source.licenseEvidence, CORPUS_LIMITS.evidenceBytes, {sourceIndex: i});
    sources.set(source.id, source);
  }
  const corpus = await pinnedFile(base, manifest.records, CORPUS_LIMITS.corpusBytes);
  const lines = decode(corpus, 'CORPUS_UTF8').split('\n');
  if (lines.at(-1) === '') lines.pop();
  requireValue(lines.length > 0 && lines.length <= CORPUS_LIMITS.documents, 'DOCUMENT_LIMIT');
  const records = [], ids = new Set(), documentSplits = new Map(), groupSplits = new Map(), daySplits = new Map();
  const targetHashes = new Set();
  const splitHashes = Object.fromEntries(SPLITS.map(split => [split, new Set()]));
  const splitShingles = Object.fromEntries(SPLITS.map(split => [split, new Set()]));
  const counts = {documents: lines.length, targets: 0, context: 0, words: 0,
    bySplit: {train: 0, validation: 0, test: 0}, byRole: {learner: 0, tutor: 0, public: 0, synthetic: 0}};
  for (let i = 0; i < lines.length; i++) {
    const at = {recordIndex: i};
    requireValue(Buffer.byteLength(lines[i]) <= CORPUS_LIMITS.lineBytes, 'LINE_LIMIT', at);
    const record = parseJson(lines[i], 'RECORD_JSON', at);
    const source = validateRecord(record, sources, i);
    requireValue(!ids.has(record.id), 'DUPLICATE_ID', at);
    ids.add(record.id);
    for (const [map, key, code] of [[documentSplits, record.documentId, 'DOCUMENT_SPLIT_LEAK'],
      [groupSplits, record.groupId, 'GROUP_SPLIT_LEAK']]) {
      requireValue(!map.has(key) || map.get(key) === record.split, code, at);
      map.set(key, record.split);
    }
    if (source.kind === 'owner') {
      const day = record.timestamp.slice(0, 10);
      requireValue(!daySplits.has(day) || daySplits.get(day) === record.split, 'OWNER_DAY_LEAK', at);
      daySplits.set(day, record.split);
    }
    if (record.purpose === 'target') {
      requireValue(!targetHashes.has(record.textSha256), 'EXACT_DUPLICATE', at);
      targetHashes.add(record.textSha256);
      counts.targets++;
    } else counts.context++;
    counts.bySplit[record.split]++;
    counts.byRole[record.role]++;
    const words = wordsOf(record.text);
    counts.words += words.length;
    requireValue(counts.words <= CORPUS_LIMITS.words, 'WORD_LIMIT', at);
    // Context can also reveal held-out targets. Audit every role and purpose.
    splitHashes[record.split].add(record.textSha256);
    for (const shingle of shingles(words)) splitShingles[record.split].add(shingle);
    records.push({record, words});
  }
  const days = [...daySplits.keys()].sort();
  for (let i = 0; i < days.length; i++) {
    const expected = i < Math.floor(days.length * 0.6) ? 'train' : i < Math.floor(days.length * 0.8) ? 'validation' : 'test';
    requireValue(daySplits.get(days[i]) === expected, 'OWNER_CHRONOLOGY', {dayIndex: i});
  }
  for (let i = 0; i < records.length; i++) {
    const {record, words} = records[i];
    const otherSplits = SPLITS.filter(split => split !== record.split);
    requireValue(otherSplits.every(split => !splitHashes[split].has(record.textSha256)),
      'CROSS_SPLIT_EXACT_OVERLAP', {recordIndex: i});
    for (const shingle of shingles(words)) {
      requireValue(otherSplits.every(split => !splitShingles[split].has(shingle)),
        'CROSS_SPLIT_13GRAM_OVERLAP', {recordIndex: i});
    }
  }
  return {
    version: 1, protocol: CORPUS_PROTOCOL, status: 'passed',
    inputs: {manifestSha256: hash(manifestBytes), corpusSha256: hash(corpus)},
    counts, sourceCount: sources.size, ownerDays: days.length,
    checks: ['review-declared', 'pinned-local-files', 'nfc-and-text-hashes', 'single-owner-scope', 'roles-and-target-provenance',
      'document-and-group-splits', 'owner-whole-day-60-20-20', 'exact-target-deduplication', 'all-role-cross-split-exact-and-13grams'],
    qualification: 'Declaration and integrity checks only. Not a licence grant, semantic-safety certification, training approval, or model-quality result.',
    missing: ['near-duplicate MinHash audit', 'topic holdout audit', 'public post-date split audit',
      'math-span validation', 'source quality review', 'human/device evaluation'],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    requireValue(process.argv.length === 3, 'USAGE_EXPECTED_MANIFEST_PATH');
    console.log(JSON.stringify(await auditCorpus(process.argv[2]), null, 2));
  } catch (error) {
    const known = error instanceof CorpusAuditError;
    console.error(JSON.stringify({status: 'failed', code: known ? error.code : 'AUDIT_FAILED',
      ...(known ? error.location : {})}));
    process.exitCode = 1;
  }
}
