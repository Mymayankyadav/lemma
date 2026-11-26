"""Fit-only whole-word retrieval for an offline student experiment.

Vocabulary construction and negative sampling consume fitting rows only.
Inference sees a query vector and a literal prefix, never a reference answer.
Outputs are word strings, not policy-qualified UI edits or latency evidence.
"""
from collections import Counter, defaultdict
import hashlib
import json
import math
import re

import torch
from torch.nn import functional as F


# Unicode letters and digits within a word; preserve case and mathematical
# identifiers. Restrict connector punctuation to internal positions.
WORD = re.compile(r'[^\W_]+(?:[\'’\-][^\W_]+)*\Z', re.UNICODE)


def _advances(word, prefix):
    return isinstance(word, str) and word.startswith(prefix) and (not prefix or len(word) > len(prefix))


def build_vocabulary(fit_rows, max_words=8192, min_count=1):
    if not 2 <= max_words <= 8192 or min_count < 1:
        raise ValueError('Invalid bounded vocabulary settings')
    counts, groups, seen = Counter(), set(), 0
    for row in fit_rows:
        if row.get('split') != 'fit' or not isinstance(row.get('group'), str) or not row['group']:
            raise ValueError('Vocabulary inputs must be grouped fitting rows only')
        groups.add(row['group'])
        if row.get('kind') != 'boundary':
            continue  # The matching started-word example must not double count.
        word = row.get('gold')
        if isinstance(word, str) and 2 <= len(word) <= 64 and WORD.fullmatch(word):
            counts[word] += 1
            seen += 1
    entries = sorted(((word, count) for word, count in counts.items() if count >= min_count), key=lambda x: (-x[1], x[0]))[:max_words]
    if len(entries) < 2:
        raise ValueError('Fitting rows do not support two distinct retrieval words')
    result = {'version': 1, 'words': [{'text': word, 'count': count} for word, count in entries],
              'fitGroups': sorted(groups), 'fitBoundaryWords': seen,
              'maxWords': max_words, 'minCount': min_count}
    result['sha256'] = hashlib.sha256(json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return result


def encode_vocabulary(words, encode, max_subwords=64):
    """Cache token ids on CPU once; reject truncation and unknown/padding IDs."""
    if not 2 <= len(words) <= 8192 or not 1 <= max_subwords <= 128:
        raise ValueError('Invalid vocabulary or token limit')
    if len(set(words)) != len(words):
        raise ValueError('Repeated word in vocabulary')
    tokenized = [list(encode(word)) for word in words]
    if any(not tokens or len(tokens) > max_subwords or any(type(i) is not int or i <= 0 for i in tokens) for tokens in tokenized):
        raise ValueError('Every word needs bounded non-padding subwords')
    width = max(map(len, tokenized))
    ids = torch.zeros((len(words), width), dtype=torch.long)
    mask = torch.zeros_like(ids, dtype=torch.bool)
    for i, tokens in enumerate(tokenized):
        ids[i, :len(tokens)] = torch.tensor(tokens, dtype=torch.long)
        mask[i, :len(tokens)] = True
    return ids, mask


def sample_negatives(counts, positives, negatives, generator):
    """Sample reproducible frequency^.75 negatives, excluding each positive."""
    weights = torch.as_tensor(counts, dtype=torch.float64, device='cpu')
    positive = torch.as_tensor(positives, dtype=torch.long, device='cpu')
    if (weights.ndim != 1 or len(weights) < 2 or not torch.isfinite(weights).all() or (weights <= 0).any() or
            positive.ndim != 1 or (positive < 0).any() or (positive >= len(weights)).any() or negatives < 1):
        raise ValueError('Invalid frequency weights, targets or negative count')
    # Draw from each conditional distribution directly: no unbounded retry for
    # a highly frequent positive. B×V is a small CPU-side sampling buffer.
    probability = weights.pow(.75).repeat(len(positive), 1)
    probability[torch.arange(len(positive)), positive] = 0
    return torch.multinomial(probability, negatives, replacement=True, generator=generator)


def _mean_embeddings(embedding, ids, mask, device):
    ids, mask = ids.to(device), mask.to(device)
    values = embedding(ids)
    return (values * mask.unsqueeze(-1)).sum(dim=-2) / mask.sum(dim=-1, keepdim=True).clamp_min(1)


def sampled_retrieval_loss(query, positives, embedding, cache, negative_ids):
    """Train tied embedding/query using sampled contrastive cross entropy.

    This is not an importance-corrected full-vocabulary softmax estimate.
    Callers omit examples with positive words outside the frozen vocabulary.
    """
    ids, mask = cache
    targets = torch.as_tensor(positives, dtype=torch.long, device='cpu')
    negative = torch.as_tensor(negative_ids, dtype=torch.long, device='cpu')
    if (query.ndim != 2 or targets.shape != (len(query),) or negative.ndim != 2 or negative.shape[0] != len(query) or
            negative.shape[1] < 1 or (targets < 0).any() or (targets >= len(ids)).any() or
            (negative < 0).any() or (negative >= len(ids)).any() or (negative == targets[:, None]).any()):
        raise ValueError('Malformed positive/negative retrieval batch')
    selected = torch.cat((targets[:, None], negative), dim=1)
    vectors = _mean_embeddings(embedding, ids[selected], mask[selected], query.device)
    scores = torch.einsum('bd,bkd->bk', query, vectors)
    return F.cross_entropy(scores, torch.zeros(len(query), dtype=torch.long, device=query.device))


def prepare_retrieval_vectors(embedding, cache, chunk_size=512):
    """Cache pooled vectors after weights are frozen; rebuild after any update."""
    ids, mask = cache
    if ids.shape != mask.shape or not 1 <= chunk_size <= 1024:
        raise ValueError('Invalid retrieval cache or chunk size')
    device = embedding.weight.device
    with torch.no_grad():
        chunks = [_mean_embeddings(embedding, ids[start:start+chunk_size], mask[start:start+chunk_size], device)
                  for start in range(0, len(ids), chunk_size)]
        return torch.cat(chunks, dim=0).detach()


def retrieve(query, embedding, cache, words, prefix='', limit=32, chunk_size=512, vectors=None):
    """Score bounded vocab chunks without reference text, preserving literal case."""
    ids, mask = cache
    if (query.ndim != 1 or len(words) != len(ids) or ids.shape != mask.shape or
            not isinstance(prefix, str) or not 1 <= limit <= 32 or not 1 <= chunk_size <= 1024 or
            (vectors is not None and vectors.shape != (len(words), query.shape[0]))):
        raise ValueError('Malformed bounded inference request')
    selected = [i for i, word in enumerate(words) if _advances(word, prefix)]
    ranked = []
    with torch.no_grad():
        for start in range(0, len(selected), chunk_size):
            indices = selected[start:start+chunk_size]
            pooled = (_mean_embeddings(embedding, ids[indices], mask[indices], query.device) if vectors is None
                      else vectors[indices].to(query.device))
            scores = (pooled @ query).detach().cpu().tolist()
            if any(not math.isfinite(value) for value in scores):
                raise ValueError('Nonfinite retrieval score')
            ranked.extend((score, words[index], index) for score, index in zip(scores, indices))
    ranked.sort(key=lambda x: (-x[0], x[1], x[2]))
    return [{'text': word, 'score': score, 'index': index} for score, word, index in ranked[:limit]]


def retrieve_batch(queries, vectors, words, prefixes, limit=32, batch_size=128):
    """Bounded batch GEMM with a case-sensitive prefix mask and stable ties.

    `vectors` must be from the same frozen embedding checkpoint as `queries`.
    Rebuild it whenever the embedding weights change. Only the final selected
    indices and scores cross to the host for each batch.
    """
    if (queries.ndim != 2 or vectors.ndim != 2 or queries.shape[1] != vectors.shape[1] or
            vectors.shape[0] != len(words) or not 2 <= len(words) <= 8192 or len(prefixes) != len(queries) or
            len(set(words)) != len(words) or any(not isinstance(prefix, str) for prefix in prefixes) or
            not 1 <= limit <= 32 or not 1 <= batch_size <= 256):
        raise ValueError('Malformed batched retrieval request')
    device = queries.device
    vectors = vectors.to(device)
    lex = sorted(range(len(words)), key=lambda index: (words[index], index))
    lexical = [words[i] for i in lex]
    lex_tensor = torch.tensor(lex, dtype=torch.long, device=device)
    lexical_vectors = vectors.index_select(0, lex_tensor)
    result = []
    with torch.no_grad():
        for start in range(0, len(queries), batch_size):
            batch = queries[start:start+batch_size]
            batch_prefixes = prefixes[start:start+batch_size]
            scores = batch @ lexical_vectors.T
            if not torch.isfinite(scores).all():
                raise ValueError('Nonfinite retrieval score')
            allowed = torch.tensor([[_advances(word, prefix) for word in lexical] for prefix in batch_prefixes],
                                   dtype=torch.bool, device=device)
            scores = scores.masked_fill(~allowed, -torch.inf)
            # Input columns are lexical, so stable descending sort breaks
            # exactly equal scores by literal word rather than GPU top-k order.
            order = torch.argsort(scores, dim=1, descending=True, stable=True)[:, :limit]
            best_scores = scores.gather(1, order).cpu().tolist()
            best_positions = order.cpu().tolist()
            for positions, values in zip(best_positions, best_scores):
                result.append([{'text': lexical[pos], 'score': value, 'index': lex[pos]}
                               for pos, value in zip(positions, values) if math.isfinite(value)])
    return result


def blind_union(original, learned, prefix='', limit=32):
    """Preserve the natural pool, then fill free slots from learned words."""
    if not 1 <= limit <= 32 or not isinstance(prefix, str):
        raise ValueError('Invalid union budget or prefix')
    pools = [list(original), [entry['text'] if isinstance(entry, dict) else entry for entry in learned]]
    if any(not _advances(word, prefix) for pool in pools for word in pool):
        raise ValueError('Blind pools must contain strictly advancing prefix-matching words')
    result, used = [], set()
    for pool in pools:
        for word in pool:
            if word not in used:
                result.append(word)
                used.add(word)
                if len(result) == limit:
                    return result
    return result


def evaluate_blind_pools(observations, gold_rows, vocabulary):
    """Join references after frozen pools; report all-opportunity denominators."""
    words = {entry['text'] for entry in vocabulary['words']}
    fit_groups = set(vocabulary['fitGroups'])
    refs = {}
    for row in gold_rows:
        key = row['eventId']
        if key in refs:
            raise ValueError('Duplicate reference event')
        refs[key] = row['gold']
    counts = defaultdict(Counter)
    group_split = {}
    seen = set()
    for row in observations:
        key = row['eventId']
        if ('gold' in row or key in seen or key not in refs or not isinstance(row.get('group'), str) or not row['group'] or row.get('group') in fit_groups or
                row.get('split') not in ('calibration', 'validation') or row.get('kind') not in ('boundary', 'prefix')):
            raise ValueError('Invalid, leaking or duplicate blind observation')
        if row['group'] in group_split and group_split[row['group']] != row['split']:
            raise ValueError('A group cannot cross evaluation splits')
        group_split[row['group']] = row['split']
        seen.add(key)
        gold = refs[key]
        original = row['original']
        learned = [item['text'] if isinstance(item, dict) else item for item in row['learned']]
        union = row['union']
        ranked_union = row.get('rankedUnion', union)
        if (union != blind_union(original, learned, row['prefix']) or len(original) > 32 or len(learned) > 32 or
                len(set(original)) != len(original) or len(set(learned)) != len(learned) or
                any(not _advances(item, row['prefix']) for item in original + learned) or
                any(item not in words for item in learned) or len(ranked_union) != len(union) or set(ranked_union) != set(union)):
            raise ValueError('Inconsistent frozen candidate pools')
        for lane in ('all', row['kind']):
            c = counts[lane]; c['opportunities'] += 1; c['inVocabulary'] += int(gold in words); c['outsideVocabulary'] += int(gold not in words)
            for name, pool in (('original', original), ('learned', learned), ('union', ranked_union)):
                for n in (1, 3, 32):
                    c[f'{name}Top{n}'] += int(gold in pool[:n])
    if seen != set(refs):
        raise ValueError('Missing blind observations')
    return {'version': 1, 'mode': 'offline-word-only-no-ui-policy-or-latency',
            'vocabularySha256': vocabulary['sha256'], 'lanes': {key: dict(value) for key,value in sorted(counts.items())}}
