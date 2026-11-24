"""Freeze a public Math StackExchange diagnostic caret schedule for the UI replay."""
import argparse
from collections import Counter
import json
from pathlib import Path
import re
import unicodedata

from corpus import coverage, documents, file_hash, fingerprint, records, text_hash, tutor_pair
from kn_build import is_held_out
from subwords import Encoder

SUBJECT_ROUTE = {
    'analysis': '/p/real-analysis/cp/CP4/tutor',
}
DEFAULT_ROUTE = '/p/real-analysis/cp/CP4/tutor'
MATH_COMMANDS = re.compile(r'\\(?:in|subseteq|leq|neq|to|rightarrow|cup|cap|forall|exists|frac|sqrt|mathbb)(?![A-Za-z])')
ARGUMENT_COMMANDS = frozenset(('\\frac', '\\sqrt', '\\mathbb'))
STRATIFIED_QUOTAS = {'math-rich': 24, 'prose': 16}
SUBJECT_CAPS = {'math-rich': 10, 'prose': 7}


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
        if len(first) >= 40 and not math_spans(first)[1]:
            break
    if (not 30 <= len(first) <= 120 or not acceptable_excerpt(first) or re.search(r'https?://|<[^>]+>|\[\w+\]\(', first)):
        return None
    return first


def escaped(text, position):
    first = position
    while first and text[first - 1] == '\\':
        first -= 1
    return (position - first) % 2 == 1


def math_spans(text):
    """Return delimiter and body bounds, plus an incomplete-maths indicator."""
    spans = []
    active = None
    index = 0
    while index < len(text):
        if escaped(text, index):
            index += 1
            continue
        if active:
            begin, body_start, opening, closing = active
            if closing == '$' and text.startswith('$$', index):
                index += 2
                continue
            if text.startswith(closing, index):
                end = index + len(closing)
                spans.append((begin, end, body_start, index, opening))
                active = None
                index = end
                continue
        else:
            for opening, closing in (('$$', '$$'), ('$', '$'), (r'\(', r'\)'), (r'\[', r'\]')):
                if text.startswith(opening, index):
                    active = (index, index + len(opening), opening, closing)
                    index += len(opening) - 1
                    break
        index += 1
    if active:
        begin, body_start, opening, _ = active
        spans.append((begin, len(text), body_start, len(text), opening))
    return spans, active is not None


def letter_or_mark(char):
    return unicodedata.category(char)[0] in 'LM'


def compound_joiner(char):
    return char in ("'", "’") or unicodedata.category(char) == 'Pd'


def prose_words(answer, start, stop):
    index = start
    while index < stop:
        first = index
        char = answer[index]
        if not letter_or_mark(char):
            index += 1
            continue
        index += 1
        while index < stop:
            char = answer[index]
            if (not letter_or_mark(char) and not
                    (compound_joiner(char) and index + 1 < stop and letter_or_mark(answer[index + 1]))):
                break
            index += 1
        if index - first >= 2 and (first == start or not answer[first - 1].isalnum()):
            yield first, index


def boundary_cases(answer, subject, answer_id, route, equation=False):
    def event(start, exact, kind, mode=None):
        prefix = answer[:start]
        event_id = f'{answer_id}-{start}'
        return ({'eventId': event_id, 'answerId': answer_id, 'prefix': prefix, 'route': route},
                {'eventId': event_id, 'answerId': answer_id, 'prefixSha256': text_hash(prefix),
                 'subject': subject, 'kind': kind, 'boundary': True,
                 'exactInsertion': exact, 'exactGhost': answer[start:],
                 **({'mathOpportunity': mode} if mode else {})})

    def prose(start, stop):
        for first, last in prose_words(answer, start, stop):
            exact = answer[first:last] + (' ' if answer[last:last + 1] == ' ' else '')
            yield event(first, exact, 'word')

    spans, unfinished = math_spans(answer)
    start = 0
    for which, (begin, end, body_start, body_end, delimiter) in enumerate(spans):
        yield from prose(start, begin)
        if unfinished and which == len(spans) - 1:
            return
        body = answer[body_start:body_end]
        if delimiter == '$' and len(body) == 1 and body.isascii() and body.isalpha():
            yield event(begin, answer[begin:end], 'symbol', 'inline-variable')
        if equation:
            for command in MATH_COMMANDS.finditer(answer, body_start, body_end):
                first, last = command.span()
                if escaped(answer, first):
                    continue
                token = command.group()
                if token not in ARGUMENT_COMMANDS:
                    if answer[last:last + 1] != ' ':
                        continue
                    token += ' '
                yield event(first, token, 'symbol', 'equation-command')
        start = end
    yield from prose(start, len(answer))


def acceptable_excerpt(answer):
    return not math_spans(answer)[1] and sum(
        outcome['kind'] == 'word' for _, outcome in boundary_cases(answer, '', '', DEFAULT_ROUTE)
    ) >= 6


def stratified_excerpts(reply):
    # Complete sentence excerpts bound the serial browser workload. Common prose
    # and notation-heavy cases are stratified before any model output is read.
    for paragraph in re.split(r'\n\s*\n', reply):
        pieces = re.split(r'(?<=[.!?]) +', re.sub(r'\s+', ' ', paragraph).strip())
        for start in range(len(pieces)):
            answer = ''
            for piece in pieces[start:start + 3]:
                answer = ' '.join(filter(None, (answer, piece)))
                if len(answer) > 85:
                    break
                if (65 <= len(answer) and acceptable_excerpt(answer) and
                        not re.search(r'https?://|<[^>]+>|\[\w+\]\(', answer)):
                    yield answer, list(boundary_cases(answer, '', '', DEFAULT_ROUTE, equation=True))


