"""Fit the lab action ranker on browser-observed M1 candidates and disjoint development gold."""
import argparse
from collections import Counter, defaultdict
import json
import math
from pathlib import Path

import numpy as np
from scipy.optimize import minimize
from scipy.special import expit, logsumexp

from corpus import file_hash, records
from menu_evaluation import identity, joined

FEATURE_COUNT = 24


def utf16_length(text):
    return len(text.encode('utf-16-le')) // 2


def advances(outcome, target, edit):
    if edit == target:
        return True
    if outcome.get('draftSha256') or outcome['kind'] != 'word' or edit[:2] != target[:2]:
        return False
    start, end, insert, caret, tail = edit
    prefix = target[2].encode('utf-16-le')[:2 * (end - start)].decode('utf-16-le')
    if caret != tail or caret != start + utf16_length(insert) or len(insert) - len(prefix) < 2:
        return False
    answer_remainder = prefix + outcome['exactGhost']
    # A completed word, punctuation or longer literal may all be valid.
    # Finishing half a word when the full edit is available earns no label.
    return answer_remainder.startswith(insert) and (
        len(insert) >= len(target[2].rstrip()) or not answer_remainder[len(insert):len(insert) + 1].isalpha())


def read_split(gold, capture, sha, selected=None):
    rows, counts = [], Counter()
    seen_assets = set()
    for outcome, impression in joined(gold, capture, selected):
        trace = impression.get('trace') or {}
        if trace.get('menuTrial') != 'm1-neutral':
            raise ValueError('Fit only blinded M1 neutral menu captures')
        fingerprint = impression.get('assets', {}).get('ngram')
        if fingerprint:
            seen_assets.add(fingerprint)
        target = identity(outcome['edit'])
        if target is None:
            raise ValueError('Missing exact gold range and selection')
        counts['opportunities'] += 1
        candidates = []
        for row in trace.get('eligible', []):
            features = row.get('trialFeatures')
            score = row.get('neutralScore')
            edit = identity(row)
            if edit is None or not isinstance(features, list) or len(features) != FEATURE_COUNT:
                raise ValueError('Unusable M1 eligible edit or action features')
            if score is not None and not math.isfinite(score):
                raise ValueError('Nonfinite score must serialize as null')
            if score is None:
                counts['zeroProbability'] += 1
                continue
            candidates.append((score, features, advances(outcome, target, edit), row['family']))
        counts['supported'] += any(row[2] for row in candidates)
        counts['severalValid'] += sum(row[2] for row in candidates) > 1
        counts['withoutCandidates'] += not candidates
        rows.append((outcome['answerId'], candidates))
    if seen_assets != {sha} or not counts['supported']:
        raise ValueError('Require one identified count pack and supported references')
    return rows, counts


def tensors(rows, *, fit_right=False):
    width = 1 + max(len(candidates) for _, candidates in rows)
    columns = FEATURE_COUNT if fit_right else FEATURE_COUNT - 1
    offset = np.full((len(rows), width), -np.inf)
    features = np.zeros((len(rows), width, columns + 1))
    valid = np.zeros((len(rows), width), dtype=bool)
    for i, (_, candidates) in enumerate(rows):
        offset[i, 0] = 0
        features[i, 0, -1] = 1
        valid[i, 0] = not any(row[2] for row in candidates)
        for j, (score, values, label, _) in enumerate(candidates, 1):
            offset[i, j] = score
            features[i, j, :columns] = values[:columns]
            valid[i, j] = label
    return offset, features, valid


def objective(weights, data, regularization):
    offset, features, valid = data
    scores = offset + features @ weights
    score_valid = np.where(valid, scores, -np.inf)
    all_normalizer = logsumexp(scores, axis=1, keepdims=True)
    valid_normalizer = logsumexp(score_valid, axis=1, keepdims=True)
    difference = np.exp(scores - all_normalizer) - np.exp(score_valid - valid_normalizer)
    gradient = np.einsum('ij,ijk->k', difference, features) / len(offset)
    penalty = regularization * weights.copy()
    penalty[-1] = 0.0
    return float((all_normalizer - valid_normalizer).mean() + .5 * (penalty @ weights)), gradient + penalty


def family_proxy(rows, weights):
    hits = 0
    for _, candidates in rows:
        ordered = sorted(candidates, key=lambda row: row[0] + np.dot(row[1][:len(weights) - 1], weights[:-1]), reverse=True)
        seen = set()
        for _, _, valid, family in ordered:
            if family in seen:
                continue
            seen.add(family)
            if valid:
                hits += 1
                break
            if len(seen) == 3:
                break
    return hits


