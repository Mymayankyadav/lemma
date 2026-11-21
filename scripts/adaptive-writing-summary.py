#!/usr/bin/env python3
"""Paired, seed-and-user cluster bootstrap over the three fixed replay runs."""
import json
import os
from pathlib import Path
import random
import statistics

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/implementation/2026-11-21/writing-aid-adaptive'
suffix = os.environ.get('ADAPTIVE_WRITING_SUMMARY_SUFFIX', '')
runs = [json.loads((OUT / f'results{suffix}{seed}.json').read_text()) for seed in ('', '-seed2', '-seed3')]
assert [x['seed'] for x in runs] == [681914, 681915, 681916]
assert len({x['datasetSha256'] for x in runs}) == 1, 'Cannot combine different datasets'
assert all(x['engineSourceSha256'] == runs[0]['engineSourceSha256'] and
           x['replaySourceSha256'] == runs[0]['replaySourceSha256'] for x in runs), 'Cannot combine different engine/replay sources'


def paired(mode, phase, a, b, metric='top1Rate'):
    clusters = []
    for run in runs:
        ar = run['results'][mode][a]['perUser']
        br = run['results'][mode][b]['perUser']
        assert [x['user'] for x in ar] == [x['user'] for x in br]
        clusters.append([x[phase][metric] - y[phase][metric] for x, y in zip(ar, br)])
    rng = random.Random(67245)
    draws = []
    for _ in range(10000):
        sample = []
        for _ in range(len(clusters)):
            cluster = rng.choice(clusters)
            sample.extend(rng.choice(cluster) for _ in range(len(cluster)))
        draws.append(statistics.mean(sample))
    draws.sort()
    return {'difference': statistics.mean(x for cluster in clusters for x in cluster),
            'ci95': [draws[249], draws[9749]],
            'perSeed': [statistics.mean(cluster) for cluster in clusters],
            'perUserMin': min(x for cluster in clusters for x in cluster),
            'perUserMax': max(x for cluster in clusters for x in cluster)}


def mean_metric(mode, model, phase, metric):
    values = [r['results'][mode][model][phase][metric] for r in runs]
    values = [v for v in values if v is not None]
    return statistics.mean(values) if values else None


results = {}
for mode in ('balanced', 'fast', 'strict'):
    modes = {}
    for model in ('static', 'frequency_reference', 'frequency', 'production', 'adapter'):
        mm = {}
        for phase in ('beforeShift', 'afterShift'):
            mm[phase] = {key: mean_metric(mode, model, phase, key) for key in
                         ('top1Rate', 'hit3Rate', 'hit3WhenTargetInPool', 'typedKeystrokesPerWord',
                          'modelledWpmAt30Baseline', 'refreshes', 'meanVisibleSlots',
                          'meanPairwiseStringDistance', 'meanUniqueDisplayedPerUser')}
        mm['earlySustainedOpportunities'] = [r['results'][mode][model]['firstSustainedEarlyImprovement']['opportunitiesPerUser'] for r in runs]
        mm['postShiftSustainedOpportunities'] = [r['results'][mode][model]['firstSustainedPostShiftImprovement']['opportunitiesPerUser'] for r in runs]
        mm['meanModelBytes'] = statistics.mean(r['results'][mode][model]['meanModelBytes'] for r in runs)
        mm['meanRankerMsPerCall'] = statistics.mean(r['results'][mode][model]['meanRankerMsPerCall'] for r in runs)
        mm['safety'] = {key: sum(r['results'][mode][model]['safety'][key] for r in runs) for key in
                        ('opportunities', 'invalidProofs', 'invalidProofsPreserved', 'badAccepts',
                         'retainedBad', 'badLogicAccepts', 'retainedBadLogic')}
        modes[model] = mm
    modes['pairedAfterShift'] = {f'production-minus-{b}': paired(mode, 'afterShift', 'production', b)
                                for b in ('static', 'frequency', 'frequency_reference', 'adapter')}
    modes['pairedBeforeShift'] = {f'production-minus-{b}': paired(mode, 'beforeShift', 'production', b)
                                 for b in ('static', 'frequency', 'frequency_reference', 'adapter')}
    results[mode] = modes

summary = {'seeds': [r['seed'] for r in runs], 'usersPerSeed': runs[0]['users'],
           'intervalMethod': 'Paired bootstrap resampling seed clusters, then users within each seed; 10,000 draws, 2.5/97.5 percentiles. Synthetic replicates, not a human population.',
           'results': results}
(OUT / f'summary{suffix}.json').write_text(json.dumps(summary, indent=2, allow_nan=False) + '\n')
for mode in results:
    print(mode, 'post-shift', {k: round(v['afterShift']['top1Rate'] * 100, 2)
                               for k, v in results[mode].items() if 'afterShift' in v})
    print('paired production - frequency', results[mode]['pairedAfterShift']['production-minus-frequency'])