def pilot_rows(data, split):
    from train import Stream
    encoder = Encoder(json.loads((data / 'tokenizer.json').read_text())['merges'])
    stream = Stream(data, split, 512)
    for start, length in stream.docs:
        start, length = int(start), int(length)
        text = encoder.decode(stream.stream[start:start + length])
        yield {'text': text, 'source': 'hoskinson-center/proof-pile'}


def freeze(data, output, split, maximum, legacy, pilot, excluded_files, stratified=False, excluded_group_file=None):
    source = pilot_rows(data, split) if pilot else documents(data, split)
    excluded_ids, excluded_questions, excluded_groups, groups = set(), set(), set(), set()
    if excluded_group_file:
        excluded_groups.update(row['documentGroup'] for row in records(excluded_group_file))
    for path in excluded_files:
        for item in records(path):
            excluded_ids.add(item['answerId'])
            if item.get('documentGroup'):
                excluded_groups.add(item['documentGroup'])
            if item.get('question'):
                excluded_questions.add(fingerprint(item['question']))
    outcomes, answers, events = [], [], []
    subjects, strata, targets, sources = Counter(), Counter(), Counter(), Counter()
    subject_strata = Counter()
    for document in source:
        text = document['text']
        answer_id = text_hash(text)
        if answer_id in excluded_ids or legacy and not is_held_out(text):
            continue
        question, reply = tutor_pair(document)
        if not question or not reply or fingerprint(question) in excluded_questions:
            continue
        group = document.get('group') or fingerprint(question)
        if group in groups or group in excluded_groups:
            continue
        # Corpus coverage may include the reply. Browser routing and the
        # subject pack must use context already available before writing.
        subject = coverage(question)
        route = SUBJECT_ROUTE.get(subject, DEFAULT_ROUTE)
        bucket = 'unstratified'
        if stratified:
            answer = None
            for candidate, cases in stratified_excerpts(reply):
                symbol_count = sum(outcome['kind'] == 'symbol' for _, outcome in cases)
                label = 'math-rich' if symbol_count >= 2 else 'prose' if symbol_count == 0 else None
                if (label and strata[label] < STRATIFIED_QUOTAS[label] and
                        subject_strata[label, subject] < SUBJECT_CAPS[label]):
                    answer, bucket = candidate, label
                    break
        else:
            answer = eligible_answer(reply)
        if not answer:
            continue
        opportunities = sorted(boundary_cases(answer, subject, answer_id, route, equation=stratified),
                               key=lambda pair: int(pair[0]['eventId'].rsplit('-', 1)[1]))
        if not opportunities:
            continue
        for event, outcome in opportunities:
            events.append(event)
            outcomes.append({**outcome, 'stratum': bucket, 'source': document['source']})
            targets[outcome['kind']] += 1
            targets[outcome.get('mathOpportunity', 'plainOrInline')] += 1
        groups.add(group)
        subjects[subject] += 1
        strata[bucket] += 1
        sources[document['source']] += 1
        subject_strata[bucket, subject] += 1
        answers.append({'answerId': answer_id, 'answer': answer, 'route': route,
                        'question': question, 'subject': subject, 'documentGroup': group, 'stratum': bucket})
        if len(answers) == maximum:
            break
    if stratified and (strata != STRATIFIED_QUOTAS or targets['symbol'] < 40):
        raise ValueError(f'Frozen strata are underfilled: {dict(strata)}, {targets["symbol"]} symbol opportunities')
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
                'replaySubjectMethod': 'question-only', 'pilot': pilot,
                'strata': strata, 'targetCounts': targets, 'sourceCoverage': sources,
                'answerCodepoints': sum(len(row['answer']) for row in answers),
                'sampling': 'Notation-enriched complete sentence excerpts. No population estimate.' if stratified else 'Deterministic eligible-answer excerpts',
                'documentGroupsSha256': text_hash('\n'.join(sorted(groups))),
                'excludedSchedulesSha256': [file_hash(path) for path in excluded_files],
                'sha256': {name: file_hash(path) for name, path in paths.items()}}
    if excluded_group_file:
        manifest['excludedGroupsSha256'] = file_hash(excluded_group_file)
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
    print(json.dumps(manifest, sort_keys=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--pilot-data', type=Path)
    source.add_argument('--corpus', type=Path, help='Audited corpus shards with frozen document groups')
    parser.add_argument('--exclude-answers', type=Path, action='append', default=[])
    parser.add_argument('--exclude-groups', type=Path, help='Hasher output from the deployed training identity audit')
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--split', choices=('validation', 'calibration', 'test'), required=True)
    parser.add_argument('--answers', type=int, default=32)
    parser.add_argument('--legacy-holdout', action='store_true')
    parser.add_argument('--stratified', action='store_true',
                        help='Freeze 24 notation-rich and 16 prose answers, each 65–85 codepoints')
    args = parser.parse_args()
    if args.answers <= 0:
        parser.error('Answer limit must be positive')
    if args.stratified and args.answers != 40:
        parser.error('The frozen stratified schedule has 40 answers')
    freeze(args.pilot_data or args.corpus, args.out, args.split, args.answers, args.legacy_holdout,
           args.pilot_data is not None, args.exclude_answers, args.stratified, args.exclude_groups)


if __name__ == '__main__':
    main()
