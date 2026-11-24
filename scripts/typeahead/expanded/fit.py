"""Fit normalized subject mixtures and separate observation-specific calibration events."""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path

import numpy as np

from corpus import file_hash, records

COMPONENTS = ('general', 'subject', 'question', 'draft', 'personal')
PRIOR = np.asarray([.84, .06, .06, .03, .01])


def mixture(samples, prior, shrink):
    if not samples:
        return prior
    p = np.asarray(samples, dtype='float64')
    if np.any((p < 0) | (p > 1)) or np.any(p[:, 0] <= 0) or not np.isfinite(p).all():
        raise ValueError('Invalid component target probability')
    w = prior.copy()
    for _ in range(500):
        responsibilities = p * w
        responsibilities /= responsibilities.sum(axis=1, keepdims=True)
        next_w = (responsibilities.sum(axis=0) + shrink * prior) / (len(samples) + shrink)
        if np.max(np.abs(next_w - w)) < 1e-9:
            return next_w
        w = next_w
    return w


def fit_mixtures(path):
    pooled, groups, support = [], defaultdict(list), defaultdict(Counter)
    for record in records(path):
        subject = record['subject']
        outcomes = support[subject]
        outcomes['scheduled'] += 1
        probability = record.get('probability')
        if probability is None:
            outcomes['missingComponents'] += 1
            continue
        general = float(probability['general'])
        values = [float(probability.get(name, general)) for name in COMPONENTS]
        if any(not np.isfinite(value) or not 0 <= value <= 1 for value in values):
            raise ValueError('Invalid component target probability')
        if general == 0:
            outcomes['unsupportedLiterals'] += 1
            continue
        outcomes['supportedLiterals'] += 1
        pooled.append(values)
        groups[subject].append(values)
    if not support:
        raise ValueError('Mixture-fit evidence is empty')
    totals = sum(support.values(), Counter())
    coverage = {'pooled': dict(totals), 'subjects': {name: dict(values) for name, values in sorted(support.items())},
                'literalSupportRate': len(pooled) / totals['scheduled'],
                'scope': 'Positive general probability from the frozen request outcome space'}
    experiment = {'version': 1, 'components': COMPONENTS, 'coverage': coverage, 'calibrationSha256': file_hash(path)}
    if not pooled:
        return {**experiment, 'status': 'no-supported-literals'}
    base = mixture(pooled, PRIOR, 100)
    fitted = {subject: mixture(values, base, 200).tolist() for subject, values in sorted(groups.items())}
    return {**experiment, 'status': 'fitted', 'global': base.tolist(), 'subjects': fitted,
            'counts': {'global': len(pooled), 'subjects': {name: len(values) for name, values in groups.items()}}}


def sigmoid(value):
    return 1 / (1 + np.exp(-np.clip(value, -60, 60)))


def logistic(data):
    x, y = np.asarray(data, dtype='float64').T
    if not np.isfinite(x).all() or not np.isin(y, [0, 1]).all():
        raise ValueError('Invalid calibration score or outcome')
    mu = float(x.mean())
    scale = max(float(x.std()), 1e-6)
    design = np.column_stack(((x - mu) / scale, np.ones_like(x)))
    beta = np.zeros(2)
    penalty = np.array([1., .1])
    # Ridge regularization keeps all-pass/all-fail strata finite. A monotone
    # mapping makes its threshold comparable across later held-out impressions.
    def objective(params):
        scores = design @ params
        return np.logaddexp(0, scores).sum() - y @ scores + .5 * (penalty * params**2).sum()

    for _ in range(80):
        probabilities = sigmoid(design @ beta)
        gradient = design.T @ (probabilities - y) + penalty * beta
        hessian = design.T @ ((probabilities * (1 - probabilities))[:, None] * design) + np.diag(penalty)
        step = np.linalg.solve(hessian, gradient)
        current = objective(beta)
        for divisor in (1, 2, 4, 8, 16, 32, 64, 128):
            candidate = beta - step / divisor
            candidate[0] = max(0., candidate[0])
            if objective(candidate) <= current:
                break
        else:
            break
        if np.max(np.abs(candidate - beta)) < 1e-8:
            break
        beta = candidate
    return float(beta[0] / scale), float(beta[1] - beta[0] * mu / scale)


