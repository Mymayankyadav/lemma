#!/usr/bin/env python3
"""Custodian-side bounded exclusion check; emit aggregate counts, never source text.

Inputs are JSONL with a text field. Run this on a trusted custodian machine; hashing
is not encryption, and neither this program nor its output provides access control.
A match is a conservative candidate for exclusion/review, not proof of copying.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
from data_audit import build_index, match_index


def texts(path, limit):
    result = []
    with path.open(encoding='utf8') as stream:
        for line in stream:
            if line.strip():
                item = json.loads(line)
                if not isinstance(item.get('text'), str) or not item['text'].strip():
                    raise ValueError('each input must contain a nonempty text string')
                result.append(item['text'])
                if len(result) > limit:
                    raise ValueError('bounded check exceeded document limit')
    if not result:
        raise ValueError('empty input')
    return result


def report(reserved, candidates):
    index = build_index(reserved)
    counts = Counter()
    for text in candidates:
        found = match_index(text, index)
        counts['candidatesWithAnyMatch'] += any(found.values())
        for kind, count in found.items():
            counts[kind + 'CandidateCount'] += bool(count)
            counts[kind + 'PairCount'] += count
    return {'reservedDocuments':len(reserved), 'candidateDocuments':len(candidates),
            'counts':dict(sorted(counts.items())),
            'method':'raw-text SHA-256 exact; shared 12-token normalized substring; five-token shingle Jaccard >= 0.8',
            'scope':'bounded custodian-side candidate screen; not encryption or a leakage guarantee'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reserved', required=True, type=Path)
    parser.add_argument('--candidates', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    result = report(texts(args.reserved, 5000), texts(args.candidates, 5000))
    args.out.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')


if __name__ == '__main__':
    main()
