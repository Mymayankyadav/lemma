"""Bounded, resumable causal training with a deterministic cursor and grouped validation."""
import argparse
from contextlib import nullcontext
from dataclasses import asdict
import json
import math
import os
from pathlib import Path
import random
import time

import numpy as np
import torch
from torch import distributed as dist
from torch.nn import functional as F
from torch.utils.checkpoint import checkpoint

from corpus import file_hash
from neural import CANDIDATES, Decoder
from subwords import verify_prepared


class Stream:
    def __init__(self, path, split, context, strides=None):
        self.context = context
        self.stride = strides or context
        self.stream = np.memmap(path / f'{split}.tokens', dtype='<u2', mode='r')
        index = path / f'{split}.index'
        width = 3 if split.startswith('adapt-') else 2
        self.docs = np.memmap(index, dtype='<u8', mode='r').reshape(-1, width)
        self.ends = np.cumsum((self.docs[:, 1] + self.stride - 2) // self.stride)
        if not self.ends.size or not self.ends[-1]:
            raise ValueError(f'No eligible documents in {split}')

    def __len__(self):
        return int(self.ends[-1])

    def batch(self, indexes, device):
        indexes = list(indexes)
        ids = np.zeros((len(indexes), self.context), dtype='int64')
        gold = np.full_like(ids, -100)
        for row, index in enumerate(indexes):
            index %= len(self)
            doc_id = np.searchsorted(self.ends, index, side='right')
            start, length = map(int, self.docs[doc_id, :2])
            offset = (index - (int(self.ends[doc_id - 1]) if doc_id else 0)) * self.stride
            # When scoring once per rolling position, include as much preceding context as fits.
            last = min(offset + self.stride, length - 1)
            first = max(0, last - self.context)
            token = self.stream[start + first:start + last + 1]
            ids[row, :len(token) - 1] = token[:-1]
            begin = max(0, offset - first)
            if self.docs.shape[1] == 3:
                begin = max(begin, int(self.docs[doc_id, 2]) - first - 1)
            gold[row, begin:len(token) - 1] = token[begin + 1:]
        return torch.from_numpy(ids).to(device), torch.from_numpy(gold).to(device)


def window_order(length, seed):
    """A seeded, constant-memory permutation, traversing every document window once."""
    if length <= 1:
        return 1, 0
    gen = random.Random(seed)
    multiplier = gen.randrange(1, length)
    while math.gcd(multiplier, length) != 1:
        multiplier = gen.randrange(1, length)
    return multiplier, gen.randrange(length)


class Objective(torch.nn.Module):
    def __init__(self, decoder, chunk):
        super().__init__()
        self.decoder = decoder
        self.chunk = chunk

    def forward(self, ids, gold):
        hidden, _ = self.decoder.hidden(ids)
        flat = hidden.flatten(0, 1)
        targets = gold.flatten()
        # Non-reentrant activation checkpointing recomputes vocabulary projections on backward.
        def loss(x, y):
            return F.cross_entropy(self.decoder.logits(x).float(), y, reduction='sum')
        return sum(checkpoint(loss, x, y, use_reentrant=False) if self.training else loss(x, y)
                   for x, y in zip(flat.split(self.chunk), targets.split(self.chunk)))


@torch.no_grad()
def validate(objective, data, device, count, batch):
    objective.eval()
    nll, tokens = 0.0, 0
    # Evenly spaced validation windows, without replacement.
    indices = np.linspace(0, len(data) - 1, min(count, len(data)), dtype=np.int64)
    for start in range(0, len(indices), batch):
        ids, gold = data.batch(indices[start:start + batch], device)
        nll += float(objective(ids, gold))
        tokens += int(gold.ne(-100).sum())
    objective.train()
    if not tokens:
        raise ValueError('No validation targets')
    return {'nll': nll / tokens, 'perplexity': math.exp(nll / tokens), 'targets': tokens}


def atomic_save(state, path):
    temp = path.with_suffix('.part')
    torch.save(state, temp)
    temp.replace(path)


def run(args):
    start = time.monotonic()
    ranks = int(os.environ.get('WORLD_SIZE', '1'))
    rank = int(os.environ.get('RANK', '0'))
    local_rank = int(os.environ.get('LOCAL_RANK', '0'))
    gpu = torch.cuda.is_available()
    if not gpu and not args.allow_cpu:
        raise RuntimeError('The run requires a GPU')
    device = torch.device('cuda', local_rank) if gpu else torch.device('cpu')
    if gpu:
        torch.cuda.set_device(device)
    if ranks > 1:
        dist.init_process_group(backend='nccl' if gpu else 'gloo')
    torch.manual_seed(args.seed)
    np.random.seed(args.seed + rank)
    random.seed(args.seed + rank)
    cfg = CANDIDATES[args.candidate]
    if not 1 <= args.sequence_length <= cfg.context:
        raise ValueError('Invalid training sequence length')
    if args.adapt and args.sequence_length != cfg.context:
        raise ValueError('Adaptation requires the full frozen role context')
    prefix = f'adapt-{cfg.context}-' if args.adapt else ''
    splits = (prefix + 'train', prefix + 'validation')
    identity = [verify_prepared(args.data, splits) if rank == 0 else None]
    if ranks > 1:
        dist.broadcast_object_list(identity, src=0)
    data_hash, tokenizer_hash = identity[0]
    data = Stream(args.data, prefix + 'train', args.sequence_length)
    held = Stream(args.data, prefix + 'validation', args.sequence_length)
    stride, initial = window_order(len(data), args.seed)
    def train_indexes(start, count):
        return ((stride * i + initial) % len(data) for i in range(start, start + count))
    decoder = Decoder(cfg).to(device)
    torch.manual_seed(args.seed + rank)
    objective = Objective(decoder, args.logit_chunk).to(device)
    distributed = torch.nn.parallel.DistributedDataParallel(
        objective, device_ids=[local_rank] if gpu else None, broadcast_buffers=False,
    ) if ranks > 1 else objective
    opt = torch.optim.AdamW(decoder.parameters(), lr=args.lr, betas=(.9, .95), weight_decay=.1,
                            fused=gpu)
    scaler = torch.amp.GradScaler('cuda', enabled=gpu)
    settings = {'config': asdict(cfg), 'seed': args.seed, 'lr': args.lr, 'adapt': args.adapt,
                'sequenceLength': args.sequence_length, 'microbatch': args.microbatch,
                'accumulate': args.accumulate, 'ranks': ranks, 'scheduleTokens': args.schedule_tokens,
                'dataSha256': data_hash, 'tokenizerSha256': tokenizer_hash, 'logitChunk': args.logit_chunk,
                'sampling': 'affine-window-v1'}
    step = tokens = cursor = 0
    best = float('inf')
    args.out.mkdir(exist_ok=True, parents=True)
    latest = args.out / 'latest.pt'
    if args.resume:
        saved = torch.load(args.resume, map_location='cpu', weights_only=False)
        if settings != saved['settings']:
            raise ValueError('Resume requires identical data, architecture and optimizer schedule')
        decoder.load_state_dict(saved['model'])
        opt.load_state_dict(saved['optimizer'])
        scaler.load_state_dict(saved['scaler'])
        rng = saved['rankRng'][rank]
        torch.random.set_rng_state(rng['torch'])
        np.random.set_state(rng['numpy'])
        random.setstate(rng['python'])
        if gpu:
            torch.cuda.set_rng_state(rng['cuda'], device)
        step, tokens, cursor, best = (saved[k] for k in ('step', 'tokens', 'cursor', 'best'))
    elif args.initialize:
        saved = torch.load(args.initialize, map_location='cpu', weights_only=False)
        if saved['settings']['config'] != settings['config'] or saved['settings']['tokenizerSha256'] != tokenizer_hash:
            raise ValueError('Initialization checkpoint architecture or frozen tokenizer differs')
        decoder.load_state_dict(saved['model'])
    if rank == 0:
        print(json.dumps({'settings': settings, 'parameters': sum(p.numel() for p in decoder.parameters()),
                          'device': torch.cuda.get_device_name(device) if gpu else 'cpu',
                          'windows': len(data), 'resumedTokens': tokens}), flush=True)
    first_token = tokens
    checkpoints = sorted(set(args.checkpoints + [args.stop_tokens]))
    metrics = None
    while tokens < args.stop_tokens:
        before = tokens
        warmup = min(1, (step + 1) / 100)
        cosine = .1 + .9 * .5 * (1 + math.cos(math.pi * min(1, tokens / args.schedule_tokens)))
        for group in opt.param_groups:
            group['lr'] = args.lr * warmup * cosine
        opt.zero_grad(set_to_none=True)
        batches = []
        count = torch.zeros((), device=device, dtype=torch.long)
        for _ in range(args.accumulate):
            begin = cursor + rank * args.microbatch
            ids, gold = data.batch(train_indexes(begin, args.microbatch), device)
            cursor += args.microbatch * ranks
            count += gold.ne(-100).sum()
            batches.append((ids, gold))
        if ranks > 1:
            dist.all_reduce(count)
        added = int(count)
        if not added:
            continue
        loss_total = torch.zeros((), device=device)
        for i, (ids, gold) in enumerate(batches):
            sync = distributed.no_sync() if ranks > 1 and i < len(batches) - 1 else nullcontext()
            with sync:
                with torch.autocast(device_type=device.type, dtype=torch.float16, enabled=gpu):
                    loss = distributed(ids, gold) * (ranks / added)
                scaler.scale(loss).backward()
            loss_total += loss.detach()
        scaler.unscale_(opt)
        torch.nn.utils.clip_grad_norm_(decoder.parameters(), 1)
        scaler.step(opt)
        scaler.update()
        tokens += added
        step += 1
        elapsed = time.monotonic() - start
        stop = tokens >= args.stop_tokens or elapsed >= args.max_minutes * 60
        if ranks > 1:
            status = torch.tensor([int(stop)], device=device)
            dist.all_reduce(status, op=dist.ReduceOp.MAX)
            stop = bool(int(status))
        milestone = [target for target in checkpoints if before < target <= tokens]
        save = stop or bool(milestone) or step % args.checkpoint_steps == 0
        if rank == 0 and (step == 1 or step % args.log_steps == 0 or save):
            print(json.dumps({'step': step, 'tokens': tokens, 'trainLoss': float(loss_total),
                              'tokensPerSecond': (tokens - first_token) / max(elapsed, .01),
                              'elapsedSeconds': elapsed}), flush=True)
        rank_rng = None
        if save:
            rng = {'torch': torch.random.get_rng_state(), 'numpy': np.random.get_state(), 'python': random.getstate(),
                   'cuda': torch.cuda.get_rng_state(device) if gpu else None}
            rank_rng = [None] * ranks
            if ranks > 1:
                dist.all_gather_object(rank_rng, rng)
            else:
                rank_rng[0] = rng
        if save and rank == 0:
            metrics = validate(objective, held, device, args.validation_windows, args.microbatch)
            improved = metrics['nll'] < best
            best = min(best, metrics['nll'])
            metrics.update(step=step, tokens=tokens, elapsedSeconds=elapsed,
                           runTokens=tokens - first_token, allocatedGpuHours=elapsed * ranks / 3600 if gpu else 0,
                           peakMemoryBytes=torch.cuda.max_memory_allocated(device) if gpu else 0)
            state = {'settings': settings, 'model': decoder.state_dict(), 'optimizer': opt.state_dict(),
                     'scaler': scaler.state_dict(), 'rankRng': rank_rng,
                     'step': step, 'cursor': cursor, 'tokens': tokens, 'best': best}
            atomic_save(state, latest)
            if improved:
                atomic_save({'settings': settings, 'model': state['model'], 'metrics': metrics}, args.out / 'best.pt')
            for target in milestone:
                atomic_save(state, args.out / f'tokens-{target}.pt')
            metrics['checkpointSha256'] = file_hash(latest)
            metrics['elapsedWithCheckpointSeconds'] = time.monotonic() - start
            (args.out / 'metrics.json').write_text(json.dumps(metrics, indent=2) + '\n')
            print('VALIDATION', json.dumps(metrics), flush=True)
        if ranks > 1 and save:
            dist.barrier()
        if stop:
            break
    if ranks > 1:
        dist.destroy_process_group()
    return metrics


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--candidate', choices=CANDIDATES, required=True)
    parser.add_argument('--sequence-length', type=int, default=512)
    parser.add_argument('--max-minutes', type=float, required=True)
    parser.add_argument('--stop-tokens', type=int, required=True)
    parser.add_argument('--schedule-tokens', type=int, default=1_000_000_000)
    parser.add_argument('--checkpoints', type=int, nargs='*', default=[100_000_000, 500_000_000, 1_000_000_000])
    parser.add_argument('--checkpoint-steps', type=int, default=1000)
    parser.add_argument('--log-steps', type=int, default=20)
    parser.add_argument('--validation-windows', type=int, default=64)
    parser.add_argument('--microbatch', type=int, default=4)
    parser.add_argument('--accumulate', type=int, default=8)
    parser.add_argument('--logit-chunk', type=int, default=1024)
    parser.add_argument('--lr', type=float, default=.0004)
    parser.add_argument('--seed', type=int, default=7)
    parser.add_argument('--resume', type=Path)
    parser.add_argument('--initialize', type=Path)
    parser.add_argument('--adapt', action='store_true')
    parser.add_argument('--allow-cpu', action='store_true')
    args = parser.parse_args()
    if min(args.microbatch, args.accumulate, args.validation_windows, args.max_minutes,
           args.stop_tokens, args.schedule_tokens, args.checkpoint_steps, args.log_steps, args.logit_chunk) <= 0:
        parser.error('Training budgets and dimensions must be positive')
    if args.resume and args.initialize:
        parser.error('Resume and initialize are mutually exclusive')
    run(args)


if __name__ == '__main__':
    main()
