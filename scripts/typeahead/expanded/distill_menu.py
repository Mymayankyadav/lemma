"""Train matched shortlist GRUs with a frozen native teacher and fit-only retrieval.

Example (use one T4):
  python distill_menu.py --data data.jsonl --tokenizer tokenizer.json \
    --teacher best.pt --out run --device cuda:0 --epochs 3 --batch-size 64

The same command with --resume continues the paired optimizer transaction and
resumes teacher scoring from the SQLite cache. Move the whole output directory
when resuming in a fresh Kaggle session. --stop-after-steps N permits an earlier
checkpoint on the same planned schedule. Use --device cpu for small checks.
Only `fit` and `calibration` are supported. Group allocation and the naturally
retrieved, ordered candidate list originate upstream. Use a trusted native
checkpoint produced by expanded/train.py with the same frozen tokenizer.
"""
import argparse
import copy
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from functools import lru_cache
import hashlib
from itertools import zip_longest
import json
import math
import os
from pathlib import Path
import sqlite3
from types import SimpleNamespace
import unicodedata

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
from torch.nn.utils.rnn import pack_padded_sequence, pad_sequence

from corpus import file_hash
from neural import Config, Decoder
from subwords import BYTE_OFFSET, ECMASCRIPT_WHITESPACE, RESERVED, VOCABULARY, Encoder, accelerated_encoder, prompt_ids
from student_proposals import (blind_union, build_vocabulary, encode_vocabulary, evaluate_blind_pools,
                               prepare_retrieval_vectors, retrieve_batch, sample_negatives, sampled_retrieval_loss)
from train import window_order

MENU_LIMIT = 32
ARM_NAMES = ('direct', 'distilled')
PAD = RESERVED['pad']
TERMINALS = frozenset('.,;:!?()[]{}')


@dataclass(frozen=True)
class Slate:
    group: str
    split: str
    kind: str
    prefix: str
    gold: str
    words: tuple
    prompt: list
    base: list
    paths: tuple
    target: int


def is_word(word):
    if not isinstance(word, str) or not word or len(word) > 32 or unicodedata.category(word[0])[0] != 'L':
        return False
    need_letter = False
    for char in word:
        category = unicodedata.category(char)
        if char in "'’" or category == 'Pd':
            if need_letter:
                return False
            need_letter = True
        elif category[0] in 'LM':
            need_letter = False
        else:
            return False
    return not need_letter


def encode_slate(row, encoder, word_tokens, student_context, teacher_context):
    group, split, kind, question, draft, prefix, gold, words = (
        row[key] for key in ('group', 'split', 'kind', 'question', 'draft', 'prefix', 'gold', 'candidates'))
    if (not all(isinstance(value, str) for value in (group, question, draft, prefix, gold)) or
            not group or len(group) > 256 or split not in ('fit', 'calibration') or kind not in ('boundary', 'prefix') or
            not is_word(gold) or not isinstance(words, list) or len(words) > MENU_LIMIT or not all(is_word(word) for word in words)):
        raise ValueError('Invalid group, split, text or shortlist')
    if len(set(words)) != len(words):
        raise ValueError('A slate cannot contain duplicate exact words')
    if kind == 'prefix' and (not prefix or not draft.endswith(prefix)) or kind == 'boundary' and prefix:
        raise ValueError('Active stem and draft caret disagree')
    if not gold.startswith(prefix) or gold == prefix or any(not word.startswith(prefix) or word == prefix for word in words):
        raise ValueError('Gold and candidates must be full words compatible with the typed stem')
    # Start the teacher at the stable left side of the active lexical word.
    # Encoding a suffix after the typed stem would choose a different BPE path.
    stable = draft[:-len(prefix)] if prefix else draft
    if stable and (stable.endswith('\\') or unicodedata.category(stable[-1])[0] in 'LM'):
        raise ValueError('The replacement must start at a separate BPE lexical chunk')
    paths = tuple(word_tokens(word) for word in words)
    reserve = max(36, max(map(len, paths), default=0))
    prompt = prompt_ids(encoder, question, '', draft, student_context)
    base = prompt_ids(encoder, question, '', stable, teacher_context - reserve) if split == 'fit' and len(paths) >= 2 else []
    target = words.index(gold) if gold in words else -1
    return Slate(group, split, kind, prefix, gold, tuple(words), prompt, base, paths, target)


def atomic_json(path, value):
    pending = path.with_suffix(path.suffix + '.tmp')
    pending.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')
    os.replace(pending, path)


