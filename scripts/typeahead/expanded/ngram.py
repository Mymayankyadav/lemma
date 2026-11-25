"""Estimate modified Kneser–Ney with disk-backed counts and export normalized v2 assets."""
import argparse
from collections import Counter
from contextlib import closing
from functools import lru_cache
import gzip
import heapq
from itertools import groupby
import json
import math
from pathlib import Path
import shutil
import sqlite3
import struct
import time

from corpus import PROSE, documents, file_hash, latex_spans, text_hash

SPECIAL = ('<s>', '<m>', '<num>', '<unk>', '</s>')
BOS, UNK, EOS = 0, 3, 4


def f32(value):
    return struct.unpack('<f', struct.pack('<f', value))[0]


def words(corpus, split, kind, subject=None, limit=None):
    seen = 0
    tokenizer = PROSE.sentences if kind == 'ngram' else latex_spans
    for doc in documents(corpus, split):
        if subject is None or doc['subject'] == subject:
            for sentence in tokenizer(doc['text']):
                yield sentence
                seen += len(sentence)
                if limit is not None and seen >= limit:
                    return


def estimate_vocab(source, size):
    counts = Counter(token for sentence in source for token in sentence if token not in SPECIAL)
    return [*SPECIAL, *sorted(counts, key=lambda token: (-counts[token], token))[:size]]


def ids(sentence, vocab):
    return [vocab.get(token, UNK) for token in sentence]


def key(values):
    return struct.pack('>' + 'H' * len(values), *values)


