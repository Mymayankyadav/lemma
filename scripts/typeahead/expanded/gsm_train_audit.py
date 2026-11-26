#!/usr/bin/env python3
"""Check the pinned GSM8K train records against all archived training content hashes.

This excludes only whole-document normalized exact matches. It does not check
embedded passages, paraphrases or a sealed evaluation index. Never pass test.jsonl.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import re
from corpus import documents, file_hash, fingerprint, PROSE

SHA256 = '17f347dc51477c50d4efb83959dbb7c56297aba886e5544ee2aaed3024813465'


def rationale(answer):
    # GSM's #### line supplies a final answer, not a model input feature.
    return re.sub(r'<<[^<>]*>>', '', answer.split('####', 1)[0]).strip()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--gsm-train', type=Path, required=True)
    p.add_argument('--corpus', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    if file_hash(a.gsm_train) != SHA256:
        raise ValueError('GSM train hash differs from pinned upstream train')
    external = []
    with a.gsm_train.open(encoding='utf8') as f:
        for line in f:
            row = json.loads(line)
            external.append((row['question'], rationale(row['answer'])))
    queries = {fingerprint(text) for pair in external for text in pair if text}
    matched = set()
    count = 0
    for doc in documents(a.corpus, 'train'):
        count += 1
        # corpus id is fingerprint of the original text in the pinned archive.
        if doc['id'] in queries:
            matched.add(doc['id'])
    kept = [pair for pair in external if all(fingerprint(text) not in matched for text in pair if text)]
    total = sum(sum(len(s) for s in PROSE.sentences(answer)) for _, answer in kept)
    result = {'source':'openai/grade-school-math train.jsonl',
              'revision':'3101c7d5072418e28b9008a6636bde82a006892c',
              'license':'MIT, Copyright 2021 OpenAI', 'sourceSha256':SHA256,
              'oldCorpusManifestSha256':file_hash(a.corpus/'manifest.json'),
              'oldTrainDocumentsScanned':count, 'externalTrainRecords':len(external),
              'excludedExactWholeDocumentRecords':len(external)-len(kept),
              'remainingRationaleN233Tokens':total,
              'notes':'Final #### answers and calculator annotations removed. Whole-document exact match only; substring, near-duplicate, and sealed exclusion checks remain outstanding. Unapproved for independent evaluation.'}
    a.out.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')


if __name__ == '__main__':
    main()