def atomic_checkpoint(path, value):
    pending = path.with_suffix(path.suffix + '.tmp')
    with pending.open('wb') as stream:
        torch.save(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(pending, path)


def encode_ids(ids):
    return np.asarray(ids, dtype='<u2').tobytes()


def decode_ids(data):
    return np.frombuffer(data, dtype='<u2').astype(np.int64).tolist()


def build_cache(path, signature, data, encoder, settings):
    partial = path.with_suffix('.building.sqlite3')
    partial.unlink(missing_ok=True)  # Only a scratch index from an interrupted input pass.
    db = sqlite3.connect(partial)
    db.executescript('''
        CREATE TABLE manifest (signature TEXT NOT NULL);
        CREATE TABLE groups (id TEXT PRIMARY KEY, split TEXT NOT NULL) WITHOUT ROWID;
        CREATE TABLE slates (
            split TEXT NOT NULL, id INTEGER NOT NULL, group_id TEXT NOT NULL, kind TEXT NOT NULL,
            prefix TEXT NOT NULL, gold TEXT NOT NULL, words TEXT NOT NULL, prompt BLOB NOT NULL,
            base BLOB NOT NULL, base_length INTEGER NOT NULL, paths TEXT NOT NULL, target INTEGER NOT NULL,
            scores BLOB, PRIMARY KEY(split, id)
        ) WITHOUT ROWID;
        CREATE INDEX pending ON slates(base_length, id) WHERE split='fit' AND scores IS NULL;
    ''')
    tokenized_word = lru_cache(maxsize=32768)(lambda word: tuple(encoder.encode(word)))
    counts = defaultdict(int)
    try:
        with db, data.open('rb') as source:
            db.execute('INSERT INTO manifest VALUES (?)', (signature,))
            number = 0
            while line := source.readline(128 * 1024 + 1):
                number += 1
                try:
                    if len(line) > 128 * 1024:
                        raise ValueError('Slate exceeds the maximum JSONL record size')
                    row = encode_slate(json.loads(line), encoder, tokenized_word,
                                       settings['studentContext'], settings['teacherConfig']['context'])
                    db.execute('INSERT OR IGNORE INTO groups VALUES (?, ?)', (row.group, row.split))
                    if db.execute('SELECT split FROM groups WHERE id=?', (row.group,)).fetchone()[0] != row.split:
                        raise ValueError('A group occurs in both fitting and calibration')
                except (KeyError, TypeError, ValueError) as error:
                    raise ValueError(f'Invalid input on line {number}: {error}') from error
                skip_scores = row.split != 'fit' or len(row.paths) < 2
                db.execute('INSERT INTO slates VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', (
                    row.split, counts[row.split], row.group, row.kind, row.prefix, row.gold, json.dumps(row.words),
                    encode_ids(row.prompt), encode_ids(row.base), len(row.base), json.dumps(row.paths), row.target,
                    np.zeros(len(row.paths), dtype='<f4').tobytes() if skip_scores else None))
                counts[row.split] += 1
            if not counts['fit'] or not counts['calibration']:
                raise ValueError('Fitting and calibration each require examples')
    finally:
        db.close()
    os.replace(partial, path)


def boundary_ids(encoder):
    def boundary(piece):
        value = piece.decode('utf-8', errors='replace')
        return bool(value) and (value in TERMINALS or all(char in ECMASCRIPT_WHITESPACE for char in value))
    return [RESERVED['eos'], *(i for i, piece in enumerate(encoder.pieces) if boundary(piece))]


@torch.inference_mode()
def score_teacher_bucket(model, prompts, paths, boundaries, device, candidate_batch, logit_chunk):
    """Score full word paths and a terminal boundary over same-length stable prefixes."""
    base = torch.tensor(prompts, dtype=torch.long, device=device)
    hidden, cache = model.hidden(base)
    start = model.logits(hidden[:, -1]).float().log_softmax(-1)
    flat = [(owner, word) for owner, words in enumerate(paths) for word in words]
    scores = [[] for _ in prompts]
    terminal_ids = torch.tensor(boundaries, dtype=torch.long, device=device)
    for offset in range(0, len(flat), candidate_batch):
        block = flat[offset:offset + candidate_batch]
        owners = torch.tensor([owner for owner, _ in block], dtype=torch.long, device=device)
        lengths = torch.tensor([len(word) for _, word in block], dtype=torch.long, device=device)
        words = pad_sequence([torch.tensor(word, dtype=torch.long) for _, word in block], batch_first=True, padding_value=PAD).to(device)
        selected = tuple(tuple(value.index_select(0, owners) for value in layer) for layer in cache)
        states, updated = model.hidden(words, selected)
        del selected, updated
        total = start[owners, words[:, 0]]
        if words.shape[1] > 1:
            valid = torch.arange(1, words.shape[1], device=device) < lengths[:, None]
            positions = states[:, :-1][valid]
            targets = words[:, 1:][valid]
            tails = torch.zeros_like(words[:, 1:], dtype=torch.float32)
            steps = []
            for at in range(0, len(targets), logit_chunk):
                logits = model.logits(positions[at:at + logit_chunk]).float()
                ids = targets[at:at + logit_chunk, None]
                steps.append(logits.gather(1, ids).squeeze(1) - logits.logsumexp(-1))
            tails[valid] = torch.cat(steps)
            total = total + tails.sum(-1)
        terminal = states[torch.arange(len(block), device=device), lengths - 1]
        endings = []
        for at in range(0, len(block), logit_chunk):
            logits = model.logits(terminal[at:at + logit_chunk]).float()
            endings.append(logits.index_select(1, terminal_ids).logsumexp(-1) - logits.logsumexp(-1))
        values = (total + torch.cat(endings)).tolist()
        if not all(math.isfinite(value) for value in values):
            raise ValueError('Teacher produced a nonfinite word-event probability')
        for (owner, _), value in zip(block, values):
            scores[owner].append(value)
    return scores


def fill_teacher(db, checkpoint, settings, encoder, device):
    total = db.execute("SELECT count(*) FROM slates WHERE split='fit' AND scores IS NULL").fetchone()[0]
    if not total:
        return
    model = Decoder(Config(**settings['teacherConfig']))
    model.load_state_dict(checkpoint['model'])
    dtype = torch.float16 if settings['teacherDtype'] == 'fp16' else torch.float32
    model.to(device=device, dtype=dtype).eval()
    endings = boundary_ids(encoder)
    remaining = total
    while remaining:
        length = db.execute("SELECT min(base_length) FROM slates WHERE split='fit' AND scores IS NULL").fetchone()[0]
        rows = db.execute("""SELECT id, base, paths FROM slates WHERE split='fit' AND scores IS NULL
            AND base_length=? ORDER BY id LIMIT ?""", (length, settings['teacherRows'])).fetchall()
        prompts = [decode_ids(row[1]) for row in rows]
        paths = [json.loads(row[2]) for row in rows]
        scores = score_teacher_bucket(model, prompts, paths, endings, device, settings['teacherBatchSize'], settings['teacherLogitChunk'])
        with db:
            db.executemany("UPDATE slates SET scores=? WHERE split='fit' AND id=?",
                           [(np.asarray(values, dtype='<f4').tobytes(), row[0]) for row, values in zip(rows, scores)])
        remaining -= len(rows)
        if remaining == 0 or remaining // 512 != (remaining + len(rows)) // 512:
            print(f'Teacher slates scored {total - remaining}/{total}', flush=True)


class MenuStudent(nn.Module):
    """One recurrent query and a tied embedding table for both input and candidate words."""
    def __init__(self):
        super().__init__()
        self.embedding = nn.Embedding(VOCABULARY, 128, padding_idx=PAD)
        self.recurrent = nn.GRU(128, 192, batch_first=True)
        self.projection = nn.Linear(192, 128)
        self.outside = nn.Linear(128, 1)
        nn.init.normal_(self.embedding.weight, std=.02)
        with torch.no_grad():
            self.embedding.weight[PAD].zero_()

    def query(self, prompt_ids, prompt_lengths):
        packed = pack_padded_sequence(self.embedding(prompt_ids), prompt_lengths, batch_first=True, enforce_sorted=False)
        _, state = self.recurrent(packed)
        return self.projection(state[-1])

    def scores(self, query, word_ids, token_mask):
        pooled = (self.embedding(word_ids) * token_mask[..., None]).sum(-2)
        pooled = pooled / token_mask.sum(-1, keepdim=True).clamp_min(1)
        word_scores = (query[:, None] * pooled).sum(-1)
        return torch.cat((word_scores.masked_fill(~token_mask.any(-1), -torch.inf), self.outside(query)), dim=-1)


def listwise_loss(scores, labels, teacher, eligible, temperature, weight):
    loss = F.cross_entropy(scores, labels, reduction='none')
    if not weight:
        return loss.mean()
    with_distillation = eligible.sum(dim=1) > 1
    if not with_distillation.any():
        return loss.mean()
    mask = eligible[with_distillation]
    q = (teacher[with_distillation] / temperature).masked_fill(~mask, -torch.inf).log_softmax(-1)
    p = (scores[with_distillation, :-1] / temperature).log_softmax(-1)
    relative = q.masked_fill(~mask, 0) - p.masked_fill(~mask, 0)
    penalty = (q.exp() * relative).sum(-1) * (temperature ** 2)
    return (loss.sum() + weight * (penalty - loss[with_distillation]).sum()) / len(loss)


@dataclass
class Batch:
    prompt: torch.Tensor
    lengths: torch.Tensor
    words: torch.Tensor
    mask: torch.Tensor
    labels: torch.Tensor | None
    teacher: torch.Tensor
    rows: list


def load_batch(db, split, ids, device):
    # Rows are gathered in sampler order independently of SQLite's physical order.
    blind = split == 'calibration'
    reference = 'NULL' if blind else 'gold'
    exact = 'NULL' if blind else 'target'
    sql = (f'SELECT id, kind, prefix, {reference}, words, prompt, paths, {exact}, scores, group_id '
           'FROM slates WHERE split=? AND id IN (' + ','.join('?' for _ in ids) + ')')
    found = {row[0]: row[1:] for row in db.execute(sql, (split, *ids))}
    rows = [found[i] for i in ids]
    prompt_ids = [torch.tensor(decode_ids(row[4]), dtype=torch.long) for row in rows]
    paths = [json.loads(row[5]) for row in rows]
    width = max(1, max(map(len, paths)))
    pieces = max(1, max((len(path) for slate in paths for path in slate), default=0))
    words = np.zeros((len(ids), width, pieces), dtype=np.int64)
    teacher = np.zeros((len(ids), width), dtype=np.float32)
    for index, (row, choices) in enumerate(zip(rows, paths)):
        for column, path in enumerate(choices):
            words[index, column, :len(path)] = path
        teacher[index, :len(choices)] = np.frombuffer(row[7], dtype='<f4')
    tokens = torch.from_numpy(words).to(device)
    return Batch(pad_sequence(prompt_ids, batch_first=True, padding_value=PAD).to(device),
                 torch.tensor([len(prompt) for prompt in prompt_ids], dtype=torch.long), tokens, tokens.ne(PAD),
                 None if blind else torch.tensor([row[6] if row[6] >= 0 else width for row in rows], dtype=torch.long, device=device),
                 torch.from_numpy(teacher).to(device), rows)


def vocabulary_for(db, out, encoder, settings):
    fit = (dict(group=group, split='fit', kind=kind, gold=gold) for group, kind, gold in
           db.execute("SELECT group_id, kind, gold FROM slates WHERE split='fit' ORDER BY id"))
    vocabulary = build_vocabulary(fit, settings['proposalVocab'], settings['proposalMinCount'])
    output = out / 'proposal-vocabulary.json'
    if output.exists() and json.loads(output.read_text()) != vocabulary:
        raise ValueError('Resume would replace the frozen fitting vocabulary')
    atomic_json(output, vocabulary)
    words = [item['text'] for item in vocabulary['words']]
    counts = [item['count'] for item in vocabulary['words']]
    return vocabulary, words, counts, encode_vocabulary(words, encoder.encode, max_subwords=128)


def retrieval_batch(batch, lookup, counts, settings, step):
    covered = [(i, lookup[row[2]]) for i, row in enumerate(batch.rows) if row[2] in lookup]
    if not covered:
        return None
    positions = torch.tensor([i for i, _ in covered], dtype=torch.long)
    positives = torch.tensor([word for _, word in covered], dtype=torch.long)
    # Sample once, then reuse the exact same negatives in both optimizer arms.
    generator = torch.Generator().manual_seed((settings['seed'] + 1) * 1_000_003 + step)
    negatives = sample_negatives(counts, positives, settings['retrievalNegatives'], generator)
    return positions, positives, negatives


def model_hash(model):
    digest = hashlib.sha256()
    for name, value in sorted(model.state_dict().items()):
        digest.update(name.encode() + b'\0' + value.detach().cpu().numpy().tobytes())
    return digest.hexdigest()


def equal_budget_merge(original, learned, limit=16):
    """Interleave two ordered lists, deduplicate, and backfill to the fixed cap."""
    merged = {}
    for pair in zip_longest(original, learned):
        for word in pair:
            if word is not None:
                merged[word] = None
            if len(merged) == limit:
                return list(merged)
    return list(merged)


@torch.inference_mode()
def evaluate(model, db, count, device, settings, vocabulary, words, word_cache):
    model.eval()
    vectors = prepare_retrieval_vectors(model.embedding, word_cache)
    ranking, proposals = defaultdict(Counter), defaultdict(Counter)
    equal_budget = defaultdict(Counter)
    group_ranks = defaultdict(lambda: defaultdict(Counter))
    for position in range(0, count, settings['batchSize']):
        ids = list(range(position, min(position + settings['batchSize'], count)))
        batch = load_batch(db, 'calibration', ids, device)
        query = model.query(batch.prompt, batch.lengths)
        scores = model.scores(query, batch.words, batch.mask)
        learned = retrieve_batch(query, vectors, words, [row[1] for row in batch.rows])
        score_rows = scores.cpu().tolist()
        proposals_blind = []
        budgets_blind = []
        for identifier, row, scored, hits in zip(ids, batch.rows, score_rows, learned):
            kind, prefix, _, original_json, *rest = row
            group = rest[-1]
            original = json.loads(original_json)
            union = blind_union(original, hits, prefix)
            merged = {hit['text']: hit['score'] for hit in hits}
            merged.update(zip(original, scored))
            ranked_union = sorted(union, key=lambda word: (-merged[word], word))
            proposals_16 = [hit['text'] for hit in hits[:16]]
            interleaved = equal_budget_merge(original[:16], proposals_16)
            budgets_blind.append(dict(count=original[:16], learned=proposals_16, interleaved=interleaved,
                                      reranked=sorted(interleaved, key=lambda word: (-merged[word], word))))
            proposals_blind.append(dict(eventId=identifier, group=group, split='calibration', kind=kind, prefix=prefix,
                                         original=original, learned=hits, union=union, rankedUnion=ranked_union))
        ref_sql = "SELECT id, gold, target FROM slates WHERE split='calibration' AND id IN (" + ','.join('?' for _ in ids) + ')'
        refs = {i: (gold, target) for i, gold, target in db.execute(ref_sql, ids)}
        labels = torch.tensor([refs[i][1] if refs[i][1] >= 0 else scores.shape[1] - 1 for i in ids], device=device)
        loss = F.cross_entropy(scores, labels, reduction='none').cpu().tolist()
        joined = evaluate_blind_pools(proposals_blind, [dict(eventId=i, gold=refs[i][0]) for i in ids], vocabulary)
        for kind, lane in joined['lanes'].items():
            proposals[kind].update(lane)
        for identifier, row, scored, nll, pooled, budget in zip(ids, batch.rows, score_rows, loss, proposals_blind, budgets_blind):
            gold, target = refs[identifier]
            candidate_scores = scored[:len(json.loads(row[3]))]
            ordered = sorted(range(len(candidate_scores)), key=lambda index: -candidate_scores[index])
            rank = ordered.index(target) + 1 if target >= 0 else 0
            offer = bool(ordered and candidate_scores[ordered[0]] > scored[-1])
            for kind in ('all', row[0]):
                lane = ranking[kind]
                lane['opportunities'] += 1
                lane['supported'] += int(target >= 0)
                lane['unsupported'] += int(target < 0)
                lane['outside'] += int(not offer)
                lane['correctOutside'] += int(not offer and target < 0)
                lane['falseOutside'] += int(not offer and target >= 0)
                lane['falseOffers'] += int(offer and target < 0)
                lane['candidateTop1'] += int(rank == 1)
                lane['candidateTop3'] += int(0 < rank <= 3)
                lane['offerTop1'] += int(offer and rank == 1)
                lane['offerTop3'] += int(offer and 0 < rank <= 3)
                lane['reciprocalRankSum'] += 1 / rank if rank else 0
                lane['nllSum'] += nll
                same_cap = equal_budget[kind]
                same_cap['opportunities'] += 1
                for source, pool in budget.items():
                    same_cap[f'{source}Words'] += len(pool)
                    for n in (1, 3, 16):
                        same_cap[f'{source}Top{n}'] += int(gold in pool[:n])
            grouped = group_ranks[pooled['group']][row[0]]
            grouped['opportunities'] += 1
            grouped['candidateTop3'] += int(0 < rank <= 3)
            grouped['offerTop3'] += int(offer and 0 < rank <= 3)
            grouped['correctOutside'] += int(not offer and target < 0)
            grouped['countAt16'] += int(gold in budget['count'])
            grouped['learnedAt16'] += int(gold in budget['learned'])
            grouped['interleavedAt16'] += int(gold in budget['interleaved'])
            grouped['rerankedTop3At16'] += int(gold in budget['reranked'][:3])
            grouped['unionAt32'] += int(gold in pooled['union'])
    lanes = {}
    for kind, lane in sorted(ranking.items()):
        lanes[kind] = dict(lane, nll=lane['nllSum'] / lane['opportunities'],
                           supportedMrr=lane['reciprocalRankSum'] / lane['supported'] if lane['supported'] else None)
    return dict(ranking=lanes, proposalsAt32={key: dict(value) for key, value in sorted(proposals.items())},
                equalBudgetAt16={key: dict(value) for key, value in sorted(equal_budget.items())},
                groups={group: {lane: dict(values) for lane, values in sorted(kinds.items())}
                        for group, kinds in sorted(group_ranks.items())})


def train_pair(db, args, out, settings, device, vocabulary, words, frequencies, word_cache):
    fit = db.execute("SELECT count(*) FROM slates WHERE split='fit'").fetchone()[0]
    calibration = db.execute("SELECT count(*) FROM slates WHERE split='calibration'").fetchone()[0]
    lookup = {word: index for index, word in enumerate(words)}
    torch.manual_seed(settings['seed'])
    first = MenuStudent().to(device)
    initial_hash = model_hash(first)
    arms = [first, copy.deepcopy(first)]
    optimizers = [torch.optim.AdamW(model.parameters(), lr=settings['lr']) for model in arms]
    epoch = offset = step = exposure = retrieval_exposure = exposure_tokens = exposure_candidates = 0
    latest = out / 'latest.pt'
    if latest.exists():
        saved = torch.load(latest, map_location='cpu', weights_only=True)
        if (saved['settings'] != settings or saved['initialSha256'] != initial_hash or
                saved['vocabularySha256'] != vocabulary['sha256']):
            raise ValueError('Resume requires the same frozen setup, vocabulary and initial weights')
        for index, (model, optimizer) in enumerate(zip(arms, optimizers)):
            model.load_state_dict(saved['models'][index])
            optimizer.load_state_dict(saved['optimizers'][index])
        epoch, offset, step = saved['epoch'], saved['offset'], saved['step']
        exposure, retrieval_exposure = saved['rows'], saved['retrievalRows']
        exposure_tokens, exposure_candidates = saved['promptTokens'], saved['candidateWords']
        if (exposure != epoch * fit + offset or not 0 <= offset < fit or
                step != epoch * math.ceil(fit / settings['batchSize']) + offset // settings['batchSize'] or
                not 0 <= epoch <= settings['epochs'] or epoch == settings['epochs'] and offset):
            raise ValueError('Saved paired exposure and cursor are inconsistent')

    def save():
        atomic_checkpoint(latest, dict(settings=settings, initialSha256=initial_hash, vocabularySha256=vocabulary['sha256'],
                                      epoch=epoch, offset=offset, step=step, rows=exposure, retrievalRows=retrieval_exposure,
                                      promptTokens=exposure_tokens, candidateWords=exposure_candidates,
                                      models=[model.state_dict() for model in arms], optimizers=[opt.state_dict() for opt in optimizers]))

    while epoch < settings['epochs'] and (args.stop_after_steps is None or step < args.stop_after_steps):
        multiplier, start = window_order(fit, settings['seed'] + epoch)
        size = min(settings['batchSize'], fit - offset)
        ids = [(multiplier * row + start) % fit for row in range(offset, offset + size)]
        batch = load_batch(db, 'fit', ids, device)
        retrieval = retrieval_batch(batch, lookup, frequencies, settings, step) if settings['retrievalWeight'] else None
        for index, (model, optimizer) in enumerate(zip(arms, optimizers)):
            optimizer.zero_grad(set_to_none=True)
            query = model.query(batch.prompt, batch.lengths)
            scores = model.scores(query, batch.words, batch.mask)
            weight = settings['distillWeight'] if index else 0.
            loss = listwise_loss(scores, batch.labels, batch.teacher, batch.mask.any(-1), settings['temperature'], weight)
            if retrieval is not None:
                positions, positives, negatives = retrieval
                auxiliary = sampled_retrieval_loss(query.index_select(0, positions.to(device)), positives, model.embedding, word_cache, negatives)
                loss = loss + settings['retrievalWeight'] * auxiliary * (len(positions) / size)
            if not torch.isfinite(loss):
                raise ValueError('Nonfinite student loss')
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.)
            optimizer.step()
        offset += size
        step += 1
        exposure += size
        exposure_tokens += int(batch.lengths.sum())
        exposure_candidates += sum(len(json.loads(row[3])) for row in batch.rows)
        retrieval_exposure += len(retrieval[0]) if retrieval else 0
        if offset == fit:
            epoch += 1
            offset = 0
        if not offset or step % args.checkpoint_every == 0:
            print(f'Paired optimizer step {step}; fit rows per arm {exposure}', flush=True)
            save()
    save()
    if epoch < settings['epochs']:
        print('Paired training paused at the requested step', flush=True)
        return

    groups = dict(db.execute('SELECT split, count(*) FROM groups GROUP BY split'))
    split_counts = {split: dict(db.execute('SELECT kind, count(*) FROM slates WHERE split=? GROUP BY kind', (split,)))
                    for split in ('fit', 'calibration')}
    result = dict(version=1, status='complete', settings=settings, initialSha256=initial_hash,
                  proposalVocabularySha256=vocabulary['sha256'], parameters=sum(value.numel() for value in first.parameters()),
                  evaluationMode='calibration exact full-word proxy before UI policy, caret, and deadline',
                  proposalVocabularyWords=len(words),
                  groups=groups, splitCounts=split_counts, pairedExposurePerArm=dict(steps=step, examples=exposure,
                  auxiliaryExamples=retrieval_exposure, promptTokens=exposure_tokens, candidateWords=exposure_candidates), arms={})
    for name, model in zip(ARM_NAMES, arms):
        destination = out / (name + '.pt')
        state_hash = model_hash(model)
        atomic_checkpoint(destination, dict(state=model.state_dict(), stateSha256=state_hash, settings=settings, arm=name))
        result['arms'][name] = dict(evaluate(model, db, calibration, device, settings, vocabulary, words, word_cache),
                                    stateSha256=state_hash, checkpointSha256=file_hash(destination))
    atomic_json(out / 'metrics.json', result)


