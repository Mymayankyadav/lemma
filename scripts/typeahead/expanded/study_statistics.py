"""Stratified paired whole-thread inference and prospective profile-block bootstrap.

Allocation is predeclared JSONL with answerId, stratum and optional profileBlock.
No outcome or allocation is inferred from the held-out answers here.
"""
import argparse
from collections import defaultdict
import json
import math
from pathlib import Path
import numpy as np
from corpus import file_hash, records
from menu_evaluation import identity, joined, visible_exact, visible_indeterminate


def indexed(path, key):
    rows = list(records(path))
    result = {row[key]: row for row in rows}
    if len(rows) != len(result):
        raise ValueError('Duplicate ' + key)
    return result


def analyze(allocation, gold, control, candidate, control_keys, candidate_keys, seed=253, simulations=10000,
            alt_ksr=.03, alt_boundary=.015):
    a = indexed(allocation, 'answerId')
    left = indexed(control_keys, 'answerId')
    right = indexed(candidate_keys, 'answerId')
    if not a or set(a) != set(left) or set(a) != set(right):
        raise ValueError('Allocation and complete matched trajectories must agree')
    vectors = {}
    for key in a:
        x, y = left[key], right[key]
        if (x.get('costDefinition') != y.get('costDefinition') or x.get('costDefinition') not in
                ('full-answer-v1', 'full-answer-punctuation-pairs-v1') or
                x.get('manualKeys') != y.get('manualKeys') or type(x.get('manualKeys')) is not int or x['manualKeys'] <= 0 or
                any(type(r.get('assistedKeys')) is not int or r['assistedKeys'] < 0 for r in (x, y))):
            raise ValueError('Invalid or mismatched trajectory: ' + key)
        vectors[key] = np.array([x['assistedKeys'] - y['assistedKeys'], x['manualKeys'], 0, 0], dtype=float)
    old = {}
    for outcome, row in joined(gold, control):
        target = identity(outcome['edit'])
        if visible_indeterminate(target, row):
            raise ValueError('Baseline has an unverified matching edit')
        old[outcome['eventId']] = visible_exact(target, row)
    seen = set()
    for outcome, row in joined(gold, candidate):
        key = outcome['answerId']
        if key not in vectors:
            raise ValueError('Observation outside allocation')
        seen.add(key)
        if visible_indeterminate(identity(outcome['edit']), row):
            raise ValueError('Candidate has an unverified matching edit')
        if outcome['boundary']:
            vectors[key][2] += int(visible_exact(identity(outcome['edit']), row)) - int(old[outcome['eventId']])
            vectors[key][3] += 1
    if seen != set(a):
        raise ValueError('Some allocated answers lack fixed observations')
    blocks = {}
    for key, row in a.items():
        stratum, block = row.get('stratum'), row.get('profileBlock', key)
        if not isinstance(stratum, str) or not stratum or not isinstance(block, str) or not block:
            raise ValueError('Each answer requires a declared stratum and valid profile block')
        if block in blocks and blocks[block][0] != stratum:
            raise ValueError('A profile block cannot cross strata')
        if block not in blocks:
            blocks[block] = (stratum, np.zeros(4))
        blocks[block][1][:] += vectors[key]
    strata = defaultdict(list)
    for stratum, value in blocks.values():
        strata[stratum].append(value)
    if len(blocks) < 2 or any(len(v) < 2 for v in strata.values()):
        raise ValueError('Need at least two independent blocks in every stratum')
    total = sum(vectors.values())
    if total[1] <= 0 or total[3] <= 0:
        raise ValueError('No manual or boundary denominator')
    estimate = np.array([total[0]/total[1], total[2]/total[3]])
    rng = np.random.default_rng(seed)
    draws = np.zeros((simulations, 4))
    for values in strata.values():
        values = np.array(values)
        for start in range(0, simulations, 128):
            count = min(128, simulations-start)
            draws[start:start+count] += values[rng.integers(0, len(values), (count, len(values)))].sum(axis=1)
    valid = (draws[:, 1] > 0) & (draws[:, 3] > 0)
    ratios = np.column_stack((draws[valid,0]/draws[valid,1], draws[valid,2]/draws[valid,3]))
    # Planning assumes independent threads; profile dependence requires a separate
    # profile-level design and therefore deliberately produces no sample size.
    planning = None
    if len(blocks) == len(a):
        ids = sorted(vectors)
        ordered = np.array([vectors[k] for k in ids])
        influence = np.column_stack(((ordered[:,0]-estimate[0]*ordered[:,1])/ordered[:,1].mean(),
                                     (ordered[:,2]-estimate[1]*ordered[:,3])/ordered[:,3].mean()))
        sd = influence.std(axis=0, ddof=1)
        required = [max(200, math.ceil((2.8*sd[0]/.02)**2)), max(200, math.ceil((2.8*sd[1]/.01)**2))]
        n = max(required)
        # Centered paired influence draws preserve endpoint dependence. The
        # normal interval is the explicit planning approximation, not the CI.
        joint = None
        if n <= 800:
            groups = [np.array([i for i, key in enumerate(ids) if a[key]['stratum'] == s]) for s in sorted(strata)]
            raw_sizes = np.array([len(group) * n / len(ids) for group in groups])
            sizes = np.floor(raw_sizes).astype(int)
            for index in np.argsort(-(raw_sizes-sizes))[:n-int(sizes.sum())]:
                sizes[index] += 1
            passed = 0
            for _ in range(simulations):
                selected = np.concatenate([rng.choice(group, size=size, replace=True) for group, size in zip(groups, sizes)])
                sample = influence[selected]
                effect = np.array([alt_ksr, alt_boundary]) + sample.mean(axis=0) - influence.mean(axis=0)
                lower = effect - 1.96 * sample.std(axis=0, ddof=1) / math.sqrt(n)
                passed += bool((effect >= [.02, .01]).all() and (lower > 0).all())
            joint = passed / simulations
        planning = dict(designEffects=[.02,.01], requiredThreads=required, selectedThreads=n,
                        influenceSd=sd.tolist(), alternative=[alt_ksr,alt_boundary],
                        jointPower=joint, reserveExceeded=n > 800,
                        jointPowerMethod='paired influence bootstrap; normal lower bound and promotion cutoffs')
    return dict(threads=len(a), blocks=len(blocks), stratumBlocks={k:len(v) for k,v in sorted(strata.items())},
                totals=total.tolist(), gain=estimate.tolist(), pairedBootstrap95=np.quantile(ratios,[.025,.975],axis=0).T.tolist(),
                resamples=simulations, seed=seed, validResamples=int(valid.sum()), planning=planning)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('allocation','gold','control','candidate','control-keys','candidate-keys','out'):
        p.add_argument('--'+name, type=Path, required=True)
    p.add_argument('--seed', type=int, default=253)
    p.add_argument('--resamples', type=int, default=10000)
    p.add_argument('--alt-ksr', type=float, default=.03)
    p.add_argument('--alt-boundary', type=float, default=.015)
    x = p.parse_args()
    if x.resamples < 1:
        raise ValueError('Need positive bootstrap count')
    result = analyze(x.allocation,x.gold,x.control,x.candidate,x.control_keys,x.candidate_keys,x.seed,x.resamples,x.alt_ksr,x.alt_boundary)
    result['inputSha256'] = {name:file_hash(getattr(x,name)) for name in ('allocation','gold','control','candidate','control_keys','candidate_keys')}
    x.out.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
