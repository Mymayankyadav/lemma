// @vitest-environment node
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {auditCorpus, CORPUS_LIMITS} from '../../../scripts/writing-decoder/audit-corpus.mjs';

interface Row {
  id: string; sourceId: string; documentId: string; groupId: string; split: string; role: string;
  purpose: string; provenance: string; text: string; textSha256: string;
  timestamp?: string; generator?: {version: string; seed: number}; ownerScope?: string; tutorRole?: string;
}
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const withText = (row: Row, text: string): Row => ({...row, text, textSha256: sha(text)});
const baseRows = (): Row[] => ['train', 'validation', 'test'].map((split, i) => {
  const text = ['I wrote a short note about $x \\in ℝ$ and café.',
    'The diagram labels a blue triangle.', 'My final paragraph mentions a red square.'][i];
  return {id: `row-${i}`, sourceId: 'fixture', documentId: `document-${i}`, groupId: `group-${i}`,
    split, role: 'synthetic', purpose: 'target', provenance: 'generated', text, textSha256: sha(text),
    generator: {version: 'handwritten-fixture-v1', seed: 0}};
});
const ownerRows = (): Row[] => ['train', 'train', 'train', 'validation', 'test'].map((split, i) => ({
  ...withText(baseRows()[0], `Handwritten owner fixture number ${i}.`),
  id: `row-${i}`, documentId: `document-${i}`, groupId: `group-${i}`, split, role: 'learner',
  provenance: 'typed', timestamp: `2026-11-0${i + 1}T12:00:00.000Z`, generator: undefined,
  ownerScope: 'owner-fixture-a',
}));

let directory: string;
beforeEach(() => {
  mkdirSync('test-results', {recursive: true});
  directory = mkdtempSync(path.resolve('test-results/corpus-audit-'));
});
afterEach(() => rmSync(directory, {recursive: true, force: true}));
const pin = (name: string, bytes: string | Buffer) => {
  writeFileSync(path.join(directory, name), bytes);
  return {path: name, bytes: Buffer.byteLength(bytes), sha256: sha(bytes)};
};
function fixture(rows = baseRows(), kind = 'synthetic') {
  const manifest = {
    version: 1, protocol: 'n219-corpus-audit-v1', normalization: 'nfc-v1', auditTokenizer: 'unicode-word-v1',
    ownerScope: kind === 'owner' ? 'owner-fixture-a' : undefined,
    ownerSplit: 'utc-days-floor-60-80-v1', records: pin('records.jsonl', rows.map(row => JSON.stringify(row)).join('\n') + '\n'),
    sources: [{id: 'fixture', kind, revision: 'fixture-v1', license: 'LicenseRef-Lemma-Test-Fixture',
      ownerScope: kind === 'owner' ? 'owner-fixture-a' : undefined,
      url: 'https://example.invalid/fixture', attribution: 'N219 test authors', obligations: ['Keep the synthetic label.'],
      licenseEvidence: pin('NOTICE.txt', 'Synthetic test fixture; offline audit use only.\n'),
      review: {status: 'reviewed', reviewedBy: 'N219 fixture author', reviewedAt: '2026-11-22T00:00:00.000Z',
        scope: 'offline-preparation', notes: 'This declaration is only for the hand-written test fixture.'}}],
  };
  const save = () => { const file = path.join(directory, 'manifest.json'); writeFileSync(file, JSON.stringify(manifest)); return file; };
  return {manifest, save};
}

