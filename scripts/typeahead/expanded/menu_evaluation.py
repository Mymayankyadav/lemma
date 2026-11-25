"""Fit and evaluate exact Tutor menu edits. Join the gold only after browser capture."""
import argparse
from collections import Counter, defaultdict
import json
import math
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

from corpus import file_hash, records


def identity(row):
    start, end = row.get('start'), row.get('end')
    insert = row.get('insert', row.get('text'))
    caret = row.get('caret')
    tail = row.get('selectionEnd', caret)
    if (not isinstance(insert, str) or not all(type(i) is int for i in (start, end, caret, tail)) or
            start < 0 or end < start or caret < 0 or tail < caret):
        return None
    return start, end, insert, caret, tail


def joined(gold, observations, selected=None):
    outcomes = [row for row in records(gold) if selected is None or row['answerId'] in selected]
    if selected is not None and {row['answerId'] for row in outcomes} != selected:
        raise ValueError('A preselected thread has no reference opportunity')
    expected = {r['eventId']: r for r in outcomes}
    if len(outcomes) != len(expected):
        raise ValueError('Repeated gold event')
    seen = set()
    for impression in records(observations):
        key = impression['eventId']
        outcome = expected.get(key)
        if (outcome is None or key in seen or outcome['prefixSha256'] != impression['prefixSha256'] or
                outcome.get('draftSha256') != impression.get('draftSha256')):
            raise ValueError('Unmatched, repeated or misaligned event')
        seen.add(key)
        yield outcome, impression
    if seen != expected.keys():
        raise ValueError('Missing browser opportunities')


def fit_inputs(gold, observations):
    batches, totals = [], Counter()
    for outcome, row in joined(gold, observations):
        traced = (row.get('trace') or {}).get('eligible', [])
        # JSON represents a log probability of negative infinity as null.
        candidates = [r for r in traced if isinstance(r.get('score'), (float, int)) and math.isfinite(r['score'])]
        totals['zeroScoreCandidates'] += len(traced) - len(candidates)
        target = identity(outcome['edit'])
        if target is None:
            raise ValueError('Invalid gold edit')
        totals['opportunities'] += 1
        if not candidates:
            totals['empty'] += 1
            continue
        offsets = [0.]
        xs = [[0.] * 10 + [1.]]  # Outside-pool outcome has a separate intercept.
        y = 0
        for i, cand in enumerate(candidates, 1):
            xs.append(cand['features'] + [0.])
            offsets.append(cand['score'])
            if identity(cand) == target:
                y = i
        totals['supported'] += bool(y)
        batches.append((offsets, xs, y))
    if not batches or totals['supported'] == 0:
        raise ValueError('No supported outcomes to fit')
    width = max(len(r[0]) for r in batches)
    base = np.full((len(batches), width), -np.inf)
    features = np.zeros((*base.shape, 11))
    labels = []
    for i, (b, x, y) in enumerate(batches):
        base[i, :len(b)] = b
        features[i, :len(b)] = x
        labels.append(y)
    return base, features, np.array(labels), totals


def objective(weights, data, regularize):
    base, features, labels, totals = data
    logits = base + features @ weights
    maxima = logits.max(axis=1, keepdims=True)
    probs = np.exp(logits - maxima)
    totals_ = probs.sum(axis=1, keepdims=True)
    probs /= totals_
    ix = np.arange(len(labels))
    loss = np.sum(maxima[:, 0] + np.log(totals_[:, 0]) - logits[ix, labels]) / totals['opportunities']
    probs[ix, labels] -= 1
    gradient = np.einsum('ij,ijk->k', probs, features) / totals['opportunities']
    penalty = regularize * weights.copy()
    penalty[-1] = 0.
    return float(loss + .5 * np.dot(weights, penalty)), gradient + penalty


