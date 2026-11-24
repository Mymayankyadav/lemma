#!/usr/bin/env python3
"""N235 · build public/models/typeahead/latex-v1: a Kneser-Ney trigram over LaTeX tokens, for the strip inside $...$.

    python3 scripts/typeahead/build-latex.py --input proofpile_dev.jsonl.gz [--out public/models/typeahead/latex-v1]

Same input and held-out split as build-ngram.py. Each inline or display maths span of the Math StackExchange documents is one
sentence of tokens (kept in step with latexTokens() in src/features/tutor/writingAid/latexGrammar.ts):
  \\commands whole (\\frac, \\in, \\mathbb), an escaped character (\\{), a single letter -> <latin> (identifiers are filled in
  later from the learner's own variables, never invented by the model), digit runs -> <num>, any other character as is.
"""
import argparse, gzip, hashlib, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kn_build as kb

SPAN = re.compile(r'\$\$(.+?)\$\$|\$([^$\n]+?)\$', re.S)
TOKEN = re.compile(r'\\[A-Za-z]+|\\.|[A-Za-z]|\d+|\S')


def spans(text):
    for m in SPAN.finditer(text):
        body = (m.group(1) or m.group(2) or '').strip()
        if not 3 <= len(body) <= 200:
            continue
        tokens = []
        for t in TOKEN.findall(body):
            if len(t) == 1 and t.isalpha():
                tokens.append('<latin>')
            elif t.isdigit():
                tokens.append('<num>')
            else:
                tokens.append(t)
        if len(tokens) >= 3:
            yield tokens


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', required=True)
    ap.add_argument('--out', default='public/models/typeahead/latex-v1')
    ap.add_argument('--limit', type=int, default=1_200_000)
    args = ap.parse_args()
    digest = hashlib.sha256()
    with open(args.input, 'rb') as raw:
        for chunk in iter(lambda: raw.read(1 << 20), b''):
            digest.update(chunk)
    train, held = [], []
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
            (held if kb.is_held_out(d['text']) else train).extend(spans(d['text']))
    print(f'spans: train {len(train)}, held out {len(held)}')
    vocab, data, meta = kb.build(train, held, 1500, args.limit)
    sources = [{'id': 'proof-pile-dev', 'file': 'dev/proofpile_dev.jsonl.gz', 'sha256': digest.hexdigest(),
                'url': 'https://huggingface.co/datasets/hoskinson-center/proof-pile',
                'license': 'dataset card: Apache-2.0; its Math StackExchange text is CC BY-SA (see ATTRIBUTION.md)'}]
    manifest = kb.write_asset(args.out, 'latex-v1', data, meta, sources,
                              'python3 scripts/typeahead/build-latex.py --input proofpile_dev.jsonl.gz')
    print(json.dumps(manifest['file']), json.dumps({k: meta[k] for k in ('vocabulary', 'heldOutPerplexity', 'trigrams', 'bigrams')}))


if __name__ == '__main__':
    main()
