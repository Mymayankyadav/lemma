"""N233/N235 · shared builder for the typeahead n-gram assets (interpolated modified Kneser-Ney, trigram).

Trains on token sentences, prunes by count, converts to back-off form (so the app needs no training code), quantises to
8 bits and writes one little-endian binary file that src/features/tutor/writingAid/decoder/kn.ts reads.

Format (all integers little-endian; every section is padded to 4 bytes):
  magic "LMN1", u32 version (1), u32 V, u32 nBi, u32 nTriCtx, u32 nTri, u32 vocabBytes, u32 0
  vocab        UTF-8 words joined by "\\n", id = line number
  uniQ         u8[V]      -ln P(w) / Q_STEP                       (KN continuation probability)
  biBow        i8[V]      ln bow(v) / B_STEP                      (back-off weight of context v)
  biStart      u32[V+1]   offsets into biNext / biQ
  biNext       u16[nBi]   next word, ascending within a context
  biQ          u8[nBi]    -ln P(w | v) / Q_STEP
  triKey       u32[nTriCtx]  u * 65536 + v, ascending
  triStart     u32[nTriCtx+1]
  triBow       i8[nTriCtx]   ln bow(u, v) / B_STEP
  triNext      u16[nTri]
  triQ         u8[nTri]      -ln P(w | u, v) / Q_STEP
Probability at run time: P(w|u,v) = triQ if stored, else bow(u,v) * P(w|v); P(w|v) = biQ if stored, else bow(v) * P(w).
"""
import array, collections, hashlib, json, math, struct, sys, zlib

assert sys.byteorder == 'little'
Q_STEP = 0.07
B_STEP = 0.1
EPS = 1e-3
SPECIAL = ['<s>', '<m>', '<num>', '<unk>', '</s>']  # ids 0..4
BOS, EOS, UNK = 0, 4, 3


def is_held_out(text):
    """Deterministic 5% of documents are never trained on (used for the reported perplexity)."""
    return zlib.crc32(text[:200].encode('utf8')) % 20 == 0


def build_vocab(sentences, size):
    counts = collections.Counter(w for s in sentences for w in s if w not in SPECIAL)
    words = sorted(counts, key=lambda w: (-counts[w], w))[:size]
    return SPECIAL + words


def discounts(counter):
    n = collections.Counter(c for c in counter.values() if c <= 4)
    y = n[1] / (n[1] + 2 * n[2])
    return (0.0, 1 - 2 * y * n[2] / n[1], 2 - 3 * y * n[3] / n[2], 3 - 4 * y * n[4] / n[3])


def count_ngrams(id_sentences):
    c3 = collections.Counter()
    for s in id_sentences:
        t = [BOS, BOS] + s + [EOS]
        c3.update(zip(t, t[1:], t[2:]))
    cont2 = collections.Counter()
    for (_, v, w) in c3:
        cont2[(v, w)] += 1
    cont1 = collections.Counter()
    for (_, w) in cont2:
        cont1[w] += 1
    return c3, cont2, cont1, sum(len(s) for s in id_sentences)


def estimate_bytes(counts, vocab_bytes, v_size, min3, min2):
    c3, cont2, _, _ = counts
    n3 = sum(1 for c in c3.values() if c >= min3)
    ctx = len({(u, v) for (u, v, _), c in c3.items() if c >= min3})
    n2 = sum(1 for c in cont2.values() if c >= min2)
    return 32 + vocab_bytes + 2 * v_size + 4 * (v_size + 1) + 3 * n2 + 6 * ctx + 4 + 3 * n3 + 64