def run(args):
    out = args.out
    out.mkdir(parents=True, exist_ok=True)
    device = torch.device(args.device)
    if device.type not in ('cpu', 'cuda') or device.type == 'cuda' and not torch.cuda.is_available():
        raise ValueError('Select a CPU or available CUDA device')
    checkpoint = torch.load(args.teacher, map_location='cpu', weights_only=False, mmap=True)
    frozen = json.loads(args.tokenizer.read_text())
    tokenizer_hash = file_hash(args.tokenizer)
    tokenizer = Encoder(frozen['merges'])
    teacher_settings = checkpoint['settings']
    cfg = Config(**teacher_settings['config'])
    if (frozen.get('version') != 1 or frozen.get('algorithm') != 'utf8-bpe' or frozen.get('reserved') != RESERVED or
            frozen.get('byteOffset') != BYTE_OFFSET or len(tokenizer.pieces) != VOCABULARY or cfg.vocab != VOCABULARY or
            teacher_settings.get('tokenizerSha256') != tokenizer_hash):
        raise ValueError('The native teacher and trainer require the same frozen 16,384-piece byte-BPE tokenizer')
    try:
        encode = accelerated_encoder(tokenizer)
    except ModuleNotFoundError as error:
        if error.name != 'tokenizers':
            raise
        encode = tokenizer.encode
    teacher_dtype = ('fp16' if device.type == 'cuda' else 'fp32') if args.teacher_dtype == 'auto' else args.teacher_dtype
    if device.type == 'cpu' and teacher_dtype == 'fp16':
        raise ValueError('CPU verification uses FP32 teacher scores')
    modules = ('distill_menu.py', 'student_proposals.py', 'neural.py', 'subwords.py', 'train.py', 'corpus.py')
    settings = dict(version=1, dataSha256=file_hash(args.data), tokenizerSha256=tokenizer_hash,
                    teacherSha256=file_hash(args.teacher), teacherConfig=asdict(cfg), teacherDtype=teacher_dtype,
                    device=device.type, torchVersion=str(torch.__version__), teacherRows=args.teacher_rows,
                    teacherBatchSize=args.teacher_batch_size, teacherLogitChunk=args.teacher_logit_chunk,
                    studentContext=args.student_context, epochs=args.epochs, batchSize=args.batch_size, lr=args.lr,
                    seed=args.seed, temperature=args.temperature, distillWeight=args.distill_weight,
                    retrievalWeight=args.retrieval_weight, retrievalNegatives=args.retrieval_negatives,
                    proposalVocab=args.proposal_vocab, proposalMinCount=args.proposal_min_count,
                    loss=dict(direct='listwise cross entropy over natural words and outside',
                              distilled='(1-weight) * cross entropy + weight * temperature^2 * KL on the conditional natural slate when it has two or more words; full cross entropy otherwise',
                              both='same sampled full-word retrieval cross entropy, weighted by covered examples in the batch',
                              teacher='whole-word frozen BPE path from stable left prompt, plus terminal boundary probability; fitting slates only'),
                    code={name: file_hash(Path(__file__).with_name(name)) for name in modules})
    run_path = out / 'run.json'
    cache = out / 'teacher-scores.sqlite3'
    if args.resume:
        if not run_path.is_file() or json.loads(run_path.read_text()) != settings:
            raise ValueError('Resume requires identical inputs, code and experiment settings')
    elif any(path.exists() for path in (run_path, cache, out / 'latest.pt', out / 'metrics.json')):
        raise ValueError('Output has a prior run. Choose an empty directory or --resume')
    else:
        atomic_json(run_path, settings)
    signature = file_hash(run_path)
    if not cache.exists():
        if (out / 'latest.pt').exists():
            raise ValueError('A paired checkpoint requires its frozen training data and teacher-score cache')
        build_cache(cache, signature, args.data, SimpleNamespace(encode=encode), settings)
    with sqlite3.connect(cache) as db:
        if db.execute('SELECT signature FROM manifest').fetchone() != (signature,):
            raise ValueError('Teacher-score cache belongs to another run')
        fill_teacher(db, checkpoint, settings, tokenizer, device)
        del checkpoint
        vocab, words, counts, word_cache = vocabulary_for(db, out, SimpleNamespace(encode=encode), settings)
        train_pair(db, args, out, settings, device, vocab, words, counts, word_cache)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for name in ('data', 'tokenizer', 'teacher', 'out'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--device', required=True, help='cpu or one CUDA device, for example cuda:0')
    parser.add_argument('--resume', action='store_true', help='Continue an identical run previously saved in --out')
    parser.add_argument('--stop-after-steps', type=int, help='Pause at this absolute paired optimizer step')
    parser.add_argument('--epochs', type=int, default=3)
    parser.add_argument('--batch-size', type=int, default=64)
    parser.add_argument('--lr', type=float, default=.001)
    parser.add_argument('--seed', type=int, default=253)
    parser.add_argument('--student-context', type=int, default=192)
    parser.add_argument('--temperature', type=float, default=2.)
    parser.add_argument('--distill-weight', type=float, default=.35)
    parser.add_argument('--retrieval-weight', type=float, default=.2)
    parser.add_argument('--retrieval-negatives', type=int, default=64)
    parser.add_argument('--proposal-vocab', type=int, default=8192)
    parser.add_argument('--proposal-min-count', type=int, default=1)
    parser.add_argument('--teacher-rows', type=int, default=64)
    parser.add_argument('--teacher-batch-size', type=int, default=32)
    parser.add_argument('--teacher-logit-chunk', type=int, default=128)
    parser.add_argument('--teacher-dtype', choices=('auto', 'fp16', 'fp32'), default='auto')
    parser.add_argument('--checkpoint-every', type=int, default=200)
    args = parser.parse_args()
    if (not 8 <= args.student_context <= 512 or not 1 <= args.batch_size <= 256 or
            not 1 <= args.teacher_rows <= 128 or not 1 <= args.teacher_batch_size <= 64 or
            not 1 <= args.teacher_logit_chunk <= 512 or args.epochs < 1 or not 0 <= args.seed <= 2**32 - 1 or
            not 2 <= args.proposal_vocab <= 8192 or not 1 <= args.retrieval_negatives <= 128 or args.proposal_min_count < 1 or
            args.checkpoint_every < 1 or args.stop_after_steps is not None and args.stop_after_steps < 0 or
            not 0 < args.distill_weight < 1 or not 0 < args.retrieval_weight <= 1 or
            not math.isfinite(args.temperature) or args.temperature <= 0 or not math.isfinite(args.lr) or args.lr <= 0):
        parser.error('Invalid training, retrieval or chunk limits')
    run(args)


if __name__ == '__main__':
    main()
