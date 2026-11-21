#!/usr/bin/env python3
"""Reproducible prequential comparison, on synthetic drafts, of four rankers.

Run with a CPU PyTorch environment: /tmp/lemma-model-venv/bin/python
scripts/adaptive-writing-experiment.py. No downloads or network are needed.
The contextual learner is called through the production TypeScript API.
"""
import collections
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import random
import re
import statistics
import subprocess
import time

import torch

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/implementation/2026-11-21/writing-aid-adaptive'
DATA = json.loads((OUT / 'dataset.json').read_text())
REPLAY_SOURCES = ('scripts/adaptive-writing-experiment.py', 'scripts/adaptive-writing-bridge.ts')
REPLAY_HASHES = {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in REPLAY_SOURCES}
SEED = int(os.environ.get('ADAPTIVE_WRITING_SEED', '681914'))
SUFFIX = os.environ.get('ADAPTIVE_WRITING_SUFFIX', '')
PASSIVE_KEEP = float(os.environ.get('ADAPTIVE_WRITING_PASSIVE_KEEP', '1'))
assert 0 <= PASSIVE_KEEP <= 1
USERS = 12
EARLY = 80
PER_REGIME = 40
RANK = 4
DAY = 24 * 60 * 60 * 1000
BASE_TIME = 1_700_000_000_000
FEEDBACK = {'refresh': -.7, 'accept': 1., 'kept': .35, 'undo': -1.5,
            'partial-edit': -.6, 'continued-match': .16, 'divergent': -.08,
            'alternate': -.2, 'dismiss': -.45, 'personal-use': .14}
# Delays are sensitivity assumptions, not measurements. Eight opportunities
# form a session at 2 s intervals; sessions are a day apart.
DELAY_MS = {'refresh': 0, 'accept': 0, 'alternate': 0, 'dismiss': 0,
            'undo': 1000, 'partial-edit': 1000, 'divergent': 400,
            'continued-match': 1200, 'personal-use': 1200, 'kept': 3000}
torch.set_num_threads(1)
torch.manual_seed(SEED)


def draw(*key):
    raw = '/'.join(map(str, (SEED,) + key)).encode()
    return int.from_bytes(hashlib.blake2b(raw, digest_size=8).digest(), 'big') / 2**64


def weighted_sample(rows, n, favorites, user, label):
    # Efraimidis-style weighted sampling without replacement.
    return sorted(rows, key=lambda x: -math.log(max(draw(user, label, x['id']), 1e-12)) /
                  (5 if x['scenario'] in favorites else 1))[:n]


def users_tasks():
    early = [x for x in DATA['cases'] if x['split'] == 'early']
    held = [x for x in DATA['cases'] if x['split'] == 'heldout']
    safety = [x for x in DATA['cases'] if x['split'] == 'safety']
    users = []
    for user in range(USERS):
        rng = random.Random((SEED << 16) ^ user)
        groups = list(range(25)); rng.shuffle(groups)
        first, second = set(groups[:7]), set(groups[7:14])
        a = weighted_sample(early, EARLY, first, user, 'early')
        b = weighted_sample(held, PER_REGIME, first, user, 'eval1')
        used = {x['id'] for x in b}
        c = weighted_sample([x for x in held if x['id'] not in used], PER_REGIME, second, user, 'eval2')
        assert not {x['id'] for x in a} & {x['id'] for x in b + c}
        assert len({x['id'] for x in a + b + c}) == len(a + b + c)
        users.append(a + b + c + safety)
    return users


class Bridge:
    def __init__(self):
        self.p = subprocess.Popen(['node', '--import', 'tsx', 'scripts/adaptive-writing-bridge.ts'], cwd=ROOT,
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)

    def run(self, **event):
        self.p.stdin.write(json.dumps(event, separators=(',', ':')) + '\n')
        self.p.stdin.flush()
        line = self.p.stdout.readline()
        if not line:
            raise RuntimeError('The production learner bridge stopped')
        return json.loads(line)

    def close(self):
        self.p.stdin.close()
        if self.p.wait() != 0:
            raise RuntimeError('The production learner bridge failed')


