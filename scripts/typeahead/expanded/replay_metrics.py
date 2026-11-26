"""Compare final three-slot logs on a frozen caret schedule.

The runtime writes one impression per event using only the prefix and question.
Gold outcomes are joined here after selection. A separate keystroke log supplies
the typing/tap/undo costs from the normal acceptance path, by answer.
"""
import argparse
from collections import Counter, defaultdict
import json
import math
from pathlib import Path

import numpy as np

from corpus import file_hash, records


def weighted_interval(samples, seed, repetitions=2000):
    if not samples:
        return None
    values = np.asarray(samples, dtype='float64')
    rng = np.random.default_rng(seed)
    results = []
    for start in range(0, repetitions, 128):
        weights = rng.integers(0, len(values), size=(min(128, repetitions - start), len(values)))
        draws = values[weights].sum(axis=1)
        valid = (draws[:, 1::2] > 0).all(axis=1)
        rates = draws[valid, ::2] / draws[valid, 1::2]
        if len(rates):
            results.extend(rates[:, 0] - rates[:, 1] if values.shape[1] == 4 else rates[:, 0])
    return [float(x) for x in np.percentile(results, [2.5, 97.5])] if results else None


def report_rates(items, seed):
    output = {}
    for name, answers in sorted(items.items()):
        total = np.asarray(answers).sum(axis=0)
        output[name] = {'numerator': int(total[0]), 'denominator': int(total[1]),
                        'rate': float(total[0] / total[1]) if total[1] else None,
                        'answerBootstrap95': weighted_interval(answers, seed), 'answers': len(answers)}
    return output


def unique(path, key):
    indexed = {}
    for record in records(path):
        name = record[key]
        if name in indexed:
            raise ValueError(f'Duplicate {key}: {name} in {path.name}')
        indexed[name] = record
    return indexed


def check_slate(slate):
    if len(slate) > 3:
        raise ValueError('Displayed slate exceeded three slots')
    return {'duplicateInsertions': len({candidate['text'] for candidate in slate}) != len(slate),
            'duplicateFamilies': len({candidate['family'] for candidate in slate}) != len(slate)}


def validate_keys(keys, gold, label):
    if set(keys) != set(gold):
        raise ValueError(f'{label} must match the complete frozen schedule')


def calibrate(rows):
    if not rows:
        return None
    bins = defaultdict(list)
    squared = logloss = 0.
    for probability, hit in rows:
        if not 0 <= probability <= 1:
            raise ValueError('Calibration probability out of range')
        bins[min(9, math.floor(probability * 10))].append((probability, hit))
        squared += (probability - hit) ** 2
        bounded = max(1e-12, min(1 - 1e-12, probability))
        logloss -= (math.log(bounded) if hit else math.log1p(-bounded))
    return {'n': len(rows), 'brier': squared / len(rows), 'logLoss': logloss / len(rows),
            'bins': [{'bin': bucket, 'n': len(values), 'meanPredicted': sum(p for p, _ in values) / len(values),
                      'empirical': sum(y for _, y in values) / len(values)} for bucket, values in sorted(bins.items())]}