def train(counts, v_size, min3, min2):
    """Returns the pruned back-off model as plain dicts (probabilities in natural-log units)."""
    c3, cont2, cont1, token_count = counts
    total1 = sum(cont1.values())
    d3, d2 = discounts(c3), discounts(cont2)
    dis = lambda d, c: d[min(c, 3)]

    p1 = [0.0] * v_size
    for w in range(v_size):
        p1[w] = (1 - EPS) * cont1.get(w, 0) / total1 + EPS / v_size

    ctx2 = collections.defaultdict(dict)
    for (v, w), c in cont2.items():
        ctx2[v][w] = c
    st2 = {}
    for v, row in ctx2.items():
        total = sum(row.values())
        k = collections.Counter(min(c, 3) for c in row.values())
        st2[v] = (total, (d2[1] * k[1] + d2[2] * k[2] + d2[3] * k[3]) / total)

    def p2_full(w, v):
        row = ctx2.get(v)
        if not row:
            return p1[w]
        total, gamma = st2[v]
        return max(row.get(w, 0) - dis(d2, row.get(w, 0)), 0) / total + gamma * p1[w]

    # Bigrams kept: those whose continuation count reaches min2 (the raw count is not needed, the KN count is the evidence).
    kept2 = {}
    for v, row in ctx2.items():
        keep = {w: c for w, c in row.items() if c >= min2}
        if keep:
            kept2[v] = {w: p2_full(w, v) for w in keep}
    bow2 = [1.0] * v_size
    for v, row in kept2.items():
        num = 1 - sum(row.values())
        den = 1 - sum(p1[w] for w in row)
        bow2[v] = max(num, 1e-6) / max(den, 1e-6)

    def p2_rt(w, v):
        row = kept2.get(v)
        if row and w in row:
            return row[w]
        return bow2[v] * p1[w]

    ctx3 = collections.defaultdict(dict)
    for (u, v, w), c in c3.items():
        ctx3[(u, v)][w] = c
    kept3, bow3 = {}, {}
    for (u, v), row in ctx3.items():
        keep = {w: c for w, c in row.items() if c >= min3}
        if not keep:
            continue
        total = sum(row.values())
        k = collections.Counter(min(c, 3) for c in row.values())
        gamma = (d3[1] * k[1] + d3[2] * k[2] + d3[3] * k[3]) / total
        probs = {w: max(c - dis(d3, c), 0) / total + gamma * p2_full(w, v) for w, c in keep.items()}
        num = 1 - sum(probs.values())
        den = 1 - sum(p2_rt(w, v) for w in probs)
        kept3[(u, v)] = probs
        bow3[(u, v)] = max(num, 1e-6) / max(den, 1e-6)
    stats = {'tokens': token_count, 'trigramTypes': len(c3), 'D3': d3[1:], 'D2': d2[1:]}
    return {'p1': p1, 'kept2': kept2, 'bow2': bow2, 'kept3': kept3, 'bow3': bow3, 'stats': stats}


def q_of(p):
    return min(255, max(0, round(-math.log(p) / Q_STEP)))


def b_of(bow):
    return max(-127, min(127, round(math.log(bow) / B_STEP)))


def encode(vocab, model):
    v_size = len(vocab)
    assert v_size <= 65535
    blob = '\n'.join(vocab).encode('utf8')
    pad = lambda data: data + b'\0' * (-len(data) % 4)
    out = bytearray()
    kept2, kept3 = model['kept2'], model['kept3']
    bi_start, bi_next, bi_q = array.array('I'), array.array('H'), array.array('B')
    for v in range(v_size):
        bi_start.append(len(bi_next))
        for w in sorted(kept2.get(v, {})):
            bi_next.append(w)
            bi_q.append(q_of(kept2[v][w]))
    bi_start.append(len(bi_next))
    keys = sorted(kept3)
    tri_key, tri_start, tri_next, tri_q, tri_bow = array.array('I'), array.array('I'), array.array('H'), array.array('B'), array.array('b')
    for key in keys:
        tri_key.append(key[0] * 65536 + key[1])
        tri_start.append(len(tri_next))
        tri_bow.append(b_of(model['bow3'][key]))
        for w in sorted(kept3[key]):
            tri_next.append(w)
            tri_q.append(q_of(kept3[key][w]))
    tri_start.append(len(tri_next))
    uni_q = array.array('B', (q_of(p) for p in model['p1']))
    bi_bow = array.array('b', (b_of(b) for b in model['bow2']))
    out += b'LMN1' + struct.pack('<7I', 1, v_size, len(bi_next), len(tri_key), len(tri_next), len(blob), 0)
    for chunk in (blob, uni_q.tobytes(), bi_bow.tobytes(), bi_start.tobytes(), bi_next.tobytes(), bi_q.tobytes(),
                  tri_key.tobytes(), tri_start.tobytes(), tri_bow.tobytes(), tri_next.tobytes(), tri_q.tobytes()):
        out += pad(chunk)
    return bytes(out), {'bigrams': len(bi_next), 'trigramContexts': len(tri_key), 'trigrams': len(tri_next)}


