#!/usr/bin/env python3
"""Build bounded matched D0/D1/D2 packs using the existing shipping KN encoder.

Only archived train shards are read. The diagnostic split is grouped from that
training sample and must not be reported as independent validation.
"""
import argparse
from collections import Counter
import gzip
import json
from pathlib import Path
import time

import ngram
from corpus import PROSE, documents, file_hash
from data_audit import clean, connected_groups, digest
from reply_ablation import first_reply

REGS = ('explanation', 'proof', 'learner')


def tokenize(text):
    return list(PROSE.sentences(text))


def take(sentences, remaining):
    result = []
    for sentence in sentences:
        if remaining <= 0:
            break
        part = sentence[:remaining]
        if part:
            result.append(part)
            remaining -= len(part)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--max-docs', default=3000, type=int)
    parser.add_argument('--tokens', default=500000, type=int)
    parser.add_argument('--materialize-only', action='store_true', help='write and hash streams without building models')
    parser.add_argument('--shared-vocab', type=Path, help='reuse an existing pinned KN vocabulary')
    parser.add_argument('--arms', nargs='+', choices=('D0','D1','D2','D2-reply'), default=['D0','D1','D2'])
    args = parser.parse_args()
    if args.tokens % 100:
        parser.error('tokens must be divisible by 100')
    args.out.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    raw = []
    for doc in documents(args.corpus, 'train'):
        if len(doc['text']) <= 100_000:
            raw.append(doc)
        if len(raw) == args.max_docs:
            break
    if len(raw) != args.max_docs:
        raise ValueError('training archive shorter than sample limit')
    groups, links = connected_groups(raw)
    # Publisher families guard partitioning, but are not duplicate evidence.
    # Only actual duplicate candidate links can remove a document in D1/D2.
    duplicate_parent = list(range(len(raw)))
    def root(i):
        while duplicate_parent[i] != i:
            duplicate_parent[i] = duplicate_parent[duplicate_parent[i]]
            i = duplicate_parent[i]
        return i
    for left, right, reason in links:
        # Containment is a split/exclusion warning, not evidence that the
        # longer document contributes nothing new.
        if reason not in ('exact', 'near'):
            continue
        a, b = root(left), root(right)
        if a != b:
            duplicate_parent[max(a,b)] = min(a,b)
    duplicate_groups = [root(i) for i in range(len(raw))]
    records = []
    for d, group, duplicate in zip(raw, groups, duplicate_groups):
        result, _, reason = clean(d['text'])
        reply_text, reply_match = first_reply(d, result) if result is not None else ('', False)
        reply_tokens = tokenize(reply_text) if reply_match else []
        # An answer without usable N233 sentences must not silently disappear.
        if not reply_tokens:
            reply_match = False
        records.append({'doc':d, 'group':group, 'duplicate':duplicate, 'original':tokenize(d['text']),
                        'cleaned':tokenize(result) if result is not None else [],
                        'reply':reply_tokens if reply_match else (tokenize(result) if result is not None else []),
                        'replyMatch':reply_match, 'reason':reason})
    representative = {group:raw[group]['id'] for group in set(groups)}
    for r in records:
        r['held'] = int(digest('diagnostic:' + representative[r['group']])[:8], 16) % 5 == 0
    held = [r for r in records if r['held'] and not r['reason']]
    train = [r for r in records if not r['held']]
    held.sort(key=lambda r:digest('validation:' + r['doc']['id']))
    validation = []
    seen = set()
    remaining = 50000
    for r in held:
        if r['group'] in seen:
            continue
        seen.add(r['group'])
        sentences = take(r['cleaned'], remaining)
        if sentences:
            validation.append(sentences)
            remaining -= sum(map(len, sentences))
        if remaining == 0:
            break
    if remaining:
        raise ValueError('training-only diagnostic sample shortfall')
    # Every arm has identical diagnostic sentences, with no raw text persisted.
    def write_docs(path, entries):
        with path.open('wb') as rawfile:
            with gzip.GzipFile(fileobj=rawfile, mode='wb', mtime=0, filename='') as z:
                for sentences in entries:
                    z.write((json.dumps(sentences, separators=(',', ':')) + '\n').encode())
    valid_file = args.out/'diagnostic.jsonl.gz'
    write_docs(valid_file, validation)
    raw_order = sorted(train, key=lambda r:digest('selection:' + r['doc']['id']))
    count_by_arm = {}
    arm_definitions = [('D0','original',(60,30,10)), ('D1','cleaned',(60,30,10)),
                       ('D2','cleaned',(40,20,40))]
    if 'D2-reply' in args.arms:
        arm_definitions.append(('D2-reply','reply',(40,20,40)))
    baseline_learner_ids = set()
    for name, field, mix in arm_definitions:
        entries = []
        stats = {}
        for register, proportion in zip(REGS, mix):
            remaining = args.tokens * proportion // 100
            used, groups_used, duplicates_used, publishers = 0, set(), set(), set()
            matched, refilled = 0, 0
            for r in raw_order:
                if r['doc']['register'] != register or (field in ('cleaned','reply') and r['reason']):
                    continue
                if field in ('cleaned','reply') and r['duplicate'] in duplicates_used:
                    continue
                sentences = take(r[field], remaining)
                if not sentences:
                    continue
                entries.append(sentences)
                remaining -= sum(map(len, sentences))
                used += 1
                if name == 'D2' and register == 'learner':
                    baseline_learner_ids.add(r['doc']['id'])
                if name == 'D2-reply' and register == 'learner':
                    matched += r['replyMatch']
                    refilled += r['doc']['id'] not in baseline_learner_ids
                groups_used.add(r['group'])
                duplicates_used.add(r['duplicate'])
                publishers.add(r['doc']['group'])
                if not remaining:
                    break
            if remaining:
                failure = {'arm':name, 'register':register, 'shortfallTokens':remaining,
                           'requiredTokens':args.tokens * proportion // 100,
                           'selectedDocuments':used, 'matchedReplyDocuments':matched,
                           'refillDocumentsOutsideBaseline':refilled,
                           'availableMatchedTrainDocuments':sum(r['replyMatch'] for r in train if r['doc']['register'] == register),
                           'sourceManifestSha256':file_hash(args.corpus/'manifest.json'),
                           'sampleIdDigest':digest('\n'.join(r['doc']['id'] for r in records)),
                           'diagnosticSha256':file_hash(valid_file),
                           'scope':'training-only bounded sample; no independent validation'}
                (args.out/'shortfall.json').write_text(json.dumps(failure, indent=2, sort_keys=True)+'\n')
                raise ValueError(f'{name} {register} shortfall {remaining}; see shortfall.json')
            stats[register] = {'tokens':args.tokens * proportion // 100, 'documents':used,
                               'connectedGroups':len(groups_used), 'duplicateComponents':len(duplicates_used),
                               'publisherGroups':len(publishers)}
            if name == 'D2-reply' and register == 'learner':
                stats[register].update({'matchedReplyDocuments':matched, 'fallbackDocuments':used-matched,
                                        'refillDocumentsOutsideBaseline':refilled,
                                        'availableMatchedTrainDocuments':sum(r['replyMatch'] for r in train if r['doc']['register'] == register)})
        write_docs(args.out/(name+'.jsonl.gz'), entries)
        count_by_arm[name] = stats
    def read_sentences(path):
        with gzip.open(path, 'rt', encoding='utf8') as f:
            for line in f:
                yield from json.loads(line)
    # An explicit token-stream adapter preserves exact N233 tokens, sentence boundaries,
    # and clipping at a token boundary; existing KN encoder and runtime format are unchanged.
    current = None
    def word_stream(_corpus, split, kind, subject=None, limit=None):
        if kind != 'ngram' or subject is not None:
            raise ValueError('only general ngram is supported')
        yield from read_sentences(valid_file if split == 'validation' else args.out/(current+'.jsonl.gz'))
    ngram.words = word_stream
    vocab_file = args.out/'shared-vocab.json'
    if args.shared_vocab:
        vocab_file.write_bytes(args.shared_vocab.read_bytes())
    else:
        vocab = ngram.estimate_vocab(read_sentences(args.out/'D0.jsonl.gz'), 60000)
        vocab_file.write_text(json.dumps(vocab, ensure_ascii=False)+'\n')
    # Existing KN functions hash the corpus manifest; this pins the sample and all streams.
    manifest = {'sourceManifestSha256':file_hash(args.corpus/'manifest.json'),
                'sampleIdDigest':digest('\n'.join(r['doc']['id'] for r in records)),
                'streamSha256':{name:file_hash(args.out/(name+'.jsonl.gz')) for name,_,_ in arm_definitions},
                'diagnosticSha256':file_hash(valid_file),
                'sharedVocabularyFileSha256':file_hash(vocab_file)}
    (args.out/'manifest.json').write_text(json.dumps(manifest,sort_keys=True)+'\n')
    if args.materialize_only:
        print(json.dumps(manifest, sort_keys=True), flush=True)
        return
    results = {}
    for name in args.arms:
        current = name
        arm_start = time.monotonic()
        model = args.out/(name+'-model')
        result = ngram.build(args.out, model, 4, 20*1024*1024, 60000, 'count', 'ngram', None,
                             shared_vocab=vocab_file, train_limit=args.tokens)
        results[name] = {'seconds':round(time.monotonic()-arm_start,3), 'mix':count_by_arm[name],
                         'bytes':result['bytes'], 'sha256':result['sha256'],
                         'vocabSha256':result['vocabSha256'], 'metrics':result['metrics']}
    output = {'scope':'train-only grouped diagnostic; no independent validation', 'sampleDocuments':len(records),
              'duplicateCandidateLinks':len(links), 'sourceManifest':manifest,
              'diagnosticTokens':50000, 'diagnosticDocuments':len(validation), 'tokenBudgetPerArm':args.tokens,
              'order':4, 'packing':'shipping KN v2 encoder, count pruning, 20 MiB ceiling; shared pinned vocabulary',
              'timeSeconds':round(time.monotonic()-started,3), 'arms':results}
    (args.out/'report.json').write_text(json.dumps(output, indent=2, sort_keys=True)+'\n')


if __name__ == '__main__':
    main()
