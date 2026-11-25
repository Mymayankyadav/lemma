#!/usr/bin/env python3
"""N236 · CPU step: turn proof-pile's Math StackExchange text into token-id streams for the neural model.

    python3 scripts/typeahead/train/prepare.py --input proofpile_dev.jsonl.gz --out work/data

Uses build-ngram.py's tokenizer, vocabulary rule and held-out split, so the neural model shares ngram-v1's vocabulary exactly
(ids 0-4 are <s> <m> <num> <unk> </s>) and its held-out sentences, which makes perplexities comparable with the n-gram's.
Writes uint16 arrays: train.npy (documents back to back: <s> sentence </s> sentence </s> ...), held_flat.npy + held_offsets.npy
(held-out sentences, one per offset pair) and vocab.json.
"""
import argparse, gzip, importlib.util, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import kn_build as kb
spec = importlib.util.spec_from_file_location('build_ngram', os.path.join(HERE, '..', 'build-ngram.py'))
bn = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bn)

ap = argparse.ArgumentParser()
ap.add_argument('--input', required=True)
ap.add_argument('--out', default='work/data')
ap.add_argument('--vocab', type=int, default=30000)
args = ap.parse_args()

train_docs, held_docs = [], []
with gzip.open(args.input, 'rt', encoding='utf8') as f:
    for line in f:
        d = json.loads(line)
        meta = d.get('meta')
        try:
            meta = json.loads(meta) if isinstance(meta, str) else meta
        except ValueError:
            meta = {}
        if (meta or {}).get('set_name') != 'stack_exchange':
            continue
        sents = list(bn.sentences(d['text']))
        if sents:
            (held_docs if kb.is_held_out(d['text']) else train_docs).append(sents)
flat_train = [s for doc in train_docs for s in doc]
vocab = kb.build_vocab(flat_train, args.vocab)
index = {w: i for i, w in enumerate(vocab)}
ids = lambda s: [index.get(w, kb.UNK) for w in s]

stream = []
for doc in train_docs:
    stream.append(kb.BOS)
    for s in doc:
        stream.extend(ids(s)); stream.append(kb.EOS)
held = [ids(s) for doc in held_docs for s in doc]
os.makedirs(args.out, exist_ok=True)
np.save(os.path.join(args.out, 'train.npy'), np.array(stream, dtype=np.uint16))
offsets = np.cumsum([0] + [len(s) for s in held]).astype(np.int64)
np.save(os.path.join(args.out, 'held_flat.npy'), np.array([t for s in held for t in s], dtype=np.uint16))
np.save(os.path.join(args.out, 'held_offsets.npy'), offsets)
json.dump(vocab, open(os.path.join(args.out, 'vocab.json'), 'w'))
print(json.dumps({'vocab': len(vocab), 'trainTokens': len(stream), 'trainDocs': len(train_docs), 'heldSentences': len(held)}))