def fit(args):
    if args.fit.resolve() == args.validation.resolve() or args.fit_gold.resolve() == args.val_gold.resolve():
        raise ValueError('Calibration and selection must be independent')
    fit_groups = {r['answerId'] for r in records(args.fit_gold)}
    if any(r['answerId'] in fit_groups for r in records(args.val_gold)):
        raise ValueError('Fitting groups overlap model-selection groups')
    for path in (args.fit, args.validation):
        fingerprints = {r.get('assets', {}).get('ngram') for r in records(path)} - {None}
        if fingerprints != {args.sha}:
            raise ValueError('Unexpected fitting model identity')
    train = fit_inputs(args.fit_gold, args.fit)
    dev = fit_inputs(args.val_gold, args.validation)
    init = np.zeros(11)
    # Optimize the outside-pool intercept for both sides of the comparison.
    null = minimize(lambda v: (lambda pair:(pair[0], pair[1][-1:]))(objective(np.r_[np.zeros(10), v], train, 0)),
                    [0.], jac=True, method='L-BFGS-B', bounds=[(-20., 10.)])
    init[-1] = null.x[0]
    trained = minimize(objective, init, args=(train, .02), jac=True, method='L-BFGS-B', bounds=[(-2.,2.)]*10+[(-20.,10.)])
    if not trained.success or not np.isfinite(trained.x).all():
        raise ValueError('Source ranking fit did not converge')
    before = objective(init, dev, 0)[0]
    after = objective(trained.x, dev, 0)[0]
    def visible_proxy(weights):
        base, features, labels, _ = dev
        logits = base[:, 1:] + features[:, 1:, :] @ weights
        rank = np.argsort(-logits, axis=1, kind='stable')[:, :3] + 1
        return int(np.any(rank == labels[:, None], axis=1).sum())
    old_top, new_top = visible_proxy(init), visible_proxy(trained.x)
    keep = after < before and new_top >= old_top
    evidence = dict(training=dict(train[3]), validation=dict(dev[3]), oldNll=before, newNll=after, oldPoolTop3=old_top,
                    newPoolTop3=new_top, selected=bool(keep), fitCapture=file_hash(args.fit), validationCapture=file_hash(args.validation))
    model = dict(version=1, ngramSha256=args.sha, coefficients=(trained.x[:10] if keep else init[:10]).tolist(),
                 outsideIntercept=float(trained.x[-1] if keep else init[-1]), evidence=evidence)
    args.out.write_text(json.dumps(model, indent=2) + '\n')
    print(json.dumps(evidence))


def visible_exact(target, observation):
    if target is None:
        raise ValueError('Unusable reference edit')
    return any(identity(item) == target for item in observation['slate'])


def score(gold, captured, selected=None, baseline=None):
    counts, reasons, ghosts, neural = Counter(), Counter(), Counter(), Counter()
    groups = defaultdict(Counter)
    prior = None if baseline is None else {
        outcome['eventId']: visible_exact(identity(outcome['edit']), row) for outcome, row in joined(gold, baseline, selected)}
    for outcome, row in joined(gold, captured, selected):
        group = groups[outcome['answerId']]
        target = identity(outcome['edit'])
        trace = row.get('trace') or {}
        raw = [item for item in trace.get('raw', []) if identity(item) == target]
        visible = visible_exact(target, row)
        finalist = any(identity(r) == target for r in trace.get('displayed', []))
        stage = ('visible' if visible else 'finalist-not-visible' if finalist else 'outside-visible-three' if any(identity(r) == target for r in trace.get('eligible', []))
                 else 'eligible-pool-limit' if any(r['eligible'] for r in raw) else 'policy' if raw else 'unobserved-or-unproposed')
        reasons[stage] += 1
        kind = 'boundary' if outcome['boundary'] else 'prefix'
        counts[kind+'Opportunities'] += 1
        counts[kind+'Hits'] += int(visible)
        counts[outcome['kind']+'Opportunities'] += 1
        counts[outcome['kind']+'Hits'] += int(visible)
        for lane in (kind,outcome['kind']):
            group[lane+'Opportunities'] += 1
            group[lane+'Hits'] += int(visible)
            if prior is not None:
                was_visible = prior[outcome['eventId']]
                group[lane+'Gains'] += int(visible and not was_visible)
                group[lane+'Losses'] += int(was_visible and not visible)
        if row.get('neuralEligible'):
            neural['eligible'] += 1
            neural['deliveredAtObservation'] += bool(row['assets'].get('neural'))
        if row.get('ghostEligible'):
            ghosts['eligible'] += 1
        ghost = row.get('ghost')
        if ghost and ghost.get('text'):
            ghosts['shown'] += 1
            ghosts['exact'] += outcome['exactGhost'].startswith(ghost['text'])
    intervals, paired_top_three = {}, {}
    if len(groups) >= 2:
        ordered = [groups[key] for key in sorted(groups)]
        ids = np.random.default_rng(238).integers(0,len(ordered),(3000,len(ordered)))
        for lane in ('prefix','boundary','word','symbol'):
            hits = np.array([r[lane+'Hits'] for r in ordered])[ids].sum(axis=1)
            exposure = np.array([r[lane+'Opportunities'] for r in ordered])[ids].sum(axis=1)
            valid = exposure > 0
            if valid.any():
                intervals[lane] = np.quantile(hits[valid]/exposure[valid],[.025,.975]).tolist()
                if prior is not None:
                    gains = np.array([r[lane+'Gains'] for r in ordered])
                    losses = np.array([r[lane+'Losses'] for r in ordered])
                    delta = (gains - losses)[ids].sum(axis=1)
                    denominator = counts[lane+'Opportunities']
                    paired_top_three[lane] = dict(opportunities=denominator, gained=int(gains.sum()), lost=int(losses.sum()),
                        delta=float((gains-losses).sum()/denominator),
                        ci95=np.quantile(delta[valid]/exposure[valid],[.025,.975]).tolist())
    report = dict(threads=len(groups), totals=dict(counts), topThreeCi95=intervals, firstLoss=dict(reasons),
                  visibleGhost=dict(ghosts), neural=dict(neural))
    if prior is not None:
        report['pairedTopThree'] = paired_top_three
    return report