def summarize(gold, impressions, costs, seed):
    by_answer = defaultdict(Counter)
    observed = set()
    used_manual_keys = {}
    groups = defaultdict(set)
    calibration = defaultdict(list)
    coverage = Counter()
    slate_violations = Counter()
    for event, target in gold.items():
        impression = impressions[event]
        if impression['prefixSha256'] != target['prefixSha256']:
            raise ValueError(f'Prefix changed at {event}')
        slate = impression['slate']
        slate_violations.update(check_slate(slate))
        answer = target['answerId']
        subject = target['subject']
        observed.add(answer)
        groups[subject].add(answer)
        values = by_answer[answer]
        if target['kind'] not in ('word', 'symbol'):
            raise ValueError('Unsupported target kind')
        if target.get('heldOutInsertions'):
            forbidden = set(target['heldOutInsertions'])
            display_texts = [item['text'] for item in slate]
            if impression.get('ghost'):
                display_texts.append(impression['ghost']['text'])
            values['blockedOpportunities'] += 1
            values['blockedDisplays'] += any(text in forbidden for text in display_texts)
        if target['boundary']:
            hit = any(item['text'] == target['exactInsertion'] for item in slate)
            strata = ['boundary', target['kind'], 'boundary/' + subject]
            for key in ('source', 'stratum', 'mathOpportunity'):
                if target.get(key):
                    strata.append(f'boundary/{key}/{target[key]}')
            for stratum in strata:
                values[stratum + '/hits'] += hit
                values[stratum + '/targets'] += 1
        ghost = impression.get('ghost')
        coverage['eligible'] += bool(impression.get('ghostEligible'))
        if ghost:
            if not impression.get('ghostEligible'):
                raise ValueError('Displayed ghost at an ineligible boundary')
            coverage['displays'] += 1
            continuation = ghost['text']
            remaining = target.get('exactGhost')
            exact = bool(continuation) and isinstance(remaining, str) and remaining.startswith(continuation)
            values['ghost/hits'] += exact
            values['ghost/targets'] += 1
            length = len(ghost['text'])
            stratum = 'short' if length < 8 else 'medium' if length < 16 else 'long'
            strata = ('pooled', f'length/{stratum}', f'source/{ghost["source"]}', f'subject/{subject}')
            for event_name, key in (('exactMatch', 'exactMatchProbability'),
                                    ('acceptance', 'acceptanceProbability'), ('retention', 'retentionProbability')):
                if key not in ghost:
                    continue
                if event_name == 'exactMatch':
                    outcome = exact
                elif event_name in ghost and (event_name != 'retention' or ghost.get('acceptance') is True):
                    outcome = bool(ghost[event_name])
                else:
                    continue
                for group in strata:
                    calibration[f'{event_name}/{group}'].append((ghost[key], outcome))
            coverage['acceptanceObserved'] += isinstance(ghost.get('acceptance'), bool)
            coverage['retentionObserved'] += isinstance(ghost.get('retention'), bool) and bool(ghost.get('acceptance'))
            coverage['accepts'] += bool(ghost.get('acceptance'))
            coverage['undos'] += bool(ghost.get('undo'))
            coverage['retained'] += bool(ghost.get('retention')) and bool(ghost.get('acceptance'))
    validate_keys(costs, observed, 'Keystroke replay')
    for answer in sorted(observed):
        cost = costs[answer]
        manual, assisted = cost['manualKeys'], cost['assistedKeys']
        if cost.get('costDefinition') not in ('full-answer-v1', 'full-answer-punctuation-pairs-v1'):
            raise ValueError('KSR requires a complete answer trajectory')
        if (type(manual) is not int or type(assisted) is not int or manual <= 0 or assisted <= 0):
            raise ValueError('Full answer costs must be positive integer key counts')
        used_manual_keys[answer] = manual
        by_answer[answer]['ksr/hits'] = manual - assisted
        by_answer[answer]['ksr/targets'] = manual
        for subject, answers in groups.items():
            if answer in answers:
                by_answer[answer][f'ksr/{subject}/hits'] = manual - assisted
                by_answer[answer][f'ksr/{subject}/targets'] = manual
    rates = defaultdict(list)
    for answer in sorted(observed):
        record = by_answer[answer]
        for name, value in record.items():
            if name.endswith('/targets'):
                stem = name.removesuffix('/targets')
                rates[stem].append((record[stem + '/hits'], value))
    blocked = sum(row['blockedDisplays'] for row in by_answer.values())
    opportunities = sum(row['blockedOpportunities'] for row in by_answer.values())
    output = {'rates': report_rates(rates, seed), 'blockedCases': {'observedDisplays': blocked,
                'opportunities': opportunities}, 'slateViolations': dict(slate_violations), 'ghost': {'counts': dict(coverage), 'coverage':
                coverage['displays'] / coverage['eligible'] if coverage['eligible'] else None},
              'calibration': {name: calibrate(rows) for name, rows in sorted(calibration.items())}}
    return output, by_answer, used_manual_keys


def paired(first, second, seed):
    rates = defaultdict(list)
    for answer in sorted(first):
        baseline = first[answer]
        candidate = second[answer]
        for key in set(baseline) | set(candidate):
            if key.endswith('/targets'):
                stem = key.removesuffix('/targets')
                rates[stem].append((candidate[stem + '/hits'], candidate[key],
                                    baseline[stem + '/hits'], baseline[key]))
    output = {}
    for name, samples in sorted(rates.items()):
        counts = np.asarray(samples).sum(axis=0)
        output[name] = {'difference': float(counts[0] / counts[1] - counts[2] / counts[3])
                        if min(counts[1], counts[3]) else None,
                        'pairedAnswerBootstrap95': weighted_interval(samples, seed)}
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gold', type=Path, required=True)
    parser.add_argument('--run', action='append', nargs=3, required=True, metavar=('NAME', 'IMPRESSIONS', 'KEYS'))
    parser.add_argument('--baseline', required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--seed', type=int, default=52489)
    args = parser.parse_args()
    gold = unique(args.gold, 'eventId')
    if not gold:
        raise ValueError('Frozen schedule is empty')
    output = {'version': 1, 'goldSha256': file_hash(args.gold), 'events': len(gold), 'seed': args.seed,
              'baseline': args.baseline, 'runs': {}}
    vectors = {}
    manual = {}
    definitions = {}
    for name, impression_path, keys_path in args.run:
        impression_path, keys_path = Path(impression_path), Path(keys_path)
        impressions = unique(impression_path, 'eventId')
        validate_keys(impressions, gold, 'Impression schedule')
        if name in vectors:
            raise ValueError(f'Repeated run name: {name}')
        costs = unique(keys_path, 'answerId')
        definitions[name] = {row.get('costDefinition') for row in costs.values()}
        if len(definitions[name]) != 1:
            raise ValueError('A run must use one complete trajectory definition')
        outcome, vectors[name], manual[name] = summarize(gold, impressions, costs, args.seed)
        output['runs'][name] = {'impressionsSha256': file_hash(impression_path), 'keysSha256': file_hash(keys_path), **outcome}
    if args.baseline not in vectors:
        raise ValueError('Named baseline is missing')
    for name, vector in vectors.items():
        if name != args.baseline:
            if definitions[name] != definitions[args.baseline]:
                raise ValueError('Cannot compare strict and punctuation-pair trajectories')
            if manual[name] != manual[args.baseline]:
                raise ValueError(f'Manual answer key costs differ in {name} and baseline')
            output['runs'][name]['versusBaseline'] = paired(vectors[args.baseline], vector, args.seed)
    args.out.write_text(json.dumps(output, indent=2, sort_keys=True) + '\n')


if __name__ == '__main__':
    main()