describe('offline writing-decoder corpus declaration and integrity audit', () => {
  it('reproduces the committed synthetic fixture report without changing its input', async () => {
    const folder = 'docs/implementation/2026-11-22/ngram-spatial-decoder/corpus/';
    const input = readFileSync(folder + 'synthetic-records.jsonl');
    const first = await auditCorpus(folder + 'synthetic-manifest.json');
    expect(await auditCorpus(folder + 'synthetic-manifest.json')).toEqual(first);
    expect(first).toEqual(JSON.parse(readFileSync(folder + 'synthetic-report.json', 'utf8')));
    expect(readFileSync(folder + 'synthetic-records.jsonl')).toEqual(input);
    expect(first.qualification).toContain('Not a licence grant');
    expect(first.counts.byRole.synthetic).toBe(3);
    expect(JSON.stringify(first)).not.toContain('ℝ');
    expect(input.toString()).toContain('ℝ');
  });

  it.each(['', 'unknown', 'unlicensed', 'pending'])('rejects missing or unresolved licence %j', async license => {
    const f = fixture(); f.manifest.sources[0].license = license;
    await expect(auditCorpus(f.save())).rejects.toMatchObject({code: 'SOURCE_LICENSE'});
  });
  it('requires an explicit review for offline preparation and pinned evidence', async () => {
    const f = fixture(); f.manifest.sources[0].review.status = 'pending';
    await expect(auditCorpus(f.save())).rejects.toMatchObject({code: 'SOURCE_REVIEW'});
    f.manifest.sources[0].review.status = 'reviewed';
    writeFileSync(path.join(directory, 'NOTICE.txt'), 'Changed after review.');
    await expect(auditCorpus(f.save())).rejects.toMatchObject({code: 'FILE_INTEGRITY'});
  });
  it('rejects a changed corpus even when its JSON remains valid', async () => {
    const f = fixture(); writeFileSync(path.join(directory, 'records.jsonl'), '{}\n');
    await expect(auditCorpus(f.save())).rejects.toMatchObject({code: 'FILE_INTEGRITY'});
  });
  it('rejects both lexical and symbolic-link escapes from the selected bundle', async () => {
    const f = fixture(); f.manifest.sources[0].licenseEvidence.path = '../outside.txt';
    await expect(auditCorpus(f.save())).rejects.toMatchObject({code: 'FILE_PATH'});
    symlinkSync(path.resolve('AGENTS.md'), path.join(directory, 'outside.txt'));
    f.manifest.sources[0].licenseEvidence.path = 'outside.txt';
    await expect(auditCorpus(f.save())).rejects.toMatchObject({code: 'FILE_PATH'});
  });
  it.each(['documentId', 'groupId'])('rejects %s leakage across splits', async key => {
    const rows = baseRows(); rows[1][key as 'documentId' | 'groupId'] = rows[0][key as 'documentId' | 'groupId'];
    await expect(auditCorpus(fixture(rows).save())).rejects.toMatchObject({
      code: key === 'documentId' ? 'DOCUMENT_SPLIT_LEAK' : 'GROUP_SPLIT_LEAK',
    });
  });
  it('checks whole UTC days and the deterministic 60/20/20 day split', async () => {
    const rows = ownerRows();
    expect((await auditCorpus(fixture(rows, 'owner').save())).ownerDays).toBe(5);
    rows[3].timestamp = rows[0].timestamp;
    await expect(auditCorpus(fixture(rows, 'owner').save())).rejects.toMatchObject({code: 'OWNER_DAY_LEAK'});
    rows[3].timestamp = '2026-11-04T12:00:00.000Z';
    rows[0].timestamp = '2026-11-06T12:00:00.000Z';
    await expect(auditCorpus(fixture(rows, 'owner').save())).rejects.toMatchObject({code: 'OWNER_CHRONOLOGY'});
  });
  it('rejects invalid dates instead of silently rolling them into another day', async () => {
    const rows = ownerRows(); rows[0].timestamp = '2026-02-30T12:00:00.000Z';
    await expect(auditCorpus(fixture(rows, 'owner').save())).rejects.toMatchObject({code: 'OWNER_TIMESTAMP'});
  });
  it('rejects absent or mixed owner scopes before combining chronology', async () => {
    const rows = ownerRows(); const f = fixture(rows, 'owner');
    f.manifest.ownerScope = undefined;
    await expect(auditCorpus(f.save())).rejects.toMatchObject({code: 'MANIFEST_OWNER_SCOPE'});
    f.manifest.ownerScope = 'owner-fixture-a';
    f.manifest.sources.push({...f.manifest.sources[0], id: 'other-source', ownerScope: 'owner-fixture-b'});
    await expect(auditCorpus(f.save())).rejects.toMatchObject({code: 'SOURCE_OWNER_SCOPE'});
    rows[0].ownerScope = 'owner-fixture-b';
    await expect(auditCorpus(fixture(rows, 'owner').save())).rejects.toMatchObject({code: 'RECORD_OWNER_SCOPE'});
  });
  it.each(['automatic', 'paste', 'restore', 'mixed', 'unknown'])('never promotes %s learner text to a target', async provenance => {
    const rows = ownerRows(); rows[0].provenance = provenance;
    await expect(auditCorpus(fixture(rows, 'owner').save())).rejects.toMatchObject({code: 'TARGET_PROVENANCE'});
    rows[0].purpose = 'context';
    expect((await auditCorpus(fixture(rows, 'owner').save())).counts.context).toBe(1);
  });
  it('distinguishes manual acceptance from automatic changes and tutor text', async () => {
    const rows = ownerRows(); rows[0].provenance = 'manual-accept';
    expect((await auditCorpus(fixture(rows, 'owner').save())).counts.targets).toBe(5);
    rows[0].role = 'tutor';
    await expect(auditCorpus(fixture(rows, 'owner').save())).rejects.toMatchObject({code: 'TUTOR_TARGET'});
    rows[0].purpose = 'context';
    rows[0].tutorRole = 'prompt';
    expect((await auditCorpus(fixture(rows, 'owner').save())).counts.byRole.tutor).toBe(1);
  });
  it.each([undefined, 'proof', 'solution', 'hint', 'unknown'])('rejects tutor context role %j', async tutorRole => {
    const rows = ownerRows(); Object.assign(rows[0], {role: 'tutor', purpose: 'context', tutorRole});
    await expect(auditCorpus(fixture(rows, 'owner').save())).rejects.toMatchObject({code: 'TUTOR_ROLE'});
  });
  it.each(['prompt', 'given', 'suggested-wording'])('accepts declared %s tutor context without learner credit', async tutorRole => {
    const rows = ownerRows(); Object.assign(rows[0], {role: 'tutor', purpose: 'context', tutorRole});
    const report = await auditCorpus(fixture(rows, 'owner').save());
    expect(report.counts.targets).toBe(4);
    expect(report.counts.context).toBe(1);
  });
  it('rejects source-role relabelling and unversioned synthetic generation', async () => {
    const rows = baseRows(); rows[0].role = 'learner'; rows[0].provenance = 'typed';
    await expect(auditCorpus(fixture(rows).save())).rejects.toMatchObject({code: 'SOURCE_ROLE'});
    rows[0] = baseRows()[0]; delete rows[0].generator;
    await expect(auditCorpus(fixture(rows).save())).rejects.toMatchObject({code: 'SYNTHETIC_PROVENANCE'});
  });
  it('rejects exact target duplicates even when document and group IDs differ', async () => {
    const rows = baseRows(); rows[1] = withText(rows[1], rows[0].text);
    await expect(auditCorpus(fixture(rows).save())).rejects.toMatchObject({code: 'EXACT_DUPLICATE'});
  });
  it.each(['validation', 'test'])('finds train→%s 13-word overlap independent of case, punctuation and file order', async split => {
    const phrase = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu';
    const rows = [withText(baseRows()[0], phrase + ' training'),
      {...withText(baseRows()[1], phrase.toUpperCase().replaceAll(' ', ', ') + ' heldout'), split}];
    for (const ordered of [rows, [...rows].reverse()]) {
      await expect(auditCorpus(fixture(ordered).save())).rejects.toMatchObject({code: 'CROSS_SPLIT_13GRAM_OVERLAP'});
    }
  });
  it('does not invent a 13-word match from a 12-word overlap', async () => {
    const phrase = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu';
    const rows = [withText(baseRows()[0], phrase + ' training'), withText(baseRows()[1], phrase + ' heldout')];
    expect((await auditCorpus(fixture(rows).save())).status).toBe('passed');
  });
  it('includes held-out context in decontamination without treating it as a positive target', async () => {
    const rows = baseRows(); rows[1] = {...withText(rows[1], rows[0].text), purpose: 'context'};
    await expect(auditCorpus(fixture(rows).save())).rejects.toMatchObject({code: 'CROSS_SPLIT_EXACT_OVERLAP'});
  });
  it('also rejects leakage from training context and between validation and test', async () => {
    const phrase = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu';
    const rows = baseRows(); rows[0] = {...withText(rows[0], phrase + ' context'), purpose: 'context'};
    rows[1] = withText(rows[1], phrase + ' heldout');
    await expect(auditCorpus(fixture(rows).save())).rejects.toMatchObject({code: 'CROSS_SPLIT_13GRAM_OVERLAP'});
    rows[0] = baseRows()[0]; rows[2] = {...withText(rows[2], phrase + ' separate'), purpose: 'context'};
    await expect(auditCorpus(fixture(rows).save())).rejects.toMatchObject({code: 'CROSS_SPLIT_13GRAM_OVERLAP'});
  });
  it('allows repeated context inside one split without manufacturing target credit', async () => {
    const rows = baseRows().map(row => ({...row, split: 'train', purpose: 'context'}));
    rows[1] = withText(rows[1], rows[0].text);
    const report = await auditCorpus(fixture(rows).save());
    expect(report.counts.targets).toBe(0);
    expect(report.counts.context).toBe(3);
  });
  it('requires NFC and exact text hashes without converting mathematical letters with NFKC', async () => {
    const rows = baseRows(); rows[0] = withText(rows[0], 'cafe\u0301');
    await expect(auditCorpus(fixture(rows).save())).rejects.toMatchObject({code: 'TEXT_NFC'});
    rows[0] = withText(rows[0], 'ℝ'); rows[0].textSha256 = sha('R');
    await expect(auditCorpus(fixture(rows).save())).rejects.toMatchObject({code: 'TEXT_INTEGRITY'});
  });
  it('rejects unpaired surrogate escapes while preserving valid supplementary mathematical letters', async () => {
    const rows = baseRows(); rows[0] = withText(rows[0], 'A supplementary letter 𝔽 is preserved.');
    expect((await auditCorpus(fixture(rows).save())).status).toBe('passed');
    rows[0] = withText(rows[0], 'An invalid escape \ud800 cannot hash as replacement text.');
    await expect(auditCorpus(fixture(rows).save())).rejects.toMatchObject({code: 'TEXT_NFC'});
  });
  it('bounds file declarations and document counts before processing content', async () => {
    const f = fixture(); f.manifest.records.bytes = CORPUS_LIMITS.corpusBytes + 1;
    await expect(auditCorpus(f.save())).rejects.toMatchObject({code: 'FILE_REFERENCE'});
    f.manifest.records = pin('records.jsonl', '{}\n'.repeat(CORPUS_LIMITS.documents + 1));
    await expect(auditCorpus(f.save())).rejects.toMatchObject({code: 'DOCUMENT_LIMIT'});
  });
  it('returns only a fixed error code and ordinal location when private JSON is malformed', () => {
    const f = fixture();
    f.manifest.records = pin('records.jsonl', '{"private-id":"PRIVATE_DRAFT_SENTINEL", broken}\n');
    const result = spawnSync(process.execPath, ['scripts/writing-decoder/audit-corpus.mjs', f.save()], {encoding: 'utf8'});
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({status: 'failed', code: 'RECORD_JSON', recordIndex: 0});
    expect(result.stderr).not.toContain('PRIVATE_DRAFT_SENTINEL');
    expect(result.stderr).not.toContain(directory);
  });
});