class Static:
    def __init__(self): self.ms = 0.
    def score(self, features, now): return [0.] * len(features)
    def update(self, updates, typed, now): pass
    def size(self): return 0


class Frequency:
    """Bounded single-word frequency/recency, with the same feedback rewards."""
    def __init__(self): self.weights, self.ms = {}, 0.
    def value(self, word, now):
        val, at = self.weights.get(word, (0., now))
        return val * 2 ** (-max(0, now - at) / (30 * DAY))
    def score(self, features, now):
        start = time.perf_counter_ns()
        result = [self.value(x['candidate'].lower(), now) for x in features]
        self.ms += (time.perf_counter_ns() - start) / 1e6
        return result
    def update(self, updates, typed, now):
        start = time.perf_counter_ns()
        for signal, f in updates:
            word = f['candidate'].lower()
            self.weights[word] = (max(-3., min(3., self.value(word, now) + .35 * FEEDBACK[signal])), now)
        # Typed words may enter a separate vocabulary, but never credit a
        # suggestion the learner was not shown in this ranking benchmark.
        if len(self.weights) > 128:
            old = min(self.weights, key=lambda key: abs(self.value(key, now)))
            del self.weights[old]
        self.ms += (time.perf_counter_ns() - start) / 1e6
    def size(self): return len(json.dumps(self.weights, separators=(',', ':')).encode())


class Sparse:
    def __init__(self, bridge, key, strategy=None): self.bridge, self.key, self.strategy, self.ms = bridge, key, strategy, 0.
    def score(self, features, now):
        result = self.bridge.run(id=self.key, now=now, features=features, strategy=self.strategy)
        self.ms += result['computeMs']; return result['scores']
    def update(self, updates, typed, now):
        result = self.bridge.run(id=self.key, now=now, updates=[{'signal': s, 'features': f} for s, f in updates], typed=typed)
        self.ms += result['computeMs']
    def size(self):
        result = self.bridge.run(id=self.key, now=BASE_TIME + 180 * DAY, sizes=True)
        return result['bytes']


class Adapter:
    """Rank-4 context×candidate adapter trained from observed rewards, no LM.

    A constant first context dimension allows a word preference to transfer to
    an unseen context. A and B are trained in CPU mini-batches; no external
    pretrained weights or target/intention labels enter an update.
    """
    def __init__(self, contexts, words, seed):
        self.contexts, self.words = contexts, words
        g = torch.Generator(device='cpu').manual_seed(seed)
        self.a = (torch.randn((len(contexts), RANK), generator=g) * .05).requires_grad_()
        self.a.data[:, 0] = 1.
        self.b = torch.zeros((len(words), RANK), requires_grad=True)
        self.pending, self.ms = [], 0.
    def score(self, features, now):
        start = time.perf_counter_ns()
        with torch.no_grad():
            c = torch.tensor([self.contexts[x['previous'].lower()] for x in features], dtype=torch.long)
            w = torch.tensor([self.words[x['candidate'].lower()] for x in features], dtype=torch.long)
            result = (self.a[c] * self.b[w]).sum(dim=1).tolist()
        self.ms += (time.perf_counter_ns() - start) / 1e6
        return result
    def update(self, updates, typed, now):
        start = time.perf_counter_ns()
        self.pending.extend((self.contexts[f['previous'].lower()], self.words[f['candidate'].lower()],
                             FEEDBACK[s]) for s, f in updates)
        if len(self.pending) >= 8:
            batch, self.pending = self.pending[:8], self.pending[8:]
            c, w, y = zip(*batch)
            ci, wi = torch.tensor(c), torch.tensor(w)
            expected = torch.tensor(y, dtype=torch.float32)
            score = (self.a[ci] * self.b[wi]).sum(dim=1)
            loss = ((score - expected) ** 2).mean() / 2
            loss.backward()
            with torch.no_grad():
                self.a -= .3 * self.a.grad
                self.b -= .3 * self.b.grad
                self.a[:, 0] = 1.
                self.a.grad.zero_(); self.b.grad.zero_()
        self.ms += (time.perf_counter_ns() - start) / 1e6
    def size(self): return (self.a.numel() + self.b.numel()) * 4
    def state(self): return {'A': self.a.detach().clone(), 'B': self.b.detach().clone(),
                              'pendingFeedback': self.pending}


