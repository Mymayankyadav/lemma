"""Measure the exact-edit ceiling of already captured development candidate pools."""
import argparse
from collections import Counter
import json
from pathlib import Path

from corpus import file_hash
from menu_evaluation import identity, joined, visible_exact


def measure(reference, capture):
    lanes = {name: Counter() for name in ('boundary', 'started')}
    for outcome, impression in joined(reference, capture):
        target = identity(outcome['edit'])
        visible = visible_exact(target, impression)
        eligible = any(identity(edit) == target for edit in impression['trace']['eligible'])
        counts = lanes['boundary' if outcome['boundary'] else 'started']
        counts.update(opportunities=1, visible=int(visible), eligible=int(eligible),
                      eligibleOrVisible=int(eligible or visible),
                      visibleOnly=int(visible and not eligible))
    return {'captureSha256': file_hash(capture), 'lanes': lanes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gold', required=True, type=Path, help='Isolated development references')
    parser.add_argument('--shipping', required=True, type=Path)
    parser.add_argument('--m2', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    report = {
        'definition': 'Union of exact eligible edits and visible edits at the recorded observation. '
                      'This bounds reranking on these fixed pools only.',
        'referenceSha256': file_hash(args.gold),
        'arms': {arm: measure(args.gold, getattr(args, arm)) for arm in ('shipping', 'm2')},
    }
    args.out.write_text(json.dumps(report, sort_keys=True, indent=2) + '\n')


if __name__ == '__main__':
    main()