class Scorer:
    """The run-time lookup (kn.ts mirrors it), over the dequantised model: used to report held-out perplexity."""

    def __init__(self, model):
        q = lambda p: math.exp(-q_of(p) * Q_STEP)
        self.p1 = [q(p) for p in model['p1']]
        self.bow2 = [math.exp(b_of(b) * B_STEP) for b in model['bow2']]
        self.k2 = {v: {w: q(p) for w, p in row.items()} for v, row in model['kept2'].items()}
        self.k3 = {k: {w: q(p) for w, p in row.items()} for k, row in model['kept3'].items()}
        self.bow3 = {k: math.exp(b_of(b) * B_STEP) for k, b in model['bow3'].items()}

    def p(self, w, u, v):
        row3 = self.k3.get((u, v))
        if row3 and w in row3:
            return row3[w]
        row2 = self.k2.get(v)
        p2 = row2[w] if row2 and w in row2 else self.bow2[v] * self.p1[w]
        return self.bow3.get((u, v), 1.0) * p2


def perplexity(scorer, id_sentences, skip=()):
    total, n = 0.0, 0
    for s in id_sentences:
        t = [BOS, BOS] + s + [EOS]
        for i in range(2, len(t)):
            if t[i] in skip:
                continue
            total += math.log(max(scorer.p(t[i], t[i - 2], t[i - 1]), 1e-12))
            n += 1
    return math.exp(-total / n)


def build(documents_sentences, held_sentences, vocab_size, size_limit, min2_start=2, report=print):
    """documents_sentences: lists of token lists (training); held_sentences: same for the held-out part."""
    vocab = build_vocab(documents_sentences, vocab_size)
    index = {w: i for i, w in enumerate(vocab)}
    ids = lambda sents: [[index.get(w, UNK) for w in s] for s in sents]
    train_ids, held_ids = ids(documents_sentences), ids(held_sentences)
    counts = count_ngrams(train_ids)
    vocab_bytes = len('\n'.join(vocab).encode('utf8'))
    chosen = None
    for min3 in range(2, 16):
        for min2 in range(min2_start, 10):
            size = estimate_bytes(counts, vocab_bytes, len(vocab), min3, min2)
            if size <= size_limit:
                chosen = (min3, min2)
                break
        if chosen:
            break
    if not chosen:
        raise SystemExit('could not fit the size limit')
    min3, min2 = chosen
    model = train(counts, len(vocab), min3, min2)
    data, parts = encode(vocab, model)
    report(f'  min3={min3} min2={min2}: {len(data)} bytes, {parts}')
    if len(data) > size_limit:
        raise SystemExit('encoded size over the limit: ' + str(len(data)))
    ppl = perplexity(Scorer(model), held_ids[:20000], skip={1, 2})
    meta = {'vocabulary': len(vocab), 'minTrigramCount': min3, 'minBigramContinuation': min2, **parts, **model['stats'],
            'heldOutPerplexity': round(ppl, 2), 'quantisation': {'probability': Q_STEP, 'backoff': B_STEP}}
    return vocab, data, meta


def write_asset(out_dir, name, data, meta, sources, command):
    import os
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, 'ngram.bin'), 'wb') as f:
        f.write(data)
    manifest = {
        'assetSetVersion': name,
        'file': {'path': 'ngram.bin', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()},
        'format': 'LMN1 (see scripts/typeahead/kn_build.py)',
        'sources': sources,
        'build': {'command': command, **meta},
    }
    with open(os.path.join(out_dir, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    return manifest
