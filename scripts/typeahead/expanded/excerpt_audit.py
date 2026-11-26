#!/usr/bin/env python3
"""Select 400 training-only excerpts for a future human audit, without labeling them."""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
from corpus import documents, file_hash
from data_audit import digest


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--corpus', required=True, type=Path)
    p.add_argument('--out', required=True, type=Path)
    p.add_argument('--selection-out', type=Path, help='scratch-only IDs for later review; contains no text')
    p.add_argument('--max-docs', type=int, default=3000)
    a = p.parse_args()
    if a.max_docs < 400:
        p.error('at least 400 documents are required')
    strata = defaultdict(list)
    sample_count = 0
    for doc in documents(a.corpus, 'train'):
        if len(doc['text']) > 100_000:
            continue
        sample_count += 1
        n = doc['words']
        length = 'short' if n < 100 else 'medium' if n < 1000 else 'long'
        notation = 'formula' if doc.get('latex', 0) else 'no_formula'
        key = '|'.join((doc['source'], doc['register'], length, notation))
        strata[key].append({'id':doc['id'], 'stratum':key, 'register':doc['register']})
        if sample_count >= a.max_docs:
            break
    if sample_count < a.max_docs:
        raise ValueError('archive sample shortfall')
    for items in strata.values():
        items.sort(key=lambda item:digest('audit:' + item['id']))
    selection = []
    while len(selection) < 400:
        for key in sorted(strata):
            if strata[key] and len(selection) < 400:
                selection.append(strata[key].pop())
    by_register = Counter(item['register'] for item in selection)
    by_stratum = Counter(item['stratum'] for item in selection)
    ids = [item['id'] for item in selection]
    report = {'sourceManifestSha256':file_hash(a.corpus/'manifest.json'),
              'eligiblePrefixDocuments':sample_count, 'selectedExcerpts':len(selection),
              'byRegister':dict(sorted(by_register.items())), 'byStratum':dict(sorted(by_stratum.items())),
              'selectionIdSha256':digest('\n'.join(ids)), 'labels':'not collected',
              'sampling':'round-robin source/register/length/formula strata within deterministic train prefix; oversamples rare strata; not corpus prevalence',
              'reviewers':'none; independent review and agreement remain outstanding'}
    a.out.write_text(json.dumps(report, indent=2, sort_keys=True)+'\n')
    if a.selection_out:
        a.selection_out.write_text(''.join(json.dumps(item, sort_keys=True)+'\n' for item in selection))


if __name__ == '__main__':
    main()