def family(word):
    # Mirrors selectWritingAidPool's current morphological-family rule; its
    # engine source hash is checked before the replay.
    return re.sub(r'(?:ing|ers?|ed|es|s|ly|ment|ions?|al)$', '', word.lower())[:5]


def select(features, scores, omit=frozenset()):
    order = sorted((i for i in range(len(features)) if i not in omit), key=lambda i: (-scores[i], i))
    result, seen = [], set()
    for i in order:
        group = family(features[i]['candidate'])
        if group not in seen:
            result.append(i); seen.add(group)
            if len(result) == 3: return result
    return (result + [i for i in order if i not in result])[:3]


def distance(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        row = [i]
        for j, cb in enumerate(b, 1):
            row.append(min(row[-1] + 1, prev[j] + 1, prev[j - 1] + (ca != cb)))
        prev = row
    return prev[-1] / max(len(a), len(b), 1)


def feature(slot, candidate, mode):
    return {'kind': 'word', 'candidate': candidate, 'previous': slot['previous'], 'prefix': slot['prefix'], 'mode': mode}


def run_one(model, name, user, mode, rows):
    records, counts = [], collections.Counter()
    unique, compute_calls, pending = collections.defaultdict(set), 0, []
    last_now, previous_manual_duration = BASE_TIME, 2000
    for ix, case in enumerate(rows):
        # Keep the same schedule across scorers, with enough time for the
        # previous target to be manually finished at 30 WPM.
        now = BASE_TIME + (ix // 8) * DAY if ix % 8 == 0 else last_now + max(2000, previous_manual_duration)
        last_now = now
        due, pending = [p for p in pending if p[0] <= now], [p for p in pending if p[0] > now]
        # Incorporate feedback only once its observed delay has passed.
        for at, signal, features_or_word in sorted(due, key=lambda item: item[0]):
            model.update([] if signal == 'typed' else [(signal, features_or_word)],
                         features_or_word if signal == 'typed' else None, at)
            compute_calls += 1
        processed_feedback = sum(p[1] != 'typed' for p in due)
        phase = 'early' if ix < EARLY else 'before-shift' if ix < EARLY + PER_REGIME else 'after-shift' if ix < EARLY + 2 * PER_REGIME else 'safety'
        slot = case['modes'][mode]
        intent, initial = case['intent'], case['initial']
        scheduled_word = (slot.get('intendedWord') if slot else case.get('intendedWord')) or ''
        scheduled_prefix = slot['prefix'] if slot else ''
        previous_manual_duration = 400 * (len(scheduled_word) - len(scheduled_prefix) + 1)
        typed_chars, actions, glances = len(intent) - len(initial), 0, 0
        word_count = len(re.findall(r"[\w]+", intent[len(initial):]))
        top1 = hit3 = eligible = refresh = accepted = bad = undo = retained_bad = False
        pair_distances = []
        updates = []
        did_type = None
        if slot:
            target = slot.get('intendedWord', case.get('intendedWord'))
            prefix = slot['prefix']
            assert target and intent.startswith(slot['learnerDraft'])
            assert slot['anchor']['text'] == slot['learnerDraft'] and slot['anchor']['start'] == len(initial)
            assert all(c.startswith(prefix) and c != prefix for c in slot['candidates'])
            assert all(len(c) <= 32 for c in slot['candidates'])
            features = [feature(slot, c, mode) for c in slot['candidates']]
            scores = model.score(features, now); compute_calls += 1
            displayed = select(features, scores)
            shown = [slot['candidates'][i] for i in displayed]
            unique[phase].update(shown)
            pair_distances = [distance(shown[i], shown[j]) for i in range(len(shown)) for j in range(i + 1, len(shown))]
            eligible = target in slot['candidates']
            top1 = bool(shown and shown[0] == target)
            hit3 = target in shown
            glances += 1
            # A refresh is a deliberate action. Credit every actually shown item,
            # including when the desired word is absent from the whole pool.
            if not hit3 and draw(user, mode, case['id'], 'refresh') < .35:
                refresh = True; actions += 1; glances += 1
                updates.extend(('refresh', features[i]) for i in displayed)
                displayed = select(features, scores, frozenset(displayed))
            visible = [slot['candidates'][i] for i in displayed]
            if target in visible and draw(user, mode, case['id'], 'accept') < .45:
                chosen = displayed[visible.index(target)]
                if len(displayed) > 1 and draw(user, mode, case['id'], 'misclick') < .03:
                    chosen = next(i for i in displayed if slot['candidates'][i] != target)
                    bad = True
                # Runtime credits every other visible choice as an alternate,
                # regardless of the chosen position.
                updates.extend(('alternate', features[i]) for i in displayed if i != chosen)
                updates.append(('accept', features[chosen])); accepted = True; actions += 1
                if bad:
                    noise = draw(user, mode, case['id'], 'undo')
                    if noise < .85:
                        updates.append(('undo', features[chosen])); undo = True; actions += 1
                    elif noise < .95:
                        updates.append(('partial-edit', features[chosen])); actions += 1
                    else:
                        updates.append(('kept', features[chosen])); retained_bad = True
                    # A wrong tap is costed conservatively; correct intent is not
                    # claimed as a typing win, even if the wrong text is shorter.
                    if not retained_bad: did_type = target
                else:
                    # Applying a prefix completion does not turn the generated
                    # suffix into learner-authored evidence. Only the original
                    # anchor remains; subsequent input is outside this replay.
                    remainder = intent[len(slot['learnerDraft']):]
                    suffix = target[len(prefix):]
                    assert remainder.startswith(suffix)
                    reconstructed = slot['learnerDraft'] + suffix + remainder[len(suffix):]
                    assert reconstructed == intent
                    saved = len(suffix) + int(remainder[len(suffix):].startswith(' '))
                    typed_chars -= saved
                    updates.append(('kept', features[chosen]))
            else:
                did_type = target
            if did_type:
                # Direct manual completion is observed learner input even if
                # the word was not suggested; it is not an inferred click.
                if 4 <= len(did_type) <= 32:
                    updates.append(('personal-use', {'kind': 'word', 'candidate': did_type,
                        'previous': '', 'prefix': did_type, 'mode': mode}))
                # Manual completion supplies weak feedback only on exposures
                # still visible. Acceptance clears exposure, even after undo.
                if not accepted:
                    updates.extend(('continued-match' if slot['candidates'][i] == target else 'divergent', features[i])
                                   for i in displayed)
            # Optional sensitivity: deliberately withhold passive evidence;
            # explicit refresh, acceptance, alternate, undo and edit are kept.
            updates = [(signal, f) for index, (signal, f) in enumerate(updates)
                       if signal not in ('personal-use', 'continued-match', 'divergent', 'kept') or
                       draw(user, mode, case['id'], 'keep-passive', signal, f['candidate'], index) < PASSIVE_KEEP]
            for signal, _ in updates: counts[signal] += 1
            typed_delay = (1000 if bad and did_type else 0) + 400 * (len(target) - len(prefix) + 1)
            pending.extend((now + (typed_delay if did_type and signal in ('personal-use', 'continued-match', 'divergent')
                                   else DELAY_MS[signal]), signal, f) for signal, f in updates)
            if did_type:
                pending.append((now + typed_delay, 'typed', did_type))
        elif case.get('intendedWord') and 4 <= len(case['intendedWord']) <= 32:
            # No proposal is shown, but this one tracked target is still typed.
            did_type = case['intendedWord']
            direct = {'kind': 'word', 'candidate': did_type, 'previous': '', 'prefix': did_type, 'mode': mode}
            if draw(user, mode, case['id'], 'keep-passive', 'personal-use', did_type, 0) < PASSIVE_KEEP:
                updates.append(('personal-use', direct)); counts['personal-use'] += 1
            typed_at = now + 400 * (len(did_type) + 1)
            pending.extend((typed_at, signal, f) for signal, f in updates)
            pending.append((typed_at, 'typed', did_type))
        counts.update({'refresh-actions': int(refresh), 'accept-actions': int(accepted), 'bad-accepts': int(bad),
                       'undos': int(undo), 'retained-bad': int(retained_bad)})
        records.append({'phase': phase, 'top1': int(top1), 'hit3': int(hit3), 'eligible': int(eligible),
                        'offered': int(bool(slot)), 'typedChars': typed_chars, 'words': word_count,
                        'targetChars': len(intent) - len(initial), 'actions': actions,
                        'seconds': typed_chars * .4 + actions * .3 + glances * .08,
                        'refresh': int(refresh), 'bad': int(bad), 'retainedBad': int(retained_bad),
                        'logicBad': int(bad and case['scenario'] == 'proof-logic'),
                        'logicRetainedBad': int(retained_bad and case['scenario'] == 'proof-logic'),
                        'invalidProof': int(case['truth'] is False),
                        'invalidProofPreserved': int(case['truth'] is False and not retained_bad),
                        'pairDistances': pair_distances, 'feedback': processed_feedback,
                        'emittedFeedback': len(updates), 'slots': min(3, len(slot['candidates'])) if slot else 0})
    # Persist the last event's feedback after the last evaluated ranking.
    for at, signal, features_or_word in sorted(pending, key=lambda item: item[0]):
        model.update([] if signal == 'typed' else [(signal, features_or_word)],
                     features_or_word if signal == 'typed' else None, at)
        compute_calls += 1
    return {'records': records, 'counts': counts, 'unique': {p: len(v) for p, v in unique.items()}, 'computeMs': model.ms,
            'computeCalls': compute_calls, 'bytes': model.size(), 'model': model}


def aggregate(runs, phase):
    records = [r for run in runs for r in run['records'] if r['phase'] == phase]
    if not records: return {}
    n, eligible = len(records), sum(r['eligible'] for r in records)
    pair = [v for r in records for v in r['pairDistances']]
    return {'opportunities': n, 'offered': sum(r['offered'] for r in records), 'targetInPool': eligible,
            'top1Rate': sum(r['top1'] for r in records) / n, 'hit3Rate': sum(r['hit3'] for r in records) / n,
            'hit3WhenTargetInPool': sum(r['hit3'] for r in records) / eligible if eligible else None,
            'typedKeystrokesPerWord': sum(r['typedChars'] for r in records) / max(1, sum(r['words'] for r in records)),
            'modelledWpmAt30Baseline': sum(r['targetChars'] for r in records) / 5 / (sum(r['seconds'] for r in records) / 60),
            'refreshes': sum(r['refresh'] for r in records), 'badAccepts': sum(r['bad'] for r in records),
            'retainedBad': sum(r['retainedBad'] for r in records), 'badLogicAccepts': sum(r['logicBad'] for r in records),
            'retainedBadLogic': sum(r['logicRetainedBad'] for r in records),
            'invalidProofs': sum(r['invalidProof'] for r in records),
            'invalidProofsPreserved': sum(r['invalidProofPreserved'] for r in records),
            'meanVisibleSlots': sum(r['slots'] for r in records) / n,
            'meanPairwiseStringDistance': statistics.mean(pair) if pair else None,
            'meanUniqueDisplayedPerUser': statistics.mean(r['unique'].get(phase, 0) for r in runs),
            'feedbackSignals': sum(r['feedback'] for r in records)}


def user_phase(run, phase):
    rows = [r for r in run['records'] if r['phase'] == phase]
    return {'opportunities': len(rows), 'top1Rate': statistics.mean(r['top1'] for r in rows),
            'hit3Rate': statistics.mean(r['hit3'] for r in rows),
            'refreshes': sum(r['refresh'] for r in rows), 'badAccepts': sum(r['bad'] for r in rows),
            'feedbackSignals': sum(r['feedback'] for r in rows)}


def first_sustained_improvement(runs, static, start, end):
    # Prespecified 10-opportunity blocks, pooled across held-out users; first two
    # consecutive blocks both at least +5 percentage points over static.
    blocks = []
    for offset in range(start, end, 10):
        model = [r['top1'] for x in runs for r in x['records'][offset:offset+10]]
        base = [r['top1'] for x in static for r in x['records'][offset:offset+10]]
        blocks.append(statistics.mean(model) - statistics.mean(base))
    for i in range(1, len(blocks)):
        if blocks[i-1] >= .05 and blocks[i] >= .05:
            cut = start + (i + 1) * 10
            feedback = statistics.mean(sum(r['feedback'] for r in x['records'][start:cut]) for x in runs)
            return {'opportunitiesPerUser': cut-start, 'meanFeedbackSignalsPerUser': feedback, 'blockDeltas': blocks}
    return {'opportunitiesPerUser': None, 'meanFeedbackSignalsPerUser': None, 'blockDeltas': blocks}


def verify_fixture():
    assert DATA['stage'] == 'production-engine', 'Generate pools with adaptive-writing-engine-pool.mjs first'
    for source, expected in DATA['sourceSha256'].items():
        actual = hashlib.sha256((ROOT / source).read_bytes()).hexdigest()
        assert actual == expected, f'{source} changed; regenerate engine pools before replay'
    assert len(DATA['cases']) == len({x['id'] for x in DATA['cases']})
    assert all(x['modes']['off'] is None for x in DATA['cases'])
    assert sum(x['truth'] is False for x in DATA['cases']) >= 8
    # Exact ranking feature rows (previous, prefix, candidate) are disjoint
    # between early and held-out topics, for every mode.
    for mode in ('balanced', 'fast', 'strict'):
        sets = []
        for split in ('early', 'heldout'):
            sets.append({(s['previous'], s['prefix'], c) for x in DATA['cases'] if x['split'] == split
                         for s in [x['modes'][mode]] if s for c in s['candidates']})
        # Some common fixed-length stems and function words naturally collide
        # across scenarios. The complete learner drafts and task IDs are disjoint.
        print(f'{mode}: exact candidate-feature overlap {len(sets[0] & sets[1])}', flush=True)


def main():
    verify_fixture()
    tasks = users_tasks()
    words = sorted({c.lower() for x in DATA['cases'] for m in ('balanced', 'fast', 'strict')
                    for s in [x['modes'][m]] if s for c in s['candidates'] + [s['intendedWord']]})
    contexts = sorted({''} | {s['previous'].lower() for x in DATA['cases'] for m in ('balanced', 'fast', 'strict')
                              for s in [x['modes'][m]] if s})
    word_index, context_index = {w: i for i, w in enumerate(words)}, {w: i for i, w in enumerate(contexts)}
    bridge = Bridge(); all_results = {}; saved_weights = {}
    try:
        for mode in ('balanced', 'fast', 'strict'):
            mode_runs = {name: [] for name in ('static', 'frequency_reference', 'frequency', 'production', 'adapter')}
            for user, rows in enumerate(tasks):
                models = {'static': Static(), 'frequency_reference': Frequency(),
                          'frequency': Sparse(bridge, f'{mode}-{user}-frequency', 'frequency'),
                          'production': Sparse(bridge, f'{mode}-{user}-production'),
                          'adapter': Adapter(context_index, word_index, (SEED << 16) ^ user)}
                for name, model in models.items():
                    run = run_one(model, name, user, mode, rows)
                    mode_runs[name].append(run)
                    if name == 'adapter': saved_weights[f'{mode}-{user}'] = model.state()
            all_results[mode] = {}
            for name, runs in mode_runs.items():
                all_results[mode][name] = {
                    'early': aggregate(runs, 'early'), 'beforeShift': aggregate(runs, 'before-shift'),
                    'afterShift': aggregate(runs, 'after-shift'), 'safety': aggregate(runs, 'safety'),
                    'firstSustainedEarlyImprovement': first_sustained_improvement(runs, mode_runs['static'], 0, EARLY),
                    'firstSustainedPostShiftImprovement': first_sustained_improvement(runs, mode_runs['static'], EARLY + PER_REGIME, EARLY + 2*PER_REGIME),
                    'meanModelBytes': statistics.mean(x['bytes'] for x in runs),
                    'meanRankerMsPerCall': sum(x['computeMs'] for x in runs) / max(1, sum(x['computeCalls'] for x in runs)),
                    'feedbackCounts': dict(sum((x['counts'] for x in runs), collections.Counter())),
                    'perUser': [{'user': user, 'early': user_phase(run, 'early'),
                                 'beforeShift': user_phase(run, 'before-shift'),
                                 'afterShift': user_phase(run, 'after-shift')} for user, run in enumerate(runs)],
                }
            print(mode, {name: round(r['afterShift']['top1Rate'], 3) for name, r in all_results[mode].items()}, flush=True)
    finally:
        bridge.close()
    weights_path = OUT / f'low-rank-weights{SUFFIX}.pt'
    torch.save({'seed': SEED, 'rank': RANK, 'words': words, 'contexts': contexts, 'models': saved_weights}, weights_path)
    for source, expected in DATA['sourceSha256'].items():
        assert hashlib.sha256((ROOT / source).read_bytes()).hexdigest() == expected, f'{source} changed during replay'
    for source, expected in REPLAY_HASHES.items():
        assert hashlib.sha256((ROOT / source).read_bytes()).hexdigest() == expected, f'{source} changed during replay'
    result = {'experiment': 'Synthetic prequential local word-ranking comparison', 'seed': SEED,
              'dataset': 'dataset.json', 'users': USERS, 'earlyPerUser': EARLY, 'heldoutBeforeShiftPerUser': PER_REGIME,
              'heldoutAfterShiftPerUser': PER_REGIME, 'trainingUnit': 'only feedback actually generated before each score',
              'architecture': 'rank-4 context-by-candidate ranking adapter, trained from scratch in batches of 8; not a language model',
              'datasetSha256': hashlib.sha256((OUT / 'dataset.json').read_bytes()).hexdigest(),
              'engineSourceSha256': DATA['sourceSha256'], 'replaySourceSha256': REPLAY_HASHES, 'weights': weights_path.name,
              'weightsSha256': hashlib.sha256(weights_path.read_bytes()).hexdigest(),
              'python': platform.python_version(), 'torch': torch.__version__, 'device': 'CPU; host-specific timings',
              'assumptions': {'manualSecondsPerCharacter': .4, 'tapSeconds': .3, 'glanceSeconds': .08,
                              'eligibleAcceptProbability': .45, 'refreshProbabilityOnMiss': .35,
                              'misclickProbabilityOnAcceptWhenAlternatives': .03, 'undoProbabilityAfterMisclick': .85,
                              'passiveFeedbackRetention': PASSIVE_KEEP,
                              'signalDelayMs': DELAY_MS, 'typedSignalDelay': '400ms per remaining character plus separator; add 1s after undo/edit',
                              'opportunitySpacingMs': 2000, 'opportunitiesPerSession': 8,
                              'feedbackRewards': FEEDBACK}, 'results': all_results}
    (OUT / f'results{SUFFIX}.json').write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')


if __name__ == '__main__': main()
