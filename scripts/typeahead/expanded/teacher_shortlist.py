"""Audit the pinned teacher on a blind browser shortlist, then join development gold.

Reorder at most the first 32 eligible edits, only within a common replacement span.
Compare the same family-deduplicated top three before and after. No device or timing
claim follows from this offline computation.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path

import numpy as np
import torch
from torch.nn import functional as F

from corpus import file_hash, records
from menu_evaluation import identity
from neural import Config, Decoder
from subwords import Encoder, prompt_ids


CHECKPOINT = 'b5ff62b315695b32b2f85e51f9ddffc2abdd64f25c17d68bd35a2d0712983687'
TOKENIZER = 'd0badb33606fb1d365c5a9129aa9e2caf4cab30ecfb39a8f8aeabb420dacbefc'
COUNT_MODEL = 'c97bacd0de80f08a66f65a76c610c8fa6076daaf70f328f4eb8be684e7ef9ba8'


def indexed(path, key):
    result = {}
    for row in records(path):
        if row[key] in result:
            raise ValueError(f'Duplicate {key} in {path.name}')
        result[row[key]] = row
    return result


def top_three(pool):
    families = set()
    result = set()
    for row in pool:
        if row['family'] not in families:
            families.add(row['family'])
            result.add(identity(row))
            if len(families) == 3:
                break
    return result


def sequence_scores(model, context, paths):
    # The browser tokenizer gives one stable context for every path in the group.
    # Trailing punctuation/space is part of the candidate edit and is scored too.
    initial, cache = model.next(torch.tensor([context]))
    log_probs = F.log_softmax(initial[0], dim=-1)
    batch = len(paths)
    steps = max(map(len, paths)) - 1
    result = log_probs[[path[0] for path in paths]]
    if steps:
        inputs = torch.zeros((batch, steps), dtype=torch.long)
        labels = torch.full_like(inputs, -100)
        for i, path in enumerate(paths):
            n = len(path) - 1
            if n:
                inputs[i, :n] = torch.tensor(path[:-1])
                labels[i, :n] = torch.tensor(path[1:])
        shared = tuple(tuple(t.expand(batch, -1, -1, -1) for t in layer) for layer in cache)
        logits = model.logits(model.hidden(inputs, shared)[0])
        nll = F.cross_entropy(logits.transpose(1, 2), labels, reduction='none')
        result = result - nll.sum(dim=1)
    return result.tolist()


def reorder(model, encoder, question, event, pool):
    prefix = event['prefix']
    if event.get('draft', prefix) != prefix:
        return pool, 0  # A causal teacher is not an infill model.
    draft = prefix.encode('utf-16-le')
    result = list(pool)
    by_span = defaultdict(list)
    for index, row in enumerate(pool[:32]):
        start, end, inserted, caret, tail = identity(row)
        end_of_edit = start + len(inserted.encode('utf-16-le')) // 2
        if 2 * end == len(draft) and caret == tail == end_of_edit:
            by_span[start].append(index)
    scored = 0
    for start, indices in by_span.items():
        if len(indices) < 2:
            continue
        try:
            left = draft[:2 * start].decode('utf-16-le')
        except UnicodeDecodeError:
            continue
        stable = encoder.encode(left)
        positions, paths = [], []
        for i in indices:
            path = encoder.encode(pool[i]['insert'])
            if 0 < len(path) <= 36 and encoder.encode(left + pool[i]['insert']) == stable + path:
                positions.append(i)
                paths.append(path)
        if len(paths) < 2:
            continue
        context = prompt_ids(encoder, question, '', left, model.cfg.context - 36)
        scores = sequence_scores(model, context, paths)
        if not all(map(math.isfinite, scores)):
            raise ValueError('Nonfinite teacher output')
        for pos, (_, original) in zip(positions, sorted(zip(scores, positions), key=lambda item: -item[0]), strict=True):
            result[pos] = pool[original]
        scored += len(paths)
    return result, scored


def measure(args):
    if file_hash(args.checkpoint) != CHECKPOINT or file_hash(args.tokenizer) != TOKENIZER:
        raise ValueError('Unrecognized teacher or tokenizer')
    events = indexed(args.cohort / 'events.jsonl', 'eventId')
    contexts = indexed(args.cohort / 'contexts.jsonl', 'answerId')
    allocation = indexed(args.cohort / 'allocation.jsonl', 'answerId')
    if set(allocation) != set(contexts) or set(allocation) != {e['answerId'] for e in events.values()}:
        raise ValueError('Mismatched predeclared thread allocation')
    encoder = Encoder(json.loads(args.tokenizer.read_bytes())['merges'])
    weights = torch.load(args.checkpoint, map_location='cpu', weights_only=True)
    model = Decoder(Config(**weights['settings']['config'])).eval()
    model.load_state_dict(weights['model'])
    captures = indexed(args.capture, 'eventId')
    if set(captures) != set(events):
        raise ValueError('Blind capture must cover every scheduled event exactly once')
    if {r.get('assets', {}).get('ngram') for r in captures.values()} - {None} != {COUNT_MODEL}:
        raise ValueError('Unexpected count pack in browser capture')
    slates = {}
    with torch.inference_mode():
        for key, event in events.items():
            row = captures[key]
            trace = row['trace']
            if trace.get('menuTrial') != 'm1-neutral' or row['prefixSha256'] != hashlib.sha256(event['prefix'].encode()).hexdigest():
                raise ValueError('Misaligned prefix or experimental arm')
            # Keep the actual shortlist order and every edit beyond the teacher cap.
            pool = trace['eligible']
            if any(identity(item) is None or not item.get('family') for item in pool):
                raise ValueError('Malformed browser edit')
            question = contexts[event['answerId']].get('question') or ''
            ordered, scored = reorder(model, encoder, question, event, pool)
            slates[key] = top_three(pool), top_three(ordered), scored
    # Reference text, including the target edit, is first opened here.
    gold = indexed(args.cohort / 'gold.jsonl', 'eventId')
    if set(gold) != set(events):
        raise ValueError('Unmatched development gold')
    by_thread = {thread: defaultdict(Counter) for thread in allocation}
    for key, (old, teacher, scored) in slates.items():
        ref = gold[key]
        if events[key]['answerId'] != ref['answerId'] or captures[key]['prefixSha256'] != ref['prefixSha256'] or (
                captures[key].get('draftSha256') != ref.get('draftSha256')):
            raise ValueError('Misaligned development reference')
        target = identity(ref['edit'])
        before, after = target in old, target in teacher
        for lane in ['all', 'boundary' if ref['boundary'] else 'started']:
            by_thread[ref['answerId']][lane].update(opportunities=1, rerankedEvents=int(scored > 0),
                scoredPaths=scored, controlHits=int(before), teacherHits=int(after),
                gained=int(after and not before), lost=int(before and not after))
    totals = {}
    rng = np.random.default_rng(253)
    strata = defaultdict(list)
    for thread, row in allocation.items():
        strata[row['stratum']].append(thread)
    for lane in ('all', 'boundary', 'started'):
        counts = Counter()
        bootstrap = np.zeros((10000, 2))
        for threads in strata.values():
            rows = [by_thread[t][lane] for t in threads]
            for report in rows:
                counts.update(report)
            pairs = np.asarray([[r['gained'] - r['lost'], r['opportunities']] for r in rows])
            bootstrap += pairs[rng.integers(len(rows), size=(len(bootstrap), len(rows)))].sum(axis=1)
        valid = bootstrap[:, 1] > 0
        interval = np.quantile(bootstrap[valid, 0] / bootstrap[valid, 1], [.025, .975]).tolist() if valid.any() else None
        totals[lane] = dict(counts, paired95=interval)
    files = [args.cohort / name for name in ['events.jsonl', 'contexts.jsonl', 'allocation.jsonl', 'gold.jsonl']]
    return dict(study='Same-pool offline exact edit top-three before UI slot persistence',
        comparison='Full exact sequence likelihood within matching spans, original order elsewhere; four-gram M1 neutral vs native teacher; no tutor hints',
        threads=len(contexts), strata={k: len(v) for k, v in sorted(strata.items())}, maxTeacherEdits=32,
        seed=253, bootstrapDraws=10000, metrics=totals, checkpointSha256=CHECKPOINT, tokenizerSha256=TOKENIZER,
        countSha256=COUNT_MODEL, captureSha256=file_hash(args.capture), cohortSha256={p.name: file_hash(p) for p in files})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for field in ('checkpoint', 'tokenizer', 'capture', 'cohort', 'out'):
        parser.add_argument('--' + field, type=Path, required=True)
    args = parser.parse_args()
    torch.set_num_threads(1)
    args.out.write_text(json.dumps(measure(args), indent=2, sort_keys=True) + '\n')
