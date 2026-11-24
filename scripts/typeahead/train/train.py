#!/usr/bin/env python3
"""N236 · GPU step: train the small word-level transformer (about 7.6 M parameters) on prepare.py's streams.

    python3 scripts/typeahead/train/train.py --data work/data --out work/model --max-minutes 30

Decoder-only, 4 layers, width 192, 3 heads, learned positions, tied embeddings, context 48 words. About 3.6e14 FLOP per epoch of
9 M tokens, so an epoch takes well under a minute on a T4. --max-minutes is a hard wall-clock cap: training stops, evaluates and
saves whatever it has. Reports held-out perplexity the way ngram-v1's manifest does (sentence by sentence, <m> and <num> targets
skipped, </s> included) so the two are comparable; the n-gram's is in public/models/typeahead/ngram-v1/manifest.json (101.33).
"""
import argparse, json, math, os, time
import numpy as np
import torch, torch.nn as nn, torch.nn.functional as F

CTX = 48

class Block(nn.Module):
    def __init__(self, d, heads):
        super().__init__()
        self.heads = heads
        self.ln1, self.ln2 = nn.LayerNorm(d), nn.LayerNorm(d)
        self.qkv, self.proj = nn.Linear(d, 3 * d), nn.Linear(d, d)
        self.up, self.down = nn.Linear(d, 4 * d), nn.Linear(4 * d, d)
    def forward(self, x):
        b, t, d = x.shape
        q, k, v = self.qkv(self.ln1(x)).view(b, t, 3, self.heads, d // self.heads).permute(2, 0, 3, 1, 4)
        x = x + self.proj(F.scaled_dot_product_attention(q, k, v, is_causal=True).transpose(1, 2).reshape(b, t, d))
        return x + self.down(F.gelu(self.up(self.ln2(x))))

class LM(nn.Module):
    def __init__(self, vocab, d=192, layers=4, heads=3):
        super().__init__()
        self.tok, self.pos = nn.Embedding(vocab, d), nn.Embedding(CTX, d)
        self.blocks = nn.ModuleList(Block(d, heads) for _ in range(layers))
        self.ln = nn.LayerNorm(d)
    def hidden(self, ids):
        x = self.tok(ids) + self.pos(torch.arange(ids.shape[1], device=ids.device))
        for block in self.blocks:
            x = block(x)
        return self.ln(x)
    def forward(self, ids):
        return self.hidden(ids) @ self.tok.weight.T   # tied output embedding

def held_perplexity(model, flat, offsets, device, limit=20000):
    """Sentence-reset perplexity, as ngram-v1's manifest reports it: input <s> + words, targets words + </s>, skipping <m> and <num>."""
    model.eval()
    total, n = 0.0, 0
    sents = [flat[offsets[i]:offsets[i + 1]][:CTX - 1].astype(np.int64) for i in range(min(limit, len(offsets) - 1))]
    order = sorted(range(len(sents)), key=lambda i: len(sents[i]))
    with torch.no_grad():
        for start in range(0, len(order), 256):
            batch = [sents[i] for i in order[start:start + 256]]
            width = max(len(s) for s in batch) + 1
            x = np.zeros((len(batch), width), dtype=np.int64); y = np.full((len(batch), width), -1, dtype=np.int64)
            for r, s in enumerate(batch):
                x[r, 0] = 0; x[r, 1:len(s) + 1] = s          # <s> then the words
                y[r, :len(s)] = s; y[r, len(s)] = 4          # the words then </s>
            x, y = torch.from_numpy(x).to(device), torch.from_numpy(y).to(device)
            with torch.autocast(device_type=device, dtype=torch.float16, enabled=device == 'cuda'):
                logits = model(x)
            logp = F.log_softmax(logits.float(), -1).gather(-1, y.clamp(min=0).unsqueeze(-1)).squeeze(-1)
            keep = (y >= 0) & (y != 1) & (y != 2)
            total += float(-(logp * keep).sum()); n += int(keep.sum())
    model.train()
    return math.exp(total / n)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True); ap.add_argument('--out', default='work/model')
    ap.add_argument('--epochs', type=int, default=14); ap.add_argument('--max-minutes', type=float, default=30)
    ap.add_argument('--batch', type=int, default=256); ap.add_argument('--lr', type=float, default=2e-3)
    ap.add_argument('--seed', type=int, default=7)
    a = ap.parse_args()
    torch.manual_seed(a.seed); np.random.seed(a.seed)
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    train = np.load(os.path.join(a.data, 'train.npy')).astype(np.int64)
    flat, offsets = np.load(os.path.join(a.data, 'held_flat.npy')), np.load(os.path.join(a.data, 'held_offsets.npy'))
    vocab = len(json.load(open(os.path.join(a.data, 'vocab.json'))))
    model = LM(vocab).to(device)
    params = sum(p.numel() for p in model.parameters())
    steps_per_epoch = len(train) // (a.batch * CTX)
    total = a.epochs * steps_per_epoch
    decay, no_decay = [p for p in model.parameters() if p.dim() > 1], [p for p in model.parameters() if p.dim() <= 1]
    opt = torch.optim.AdamW([{'params': decay, 'weight_decay': .1}, {'params': no_decay, 'weight_decay': 0}], lr=a.lr, betas=(.9, .95))
    scaler = torch.amp.GradScaler(enabled=device == 'cuda')
    t0, step, best = time.time(), 0, float('inf')
    os.makedirs(a.out, exist_ok=True)
    print(f'{device}: {params / 1e6:.1f} M parameters, {len(train)} tokens, {steps_per_epoch} steps an epoch', flush=True)
    log = []
    stop = False
    for epoch in range(a.epochs):
        for _ in range(steps_per_epoch):
            lr = a.lr * min(1, (step + 1) / 300) * (.1 + .9 * .5 * (1 + math.cos(math.pi * step / total)))
            for g in opt.param_groups: g['lr'] = lr
            starts = np.random.randint(0, len(train) - CTX - 1, a.batch)
            x = torch.from_numpy(np.stack([train[s:s + CTX] for s in starts])).to(device)
            y = torch.from_numpy(np.stack([train[s + 1:s + CTX + 1] for s in starts])).to(device)
            with torch.autocast(device_type=device, dtype=torch.float16, enabled=device == 'cuda'):
                loss = F.cross_entropy(model(x).float().view(-1, vocab), y.view(-1))
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward(); scaler.unscale_(opt)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(opt); scaler.update(); step += 1
            if (time.time() - t0) / 60 > a.max_minutes: stop = True; break
        ppl = held_perplexity(model, flat, offsets, device)
        log.append({'epoch': epoch + 1, 'step': step, 'trainLoss': float(loss), 'heldPerplexity': ppl, 'minutes': (time.time() - t0) / 60})
        print(json.dumps(log[-1]), flush=True)
        if ppl < best:
            best = ppl; torch.save({'model': model.state_dict(), 'vocab': vocab, 'ctx': CTX}, os.path.join(a.out, 'best.pt'))
        if stop: break
    json.dump({'parameters': params, 'bestHeldPerplexity': best, 'ngramHeldPerplexity': 101.33, 'log': log,
               'gpuMinutes': (time.time() - t0) / 60, 'device': device}, open(os.path.join(a.out, 'metrics.json'), 'w'), indent=2)

if __name__ == '__main__':
    main()
