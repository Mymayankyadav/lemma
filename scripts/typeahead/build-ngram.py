#!/usr/bin/env python3
"""N233 · build public/models/typeahead/ngram-v1 (the maths-prose Kneser-Ney trigram) on one CPU core, in about two minutes.

    python3 scripts/typeahead/build-ngram.py --input proofpile_dev.jsonl.gz [--out public/models/typeahead/ngram-v1]

Input: the development split of hoskinson-center/proof-pile (https://huggingface.co/datasets/hoskinson-center/proof-pile,
file dev/proofpile_dev.jsonl.gz, 161,818,020 bytes). Only its Math StackExchange documents are used (the register closest
to a learner's written answer). Documents whose CRC-32 falls in a fixed 5% are held out and give the reported perplexity.

Tokens (kept in step with tokenize() in src/features/tutor/writingAid/decoder/kn.ts):
  lower-cased words; digits -> <num>; a maths span ($..$, $$..$$, \\(..\\), \\[..\\]) and any single letter except "a" and
  "i" -> <m> (learners type variables as bare letters); words outside the 30,000-word vocabulary -> <unk>.
"""
import argparse, gzip, hashlib, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kn_build as kb

MATH = re.compile(r'\$\$.*?\$\$|\$[^$]*\$|\\\[.*?\\\]|\\\(.*?\\\)', re.S)
TAGS = re.compile(r'<[^>]+>|https?://\S+')
SENT = re.compile(r'(?<=[.!?])\s+|\n{2,}')
TOK = re.compile(r"zzmathzz|[a-z]+(?:'[a-z]+)?|\d+")


def sentences(text):
    text = MATH.sub(' zzmathzz ', text)
    text = TAGS.sub(' ', text).lower()
    for part in SENT.split(text):
        tokens = []
        for t in TOK.findall(part):
            if t == 'zzmathzz' or (len(t) == 1 and t.isalpha() and t not in ('a', 'i')):
                tokens.append('<m>')
            elif t[0].isdigit():
                tokens.append('<num>')
            else:
                tokens.append(t)
        if len(tokens) >= 4:
            yield tokens


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', required=True)
    ap.add_argument('--out', default='public/models/typeahead/ngram-v1')
    ap.add_argument('--limit', type=int, default=5_500_000, help='maximum size in bytes')
    args = ap.parse_args()
    digest = hashlib.sha256()
    train, held = [], []
    with open(args.input, 'rb') as raw:
        for chunk in iter(lambda: raw.read(1 << 20), b''):
            digest.update(chunk)
    source_hash = digest.hexdigest()
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
            (held if kb.is_held_out(d['text']) else train).extend(sentences(d['text']))
    print(f'sentences: train {len(train)}, held out {len(held)}')
    vocab, data, meta = kb.build(train, held, 30000, args.limit)
    sources = [{'id': 'proof-pile-dev', 'file': 'dev/proofpile_dev.jsonl.gz', 'sha256': source_hash,
                'url': 'https://huggingface.co/datasets/hoskinson-center/proof-pile',
                'license': 'dataset card: Apache-2.0; its Math StackExchange text is CC BY-SA (see ATTRIBUTION.md)'}]
    manifest = kb.write_asset(args.out, 'ngram-v1', data, meta, sources,
                              'python3 scripts/typeahead/build-ngram.py --input proofpile_dev.jsonl.gz')
    print(json.dumps(manifest['file']), json.dumps({k: meta[k] for k in ('vocabulary', 'heldOutPerplexity', 'trigrams', 'bigrams')}))


if __name__ == '__main__':
    main()
