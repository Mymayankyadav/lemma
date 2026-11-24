"""Freeze a public Math StackExchange diagnostic caret schedule for the UI replay."""
import argparse
from collections import Counter
import json
from pathlib import Path
import re

from corpus import PROSE, coverage, file_hash, text_hash, tutor_pair
from kn_build import is_held_out
from subwords import Encoder
from train import Stream

OUTCOMES = re.compile(r'\$[A-Za-z]\$|[A-Za-z]+(?:[’\'][A-Za-z]+)?(?:-[A-Za-z]+)*')
SUBJECT_ROUTE = {
    'analysis': '/p/real-analysis/cp/CP4/tutor',
}
DEFAULT_ROUTE = '/p/real-analysis/cp/CP4/tutor'


def jsonl(path, rows):
    with path.open('w') as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n')


def eligible_answer(text):
    line = re.split(r'\n\s*\n', text)[0]
    line = re.sub(r'\s+', ' ', line).strip()
    # Keep reasonably short complete portions, and avoid cutting a displayed formula.
    pieces = re.split(r'(?<=[.!?]) +', line)
    first = ''
    for piece in pieces:
        expanded = ' '.join(filter(None, (first, piece)))
        if len(expanded) > 120:
            break
        first = expanded
        if len(first) >= 40 and first.count('$') % 2 == 0:
            break
    if (not 30 <= len(first) <= 120 or len(PROSE.TOK.findall(first)) < 6 or
            first.count('$') % 2 or re.search(r'https?://|<[^>]+>|\[\w+\]\(', first)):
        return None
    return first


def boundary_cases(answer, subject, answer_id, route):
    seen_end = 0
    for match in OUTCOMES.finditer(answer):
        if answer[:match.start()].count('$') % 2:
            continue
        token = match.group()
        start, stop = match.span()
        if seen_end > start or start > 0 and (answer[start - 1].isalnum() or answer[start - 1] in '’\'-'):
            continue
        symbolic = token.startswith('$')
        if not symbolic and len(token) < 2:
            continue
        seen_end = stop
        prefix = answer[:start]
        exact = token + (' ' if answer[stop:stop+1] == ' ' and not symbolic else '')
        event_id = f'{answer_id}-{start}'
        yield ({'eventId': event_id, 'answerId': answer_id, 'prefix': prefix, 'route': route},
               {'eventId': event_id, 'answerId': answer_id, 'prefixSha256': text_hash(prefix),
                'subject': subject, 'kind': 'symbol' if symbolic else 'word', 'boundary': True,
                'exactInsertion': exact, 'exactGhost': answer[start:]})


def freeze(data, output, split, maximum, legacy):
    encoder = Encoder(json.loads((data / 'tokenizer.json').read_text())['merges'])
    stream = Stream(data, split, 512)
    outcomes, answers, events = [], [], []
    subjects = Counter()
    for start, length in stream.docs:
        start, length = int(start), int(length)
        text = encoder.decode(stream.stream[start:start + length])
        if legacy and not is_held_out(text):
            continue
        question, reply = tutor_pair({'text': text, 'source': 'hoskinson-center/proof-pile'})
        subject = coverage(question or text)
        answer = eligible_answer(reply)
        if not answer:
            continue
        answer_id = text_hash(text)
        route = SUBJECT_ROUTE.get(subject, DEFAULT_ROUTE)
        opportunities = list(boundary_cases(answer, subject, answer_id, route))
        if not opportunities:
            continue
        for event, outcome in opportunities:
            events.append(event)
            outcomes.append(outcome)
        subjects[subject] += 1
        answers.append({'answerId': answer_id, 'answer': answer, 'route': route, 'question': question, 'subject': subject})
        if len(answers) == maximum:
            break
    if not answers:
        raise ValueError('No eligible public answer examples')
    output.mkdir(parents=True, exist_ok=False)
    paths = {name: output / f'{name}.jsonl' for name in ('events', 'gold', 'answers')}
    for name, values in zip(paths, (events, outcomes, answers)):
        jsonl(paths[name], values)
    manifest = {'version': 1, 'answers': len(answers), 'subjects': subjects, 'events': len(events), 'split': split,
                'legacyHoldoutOnly': legacy, 'dataSha256': file_hash(data / 'manifest.json'),
                'source': 'Math StackExchange through hoskinson-center/proof-pile, CC BY-SA',
                'questionContext': 'source question available separately from reply',
                'sha256': {name: file_hash(path) for name, path in paths.items()}}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
    print(json.dumps(manifest, sort_keys=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pilot-data', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--split', choices=('validation', 'calibration', 'test'), required=True)
    parser.add_argument('--answers', type=int, default=32)
    parser.add_argument('--legacy-holdout', action='store_true')
    args = parser.parse_args()
    if args.answers <= 0:
        parser.error('Answer limit must be positive')
    freeze(args.pilot_data, args.out, args.split, args.answers, args.legacy_holdout)


if __name__ == '__main__':
    main()