def paired(left, right):
    def byid(path):
        rows = list(records(path))
        result = {row['answerId']: row for row in rows}
        if len(rows) != len(result):
            raise ValueError('Duplicate trajectories')
        return result
    a, b = byid(left), byid(right)
    if a.keys() != b.keys() or len(a) < 2:
        raise ValueError('Paired trajectories required')
    for key in a:
        if (a[key].get('costDefinition') != b[key].get('costDefinition') or not a[key].get('costDefinition') or
                any(type(row.get('assistedKeys')) is not int or row['assistedKeys'] < 0 for row in (a[key], b[key]))):
            raise ValueError('Incompatible cost definitions or invalid assisted key counts')
    keys = sorted(a)
    manual = np.array([a[k]['manualKeys'] for k in keys])
    if np.any(manual <= 0) or any(a[k]['manualKeys'] != b[k]['manualKeys'] for k in keys):
        raise ValueError('Different manual trajectories')
    old = np.array([a[k]['assistedKeys'] for k in keys])
    new = np.array([b[k]['assistedKeys'] for k in keys])
    rng = np.random.default_rng(238)
    diff = old - new
    gain = diff.sum() / manual.sum()
    samples = rng.integers(0, len(keys), (3000, len(keys)))
    draw_manual = manual[samples].sum(axis=1)
    ci = np.quantile(diff[samples].sum(axis=1) / draw_manual, [.025,.975])
    influence = (diff - gain * manual) / manual.mean()
    return dict(threads=len(keys), manual=int(manual.sum()), baselineAssisted=int(old.sum()), candidateAssisted=int(new.sum()),
                baseKsr=1-old.sum()/manual.sum(), candidateKsr=1-new.sum()/manual.sum(), gain=gain, ci95=ci.tolist(),
                baseKsrCi95=np.quantile(1-old[samples].sum(axis=1)/draw_manual,[.025,.975]).tolist(),
                candidateKsrCi95=np.quantile(1-new[samples].sum(axis=1)/draw_manual,[.025,.975]).tolist(),
                finalThreadsFor2pp=max(200, math.ceil((2.8016*influence.std(ddof=1)/.02)**2)))


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    modes = cli.add_subparsers(dest='mode', required=True)
    f = modes.add_parser('fit')
    for name in ('fit','fit-gold','validation','val-gold','out'):
        f.add_argument('--'+name,type=Path, required=True)
    f.add_argument('--sha', required=True)
    s = modes.add_parser('score')
    s.add_argument('gold',type=Path)
    s.add_argument('observed',type=Path)
    s.add_argument('--baseline',type=Path,help='Compare exact visible offers on the same scheduled events and paired threads')
    s.add_argument('--threads',type=int,help='Predeclared first N threads from the frozen split')
    power = modes.add_parser('paired')
    power.add_argument('baseline',type=Path)
    power.add_argument('candidate',type=Path)
    args = cli.parse_args()
    if args.mode == 'fit':
        fit(args)
    elif args.mode == 'score':
        selected = None
        if args.threads is not None:
            split = args.gold.resolve().parent
            locked = json.loads((split.parent/'manifest.json').read_bytes())['splits'][split.name]['files']
            for filename in ('gold.jsonl','contexts.jsonl'):
                if file_hash(split/filename) != locked[filename]:
                    raise ValueError('Frozen evaluation data changed')
            ordered = [r['answerId'] for r in records(split/'contexts.jsonl')]
            if args.gold.name != 'gold.jsonl' or not 0 < args.threads <= len(ordered) or len(ordered) != len(set(ordered)):
                raise ValueError('Invalid final selection')
            selected = set(ordered[:args.threads])
        print(json.dumps(score(args.gold,args.observed,selected,args.baseline),indent=2))
    else:
        print(json.dumps(paired(args.baseline,args.candidate),indent=2))
