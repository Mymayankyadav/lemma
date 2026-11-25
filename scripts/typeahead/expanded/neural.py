"""Decoder-only candidates with tied embeddings and explicit attention-cache state."""
from dataclasses import dataclass

import torch
from torch import nn
from torch.nn import functional as F


@dataclass(frozen=True)
class Config:
    width: int
    layers: int
    heads: int
    context: int
    vocab: int = 16384


CANDIDATES = {
    'reference': Config(192, 4, 3, 48),
    'capacity-reference': Config(192, 4, 3, 512),
    'primary': Config(512, 8, 8, 512),
    'larger': Config(640, 12, 10, 1024),
}


class Block(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.heads = cfg.heads
        self.head_width = cfg.width // cfg.heads
        self.pre_attention = nn.LayerNorm(cfg.width)
        self.qkv = nn.Linear(cfg.width, 3 * cfg.width)
        self.project = nn.Linear(cfg.width, cfg.width)
        self.pre_mlp = nn.LayerNorm(cfg.width)
        self.up = nn.Linear(cfg.width, 4 * cfg.width)
        self.down = nn.Linear(4 * cfg.width, cfg.width)

    def forward(self, hidden, past=None, graph=False):
        batch, length, width = hidden.shape
        query, key, value = self.qkv(self.pre_attention(hidden)).reshape(
            batch, length, 3, self.heads, self.head_width,
        ).permute(2, 0, 3, 1, 4).unbind(0)
        past_length = 0
        if past is not None:
            past_length = past[0].shape[2]
            key = torch.cat((past[0], key), dim=2)
            value = torch.cat((past[1], value), dim=2)
        if graph:
            queries = torch.arange(length, device=hidden.device) + past_length
            keys = torch.arange(key.shape[2], device=hidden.device)
            allowed = queries[:, None] >= keys[None, :]
            scores = (query @ key.transpose(-1, -2)) * self.head_width ** -0.5
            attention = torch.softmax(scores.masked_fill(~allowed, -torch.inf), dim=-1) @ value
        elif past is None:
            attention = F.scaled_dot_product_attention(query, key, value, is_causal=True)
        else:
            queries = torch.arange(length, device=hidden.device) + past_length
            keys = torch.arange(key.shape[2], device=hidden.device)
            attention = F.scaled_dot_product_attention(query, key, value, attn_mask=queries[:, None] >= keys)
        hidden = hidden + self.project(attention.transpose(1, 2).reshape(batch, length, width))
        return hidden + self.down(F.gelu(self.up(self.pre_mlp(hidden)))), (key, value)


class Decoder(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.cfg = cfg
        self.tok = nn.Embedding(cfg.vocab, cfg.width)
        self.pos = nn.Embedding(cfg.context, cfg.width)
        self.blocks = nn.ModuleList(Block(cfg) for _ in range(cfg.layers))
        self.norm = nn.LayerNorm(cfg.width)
        self.apply(self.initialize)

    @staticmethod
    def initialize(layer):
        if isinstance(layer, (nn.Embedding, nn.Linear)):
            nn.init.normal_(layer.weight, std=.02)
            if isinstance(layer, nn.Linear) and layer.bias is not None:
                nn.init.zeros_(layer.bias)

    def hidden(self, ids, cache=None, graph=False):
        offset = cache[0][0].shape[2] if cache else 0
        position = torch.arange(ids.shape[1], device=ids.device) + offset
        hidden = self.tok(ids) + self.pos(position)
        updated = []
        for index, block in enumerate(self.blocks):
            hidden, state = block(hidden, cache[index] if cache else None, graph)
            updated.append(state)
        return self.norm(hidden), tuple(updated)

    def logits(self, hidden):
        return F.linear(hidden, self.tok.weight)

    def forward(self, ids):
        return self.logits(self.hidden(ids)[0])

    def next(self, ids, cache=None, graph=False):
        hidden, updated = self.hidden(ids, cache, graph)
        return self.logits(hidden[:, -1]), updated