def learn(train, validation, right=None):
    if {group for group, _ in train} & {group for group, _ in validation}:
        raise ValueError('Fitting and model selection reuse a thread')
    training, development = tensors(train), tensors(validation)
    init = np.zeros(FEATURE_COUNT)
    # Both arms tune the outside-option intercept on fitting threads only.
    free_intercept = [(0., 0.)] * (FEATURE_COUNT - 1) + [(-20., 10.)]
    prior = minimize(objective, init, args=(training, 0.), jac=True, method='L-BFGS-B', bounds=free_intercept)
    bounds = [(-2., 2.)] * (FEATURE_COUNT - 1) + [(-20., 10.)]
    learned = minimize(objective, prior.x, args=(training, .02), jac=True, method='L-BFGS-B', bounds=bounds)
    if not prior.success or not learned.success or not np.isfinite(learned.x).all():
        raise ValueError('Action fit did not converge')
    right_weight = 0.
    if right:
        if {group for group, _ in right} - {group for group, _ in train}:
            raise ValueError('Use only fitting threads for the masked suffix coefficient')
        right_init = np.insert(learned.x, -1, 0.)
        right_bound = [(x, x) for x in learned.x[:-1]] + [(-2., 2.), (learned.x[-1], learned.x[-1])]
        result = minimize(objective, right_init, args=(tensors(right, fit_right=True), .05), jac=True,
                          method='L-BFGS-B', bounds=right_bound)
        if not result.success:
            raise ValueError('Right-context fit did not converge')
        right_weight = float(result.x[-2])
    return dict(coefficients=learned.x[:-1].tolist(), outsideIntercept=float(learned.x[-1]), rightWeight=right_weight,
                tutorWeights={}, evidence={
                    'controlNll': objective(prior.x, development, 0.)[0],
                    'learnedNll': objective(learned.x, development, 0.)[0],
                    'controlFamilyTop3Proxy': family_proxy(validation, prior.x),
                    'learnedFamilyTop3Proxy': family_proxy(validation, learned.x),
                    'rightFitThreads': len({group for group, _ in right}) if right else 0,
                })


def learn_tutor(path, sha, forbidden_groups):
    """Fit weights from independently labeled, fixed-candidate-set contrasts."""
    groups = defaultdict(list)
    ids = set()
    for row in records(path):
        group = row['scope']
        document = row['documentGroup']
        pair = row['pairId']
        digest = row['candidateSetSha256']
        score_gap, signed_gap = row['neutralScoreGap'], row['signedAdjustmentGap']
        if (pair in ids or document in forbidden_groups or row['ngramSha256'] != sha or
                row['bothEligible'] is not True or row.get('synthetic') is not False or len(digest) != 64 or
                not isinstance(group, list) or len(group) != 3 or not all(isinstance(value, str) for value in group) or
                group[2] not in ('equation', 'prose') or type(row['preferLeft']) is not bool or
                not math.isfinite(score_gap) or not math.isfinite(signed_gap) or abs(signed_gap) > 2 * math.log(2)):
            raise ValueError('Unusable or overlapping Tutor fit contrast')
        ids.add(pair)
        groups[json.dumps(group, ensure_ascii=False, separators=(',', ':'))].append(
            (document, score_gap, signed_gap, row['preferLeft']))
    weights, support = {}, {}
    for group, pairs in groups.items():
        per_document = Counter(row[0] for row in pairs if row[2])
        support[group] = len(per_document)
        if len(per_document) < 12:
            continue
        offsets, signed, labels, mass = np.array([
            (b, s, y, 1. / (len(per_document) * per_document[doc])) for doc, b, s, y in pairs if s]).T
        def loss(weight):
            logits = offsets + weight[0] * signed
            return (float(mass @ (np.logaddexp(0, logits) - labels * logits) + .1 * weight[0] ** 2),
                    np.array([mass @ ((expit(logits) - labels) * signed) + .2 * weight[0]]))
        fit = minimize(loss, [0.], jac=True, method='L-BFGS-B', bounds=[(0., 1.)])
        if not fit.success:
            raise ValueError('Tutor priority fit did not converge')
        weights[group] = float(fit.x[0])
    return weights, support


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('fit', 'fit-gold', 'validation', 'val-gold', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--sha', required=True)
    parser.add_argument('--right-fit', type=Path)
    parser.add_argument('--right-gold', type=Path)
    parser.add_argument('--tutor-fit', type=Path, help='Independently labeled eligible paired contrasts on fitting data')
    args = parser.parse_args()
    if bool(args.right_fit) != bool(args.right_gold):
        parser.error('Masked suffix fitting needs both capture and gold')
    train, train_counts = read_split(args.fit_gold, args.fit, args.sha)
    dev, dev_counts = read_split(args.val_gold, args.validation, args.sha)
    right, _ = read_split(args.right_gold, args.right_fit, args.sha) if args.right_fit else (None, {})
    model = dict(version=1, qualifiedMenuTrial=None, ngramSha256=args.sha, **learn(train, dev, right))
    if args.tutor_fit:
        model['tutorWeights'], support = learn_tutor(args.tutor_fit, args.sha, {group for group, _ in dev})
        model['evidence'].update(tutorFitSha256=file_hash(args.tutor_fit), tutorFitGroupSupport=support)
    model['evidence'].update(training=dict(train_counts), development=dict(dev_counts), fitCaptureSha256=file_hash(args.fit),
                             devCaptureSha256=file_hash(args.validation))
    args.output.write_text(json.dumps(model, indent=2) + '\n')
    print(json.dumps(model['evidence']))


if __name__ == '__main__':
    main()