def outcomes(record):
    if 'exact' in record:
        yield 'exact', bool(record['exact'])
    if isinstance(record.get('accepted'), bool):
        yield 'accept', record['accepted']
    if record.get('accepted') and isinstance(record.get('retained'), bool):
        yield 'retain', record['retained']


def strata(record):
    length = int(record['length'])
    if not 1 <= length <= 256 or record['context'] not in ('boundary', 'prefix'):
        raise ValueError('Invalid calibration context')
    return ('short' if length < 8 else 'medium' if length < 16 else 'long',
            record['source'], record['context'])


def probability(record, row, prior):
    own = float(sigmoid(row['slope'] * record['score'] + row['intercept']))
    if not prior:
        return own if row['count'] >= 100 else None
    shrink = row['count'] / (row['count'] + 100)
    other = float(sigmoid(prior['slope'] * record['score'] + prior['intercept']))
    return shrink * own + (1 - shrink) * other


def threshold(values, min_displays):
    values = sorted(values, reverse=True)
    hits = 0
    selected = {}
    for i, (predicted, actual) in enumerate(values, 1):
        hits += actual
        if i < min_displays or i < len(values) and values[i][0] == predicted:
            continue
        if hits / i >= .7:
            selected = {'operatingPoint': predicted, 'displayedPrecision': hits / i,
                        'operatingDisplays': i, 'operatingExactMatches': hits}
    return selected


def fit_calibration(calibration, validation, minimum):
    groups = defaultdict(list)
    calibration_ids = set()
    for record in records(calibration):
        calibration_ids.add(record['documentGroup'])
        length, source, context = strata(record)
        if source == '*':
            raise ValueError('Calibration source * is reserved')
        for name, outcome in outcomes(record):
            for category in (source, '*'):
                groups[name, length, category, context].append((record['score'], outcome))
    rows = {}
    for key, values in sorted(groups.items()):
        name, length, source, context = key
        slope, intercept = logistic(values)
        rows[key] = {'outcome': name, 'length': length, 'source': source, 'context': context,
                     'slope': slope, 'intercept': intercept, 'count': len(values)}
    scored = defaultdict(list)
    for record in records(validation):
        if record['documentGroup'] in calibration_ids:
            raise ValueError('Calibration and validation document groups overlap')
        length, source, context = strata(record)
        key = 'exact', length, source, context
        if key in rows and 'exact' in record:
            predicted = probability(record, rows[key], rows.get(('exact', length, '*', context)))
            if predicted is not None:
                scored[key].append((predicted, bool(record['exact'])))
    report = {}
    for key, values in scored.items():
        fit = threshold(values, minimum)
        if fit:
            report['/'.join(key)] = {'eligible': len(values), **fit}
            rows[key].update({field: fit[field] for field in ('operatingPoint', 'displayedPrecision')})
    return {'version': 1, 'rows': list(rows.values()), 'validation': report,
            'calibrationSha256': file_hash(calibration), 'validationSha256': file_hash(validation),
            'acceptanceEvent': 'selection after a measured display',
            'retentionEvent': 'conditional on measured acceptance'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('kind', choices=('mixture', 'calibration'))
    parser.add_argument('--calibration', type=Path, required=True)
    parser.add_argument('--validation', type=Path)
    parser.add_argument('--min-displays', type=int, default=30)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if args.kind == 'calibration':
        if not args.validation or args.min_displays <= 0:
            parser.error('Calibration needs disjoint validation and a positive minimum display count')
        fit = fit_calibration(args.calibration, args.validation, args.min_displays)
    else:
        fit = fit_mixtures(args.calibration)
    args.out.write_text(json.dumps(fit, indent=2, sort_keys=True) + '\n')


if __name__ == '__main__':
    main()