def from_key(value):
    return struct.unpack('>' + 'H' * (len(value) // 2), value)


def accumulate(db, source, vocab, order):
    db.execute(f'CREATE TABLE counts{order}(k BLOB PRIMARY KEY,n INTEGER NOT NULL,raw INTEGER NOT NULL) WITHOUT ROWID')
    table = Counter()
    training_tokens = 0
    next_report = 10_000_000
    started = time.monotonic()
    sql = f'INSERT INTO counts{order} SELECT ?1,?2,?2 ON CONFLICT(k) DO UPDATE SET n=n+excluded.n,raw=raw+excluded.raw'
    for sentence in source:
        tokens = [BOS] * (order - 1) + ids(sentence, vocab) + [EOS]
        table.update(key(tokens[i:i + order]) for i in range(len(tokens) - order + 1))
        training_tokens += len(sentence)
        if len(table) >= 150_000:
            db.executemany(sql, sorted(table.items()))
            db.commit()
            table.clear()
            if training_tokens >= next_report:
                print('NGRAM COUNTS', json.dumps({'order': order, 'trainTokens': training_tokens,
                                                  'seconds': time.monotonic() - started}), flush=True)
                next_report = (training_tokens // 10_000_000 + 1) * 10_000_000
    db.executemany(sql, sorted(table.items()))
    db.commit()
    for n in range(order - 1, 0, -1):
        if training_tokens >= 10_000_000:
            print('NGRAM CONTINUATIONS', json.dumps({'order': n, 'trainTokens': training_tokens,
                                                        'seconds': time.monotonic() - started}), flush=True)
        db.execute(f'CREATE TABLE counts{n}(k BLOB PRIMARY KEY,n INTEGER NOT NULL,raw INTEGER NOT NULL) WITHOUT ROWID')
        db.execute(f'INSERT INTO counts{n} SELECT substr(k,3),count(*),sum(raw) FROM counts{n + 1} GROUP BY substr(k,3)')
        db.commit()
    return training_tokens


def discounts(db, n, column):
    counts = dict(db.execute(f'SELECT {column},count(*) FROM counts{n} WHERE {column}<=4 GROUP BY {column}'))
    n1, n2, n3, n4 = (counts.get(i, 0) for i in range(1, 5))
    y = n1 / (n1 + 2 * n2) if n1 and n2 else 0.75
    fallback = min(.95, max(.05, y))
    return (0, *[min(i - .01, max(.01, i - (i + 1) * y * nxt / current))
                 if current and nxt else fallback
                 for i, (current, nxt) in enumerate(((n1, n2), (n2, n3), (n3, n4)), 1)])


class Model:
    def __init__(self, unigram):
        self.unigram = unigram
        self.rows = [{}]

    def probability(self, history, word):
        factor = 1.
        for length in range(min(len(history), len(self.rows) - 1), 0, -1):
            row = self.rows[length].get(history[-length:])
            if row is None:
                continue
            edges, alpha = row
            if word in edges:
                return factor * edges[word]
            factor *= alpha
        return self.unigram[word] * factor


ROW_STRUCT = struct.Struct('<Hd')


class Reference:
    """Full, interpolated MKN reference. Rows are stored disk-resident by history."""
    def __init__(self, db, unigram):
        self.db = db
        self.unigram = unigram

    @lru_cache(maxsize=48_000)
    def row(self, order, history):
        found = self.db.execute(f'SELECT edges,alpha FROM rows{order} WHERE k=?', (history,)).fetchone()
        return (dict(ROW_STRUCT.iter_unpack(found[0])), found[1]) if found else ({}, 1.)

    def probability(self, history, word):
        factor = 1.
        for i in range(len(history), 0, -2):
            edges, alpha = self.row(i // 2 + 1, history[-i:])
            if word in edges:
                return factor * edges[word]
            factor *= alpha
        return self.unigram[word] * factor


def row_bytes(n, histories, edges, edge_bits=32):
    def align(size):
        return (size + 3) // 4 * 4
    return 8 + align(histories * (n - 1) * 2) + 4 * (histories + 1) + 4 * histories + align(edges * 2) + align(edges * (edge_bits // 8))


def entropy_cost(prob, lower, backoff, omitted_lower_mass):
    old_mass = backoff * omitted_lower_mass
    new_backoff = (old_mass + prob) / (omitted_lower_mass + lower)
    return prob * math.log(prob / (new_backoff * lower)) + (old_mass * math.log(backoff / new_backoff)
                                                           if old_mass else 0.)


def high_priority(rows, n, budget, edge_bits=32):
    """Bound selection memory and account for row overhead instead of charging each edge for a row."""
    # Keep the highest priorities that could possibly fit, assuming no history overhead.
    candidates = []
    max_edges = budget // (2 + edge_bits // 8)
    if max_edges == 0:
        for _ in rows:
            pass
        return {}
    for history, word, probability, priority in rows:
        entry = (priority, history, word, probability)
        if len(candidates) < max_edges:
            heapq.heappush(candidates, entry)
        elif entry > candidates[0]:
            heapq.heapreplace(candidates, entry)
    result = {}
    edge_count = 0
    for _, history, word, probability in sorted(candidates, reverse=True):
        if row_bytes(n, len(result) + (history not in result), edge_count + 1, edge_bits) <= budget:
            result.setdefault(history, {})[word] = probability
            edge_count += 1
    return result


def log16_code(probability, rounding=round):
    return min(65535, max(0, rounding(-2048 * math.log2(probability)))) if probability > 0 else 65535


def log16_probability(code):
    return 0. if code == 65535 else f32(2 ** (-code / 2048))


def compile_model(db, vocab, order, limit, pruning, progress=False, edge_bits=32):
    if edge_bits not in (16, 32):
        raise ValueError('Use 16 or 32 bits per explicit probability')
    rows = dict((from_key(k)[0], count) for k, count in db.execute('SELECT k,n FROM counts1'))
    count = sum(rows.values())
    if count == 0:
        raise ValueError('Corpus has no eligible tokens')
    unigram = [(.999 * rows.get(i, 0) / count + .001 / len(vocab)) for i in range(len(vocab))]
    # Rounding the largest coefficient absorbs initial serialization residual.
    packed_unigram = list(map(f32, unigram))
    largest = max(range(len(vocab)), key=packed_unigram.__getitem__)
    packed_unigram[largest] = f32(packed_unigram[largest] + 1 - math.fsum(packed_unigram))
    model = Model(packed_unigram)
    reference = Reference(db, unigram)
    vocabulary_bytes = len('\n'.join(vocab).encode())
    available_bytes = limit - 32 - ((vocabulary_bytes + 3) // 4) * 4 - len(vocab) * 4
    if available_bytes < 12 * (order - 1):
        raise ValueError('Asset budget is smaller than the vocabulary and header')
    row_budgets = [available_bytes // (order - 1)] * (order - 1)
    row_budgets[-1] += available_bytes % (order - 1)
    mass_error = abs(math.fsum(packed_unigram) - 1)
    params = {}
    row_mass = {}
    for n in range(2, order + 1):
        started = time.monotonic()
        column = 'raw' if n == order else 'n'
        d = discounts(db, n, column)
        params[n] = d[1:]
        db.execute(f'CREATE TABLE rows{n}(k BLOB PRIMARY KEY,edges BLOB NOT NULL,alpha REAL NOT NULL) WITHOUT ROWID')

        def priorities():
            source = db.execute(f'SELECT k,{column},raw FROM counts{n} ORDER BY k')
            for history, edges in groupby(source, lambda item: item[0][:-2]):
                counts = [(from_key(k[-2:])[0], c, raw) for k, c, raw in edges]
                total = sum(c for _, c, _ in counts)
                empirical_history_count = sum(raw for _, _, raw in counts)
                alpha = math.fsum(d[min(c, 3)] for _, c, _ in counts) / total
                lower = [(w, c, reference.probability(history[2:], w)) for w, c, _ in counts]
                omitted = max(0., 1 - math.fsum(q for _, _, q in lower))
                packed = []
                history_ids = from_key(history)
                for w, c, q in lower:
                    probability = (c - d[min(c, 3)]) / total + alpha * q
                    # Multiplying by the empirical history frequency ranks rows by
                    # expected loss. The common total frequency cancels by order.
                    priority = c if pruning == 'count' else empirical_history_count * entropy_cost(probability, q, alpha, omitted)
                    packed.append(ROW_STRUCT.pack(w, probability))
                    yield history_ids, w, probability, priority
                db.execute(f'INSERT INTO rows{n} VALUES (?,?,?)', (history, b''.join(packed), alpha))

        explicit = high_priority(priorities(), n, row_budgets[n - 2], edge_bits)
        db.commit()
        packed_rows = {}
        for history, values in sorted(explicit.items()):
            packed_edges = {word: f32(prob) for word, prob in values.items()}
            if edge_bits == 16:
                packed_edges = {word: log16_probability(log16_code(prob, math.ceil)) for word, prob in values.items()}
                if len(packed_edges) == len(vocab):
                    del packed_edges[min(packed_edges, key=packed_edges.get)]
            edge_mass = math.fsum(packed_edges.values())
            if edge_mass >= 1 - 1e-7:
                packed_edges = {word: (log16_probability(log16_code(prob * (1 - 2e-7) / edge_mass, math.ceil)) if edge_bits == 16 else
                                       f32(prob * (1 - 2e-7) / edge_mass)) for word, prob in packed_edges.items()}
                edge_mass = math.fsum(packed_edges.values())
            lower_seen = math.fsum(model.probability(history[1:], word) for word in packed_edges)
            if len(packed_edges) == len(vocab):
                best = max(packed_edges, key=packed_edges.__getitem__)
                packed_edges[best] = f32(packed_edges[best] + 1 - edge_mass)
                alpha = 0.
            else:
                # Use the actual reconstructed mass of the suffix, including float32 backoff.
                lower_row_mass = 1.
                suffix = history[1:]
                while suffix:
                    lower_row_mass = row_mass.get(suffix, lower_row_mass)
                    if suffix in row_mass:
                        break
                    suffix = suffix[1:]
                if not suffix:
                    lower_row_mass = math.fsum(model.unigram)
                omitted_mass = lower_row_mass - lower_seen
                if omitted_mass <= 0:
                    raise ValueError('Packed lower-order omitted mass must be positive')
                alpha = f32((1 - edge_mass) / omitted_mass)
            packed_rows[history] = (packed_edges, alpha)
            total = math.fsum(packed_edges.values()) + (alpha * omitted_mass if alpha else 0.)
            row_mass[history] = total
            mass_error = max(mass_error, abs(total - 1))
        model.rows.append(packed_rows)
        # Leave budget unused by shorter tables available to the highest model order.
        if n < order:
            row_budgets[-1] += row_budgets[n - 2] - row_bytes(n, len(packed_rows), sum(len(v[0]) for v in packed_rows.values()), edge_bits)
        if progress:
            print('NGRAM PACK ORDER', json.dumps({'order': order, 'tableOrder': n, 'pruning': pruning,
                                                 'seconds': time.monotonic() - started}), flush=True)
    return model, {'maxRowMassError': mass_error, 'discounts': params}, reference


def encode(vocab, model, edge_bits=32):
    def padded(data):
        return data + b'\0' * (-len(data) % 4)
    order = len(model.rows)
    rows_count = sum(len(part) for part in model.rows)
    edges_count = sum(len(edges) for part in model.rows for edges, _ in part.values())
    text = '\n'.join(vocab).encode('utf8')
    out = bytearray(struct.pack('<8s6I', b'LEMMANG3' if edge_bits == 16 else b'LEMMANG2', order, len(vocab), 32, rows_count, edges_count, len(text)))
    out.extend(padded(text))
    out.extend(struct.pack('<' + 'f' * len(vocab), *model.unigram))
    for part in model.rows[1:]:
        histories, offsets, alphas, words_, probs = bytearray(), [0], [], bytearray(), bytearray()
        for history, (edges, alpha) in sorted(part.items()):
            histories.extend(struct.pack('<' + 'H' * len(history), *history))
            for token, prob in sorted(edges.items()):
                words_.extend(struct.pack('<H', token))
                probs.extend(struct.pack('<H', log16_code(prob)) if edge_bits == 16 else struct.pack('<f', prob))
            offsets.append(len(words_) // 2)
            alphas.append(alpha)
        out.extend(struct.pack('<II', len(part), offsets[-1]))
        out.extend(padded(histories))
        out.extend(struct.pack('<' + 'I' * len(offsets), *offsets))
        out.extend(struct.pack('<' + 'f' * len(alphas), *alphas))
        out.extend(padded(words_))
        out.extend(padded(probs))
    return out


def evaluate(model, reference, word_ids, source, order):
    nll = ref_nll = 0.
    targets = oov = words_count = 0
    for sentence in source:
        history = (BOS,) * (order - 1)
        for token in (*sentence, '</s>'):
            word = word_ids.get(token, UNK)
            words_count += token not in ('<m>', '<num>', '</s>')
            oov += word == UNK
            if token not in ('<m>', '<num>'):
                nll -= math.log(model.probability(history, word))
                ref_nll -= math.log(reference.probability(key(history), word))
                targets += 1
            history = (*history[1:], word)
    return {'targets': targets, 'outOfVocabulary': oov, 'wordTargets': words_count,
            'wordOovRate': oov / words_count if words_count else None,
            'perplexity': math.exp(nll / targets) if targets else None,
            'referencePerplexity': math.exp(ref_nll / targets) if targets else None}



def scratch_count_cache():
    """Cap count cache at one fourth of the detected memory limit, with a conservative fallback."""
    limits = (Path('/sys/fs/cgroup/memory.max'),
              Path('/sys/fs/cgroup/memory/memory.limit_in_bytes'))
    for path in limits:
        try:
            limit = int(path.read_text().strip())
        except (OSError, ValueError):
            continue
        if 0 < limit < 1 << 60:
            return max(1, min(8 * 1024 * 1024, limit // (4 * 1024))), limit
    return 256 * 1024, None


def count_checkpoint(corpus, out, max_order, size, kind, subject=None, shared_vocab=None, train_limit=None,
                     compress=False):
    """Persist the exact raw and continuation counts so packing can run in a separate session."""
    if subject and not shared_vocab:
        raise ValueError('A subject pack requires the selected general vocabulary')

    def source():
        return words(corpus, 'train', kind, subject, limit=train_limit)

    vocab = json.loads(shared_vocab.read_text()) if shared_vocab else estimate_vocab(source(), size)
    if vocab[:len(SPECIAL)] != list(SPECIAL) or len(vocab) > 65535 or len(set(vocab)) != len(vocab):
        raise ValueError('Invalid ordered vocabulary')
    out.mkdir(parents=True, exist_ok=False)
    vocab_file = out / 'vocab.json'
    vocab_file.write_text(json.dumps(vocab, ensure_ascii=False) + '\n')
    binary = out / 'counts.sqlite'
    cache_kib, memory_limit = scratch_count_cache()
    with closing(sqlite3.connect(binary)) as db:
        # This database is disposable until a checked checkpoint is published.
        db.execute('PRAGMA temp_store=FILE')
        if db.execute('PRAGMA journal_mode=OFF').fetchone() != ('off',):
            raise ValueError('Could not set the disposable count-store journal mode')
        db.execute('PRAGMA synchronous=OFF')
        db.execute(f'PRAGMA cache_size=-{cache_kib}')
        scratch_settings = {'journalMode': db.execute('PRAGMA journal_mode').fetchone()[0],
                            'synchronous': db.execute('PRAGMA synchronous').fetchone()[0],
                            'cacheKiB': -db.execute('PRAGMA cache_size').fetchone()[0],
                            'observedCgroupLimitBytes': memory_limit}
        print('NGRAM SCRATCH', json.dumps(scratch_settings, sort_keys=True), flush=True)
        training_tokens = accumulate(db, source(), {word: i for i, word in enumerate(vocab)}, max_order)
        if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            raise ValueError('Cannot publish an invalid n-gram count database')
        scratch_settings['integrityChecked'] = True
    checkpoint = {'version': 1, 'kind': kind, 'subject': subject, 'maxOrder': max_order,
                  'trainTokens': training_tokens, 'targetTrainTokens': train_limit,
                  'corpusSha256': file_hash(corpus / 'manifest.json'),
                  'vocabSha256': file_hash(vocab_file), 'countsSha256': file_hash(binary),
                  'countsBytes': binary.stat().st_size, 'scratchSqlite': scratch_settings}
    if compress:
        compressed = out / (binary.name + '.gz')
        with binary.open('rb') as source, compressed.open('wb') as output:
            with gzip.GzipFile(filename='', mode='wb', fileobj=output, compresslevel=1, mtime=0) as stream:
                shutil.copyfileobj(source, stream, 4 * 1024 * 1024)
        checkpoint['compressedBytes'] = compressed.stat().st_size
        checkpoint['compressedSha256'] = file_hash(compressed)
        binary.unlink()
    (out / 'count-manifest.json').write_text(json.dumps(checkpoint, indent=2, sort_keys=True) + '\n')
    return checkpoint


def publish_checkpoint(local, published):
    expected = sum(path.stat().st_size for path in local.iterdir())
    available = shutil.disk_usage(published.parent).free
    if expected > available - 128 * 1024 * 1024:
        raise RuntimeError(f'Count checkpoint needs {expected} bytes with {available} bytes free')
    shutil.copytree(local, published)


def pack_checkpoint(corpus, checkpoint_dir, outputs, limit, scratch=None, edge_bits=32, sqlite_cache_mib=None):
    """Verify input identity and create only the transient probability tables in local scratch."""
    from tempfile import TemporaryDirectory
    metadata = json.loads((checkpoint_dir / 'count-manifest.json').read_text())
    binary, vocab_file = checkpoint_dir / 'counts.sqlite', checkpoint_dir / 'vocab.json'
    corpus_hash = file_hash(corpus / 'manifest.json')
    if (metadata['version'] != 1 or metadata['corpusSha256'] != corpus_hash or
            metadata['vocabSha256'] != file_hash(vocab_file) or max(order for _, order, _ in outputs) > metadata['maxOrder']):
        raise ValueError('Invalid or mismatched n-gram count checkpoint')
    vocab = json.loads(vocab_file.read_text())
    lookup = {word: i for i, word in enumerate(vocab)}
    kind, subject = metadata['kind'], metadata['subject']
    cache_kib, memory_limit = scratch_count_cache()
    if memory_limit is None:
        cache_kib = 512 * 1024  # Preserve the two 256 MiB caches when the limit is unknown.
    if sqlite_cache_mib is not None:
        if sqlite_cache_mib < 1:
            raise ValueError("SQLite cache limit must be positive")
        cache_kib = min(cache_kib, sqlite_cache_mib * 1024)
    rows_cache_kib = max(1, cache_kib // 2)
    counts_cache_kib = max(1, cache_kib - rows_cache_kib)
    with TemporaryDirectory(prefix='lemma-ngram-pack-', dir=scratch) as temp:
        scratch_dir = Path(temp)
        if 'compressedSha256' in metadata:
            compressed = binary.with_suffix('.sqlite.gz')
            if (compressed.stat().st_size != metadata['compressedBytes'] or
                    file_hash(compressed) != metadata['compressedSha256']):
                raise ValueError('Compressed count checkpoint has changed')
            binary = scratch_dir / binary.name
            with gzip.open(compressed, 'rb') as source, binary.open('wb') as target:
                shutil.copyfileobj(source, target, 4 * 1024 * 1024)
        if metadata['countsBytes'] != binary.stat().st_size or metadata['countsSha256'] != file_hash(binary):
            raise ValueError('N-gram count database has changed')
        db = sqlite3.connect(scratch_dir / 'rows.sqlite', uri=True)
        try:
            db.execute('PRAGMA temp_store=FILE')
            db.execute(f'PRAGMA main.cache_size=-{rows_cache_kib}')
            db.execute('ATTACH DATABASE ? AS counts', (binary.resolve().as_uri() + '?mode=ro&immutable=1',))
            db.execute(f'PRAGMA counts.cache_size=-{counts_cache_kib}')
            print('NGRAM PACK SQLITE', json.dumps({
                'rowsCacheKiB': -db.execute('PRAGMA main.cache_size').fetchone()[0],
                'countsCacheKiB': -db.execute('PRAGMA counts.cache_size').fetchone()[0],
                'observedCgroupLimitBytes': memory_limit,
            }), flush=True)
            for out, order, pruning in outputs:
                out.mkdir(parents=True, exist_ok=False)
                progress = metadata['trainTokens'] >= 10_000_000
                model, stats, reference = compile_model(db, vocab, order, limit, pruning, progress, edge_bits)
                started = time.monotonic()
                stats['validation'] = evaluate(model, reference, lookup, words(corpus, 'validation', kind, subject), order)
                if progress:
                    print('NGRAM PACK VALIDATION', json.dumps({'order': order, 'pruning': pruning,
                                                               'seconds': time.monotonic() - started}), flush=True)
                stats['trainTokens'] = metadata['trainTokens']
                stats['targetTrainTokens'] = metadata['targetTrainTokens']
                reference.row.cache_clear()
                for n in range(2, order + 1):
                    db.execute(f'DROP TABLE rows{n}')
                db.commit()
                asset = out / 'model.bin'
                asset.write_bytes(encode(vocab, model, edge_bits))
                if asset.stat().st_size > limit:
                    raise ValueError('Packed asset exceeded its byte budget')
                (out / 'vocab.json').write_bytes(vocab_file.read_bytes())
                manifest = {'version': 2, 'kind': kind, 'order': order, 'file': asset.name,
                            'bytes': asset.stat().st_size, 'sha256': file_hash(asset),
                            'vocabSha256': text_hash('\n'.join(vocab)), 'vocabSize': len(vocab),
                            'subject': subject, 'pruning': pruning, 'edgeBits': edge_bits, 'metrics': stats,
                            'corpusSha256': corpus_hash, 'countsSha256': metadata['countsSha256']}
                (out / 'manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
                yield out, manifest
        finally:
            db.close()


def build_models(corpus, outputs, limit, size, kind, subject, shared_vocab=None, train_limit=None, scratch=None):
    """Reuse the highest-order sorted counts for every order/pruning variant."""
    from tempfile import TemporaryDirectory
    with TemporaryDirectory(prefix='lemma-ngram-count-', dir=scratch) as temp:
        checkpoint = Path(temp) / 'counts'
        count_checkpoint(corpus, checkpoint, max(order for _, order, _ in outputs), size, kind,
                         subject, shared_vocab, train_limit)
        yield from pack_checkpoint(corpus, checkpoint, outputs, limit, scratch)


def build(corpus, out, order, limit, size, pruning, kind, subject, shared_vocab=None, train_limit=None):
    [(target, manifest)] = list(build_models(corpus, [(out, order, pruning)], limit, size, kind, subject,
                                             shared_vocab, train_limit))
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--order', type=int, choices=(3, 4, 5), required=True)
    parser.add_argument('--kind', choices=('ngram', 'latex'), default='ngram')
    parser.add_argument('--limit', type=int, default=20 * 1024 * 1024)
    parser.add_argument('--vocab-size', type=int, default=60_000)
    parser.add_argument('--pruning', choices=('count', 'entropy'), required=True)
    parser.add_argument('--subject')
    parser.add_argument('--shared-vocab', type=Path)
    parser.add_argument('--checkpoint', type=Path, help='Reuse audited counts for a pack-only experiment')
    parser.add_argument('--sqlite-cache-mib', type=int, help='Combined cache limit for pack-only builds on a shared host')
    parser.add_argument('--edge-bits', type=int, choices=(16, 32), default=32)
    parser.add_argument('--train-limit', type=int)
    args = parser.parse_args()
    if args.checkpoint:
        [(_, manifest)] = pack_checkpoint(args.corpus, args.checkpoint, [(args.out, args.order, args.pruning)],
                                          args.limit, edge_bits=args.edge_bits, sqlite_cache_mib=args.sqlite_cache_mib)
        print(json.dumps(manifest, sort_keys=True))
        return
    if args.edge_bits != 32:
        parser.error('--edge-bits 16 requires --checkpoint')
    print(json.dumps(build(args.corpus, args.out, args.order, args.limit, args.vocab_size, args.pruning, args.kind,
                           args.subject, args.shared_vocab, args.train_limit), sort_keys=True))


if __name__ == '__main__':
    main()
