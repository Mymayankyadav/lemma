"""Create split, provenance-preserving JSONL shards from pinned public sources.

Source specs contain a collection's identifier, immutable revision, licence, register,
and local shards with their SHA-256. Fields can select source-specific columns. Identity
fields should point to the parent page, paper or question thread, not an answer ID.
"""
import argparse
from collections import Counter
from contextlib import ExitStack
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import sqlite3
import unicodedata
from urllib.parse import urlsplit
import zlib

SPEC = importlib.util.spec_from_file_location(
    'legacy_prose', Path(__file__).resolve().parent.parent / 'build-ngram.py',
)
PROSE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROSE)
SPLITS = ('train', 'validation', 'calibration', 'test')
REGISTERS = ('explanation', 'proof', 'learner')
SUBJECTS = {
    'topology': r'\b(topolog\w+|hausdorff|compactness|homotopy)\b',
    'linear-algebra': r'\b(matrix|eigen\w+|vector space|determinant)\b',
    'analysis': r'\b(measure theory|integrable|derivative|limit|sequence)\b',
    'algebra': r'\b(ideal|quotient group|galois|ring|polynomial)\b',
    'probability': r'\b(probability|random variable|distribution|expectation)\b',
    'geometry': r'\b(geometry|triangle|circle|congruen\w+)\b',
    'number-theory': r'\b(prime|number theory|congruence|diophantine)\b',
}
SUBJECTS = {name: re.compile(pattern, re.I) for name, pattern in SUBJECTS.items()}


# Match the TS model token classes after extracting closed formula spans.
FORMULA = re.compile(
    r'\$\$(?P<display>.+?)\$\$|(?<!\\)\$(?P<inline>[^$\n]+?)(?<!\\)\$|'
    r'\\\((?P<paren>.+?)\\\)|\\\[(?P<bracket>.+?)\\\]|'
    r'(?P<environment>\\begin\{(?P<env_name>align\*?|equation\*?|gather\*?|matrix|pmatrix|bmatrix|'
    r'Bmatrix|vmatrix|Vmatrix|smallmatrix|array|cases|aligned|alignedat|gathered|split)\}'
    r'.+?\\end\{(?P=env_name)\})',
    re.S,
)
TEX_TOKEN = re.compile(r'\\[A-Za-z]+|\\[^\n\r\u2028\u2029]|[A-Za-z]|[0-9]+|\S')
STACK_QUESTION = re.compile(r'^QUESTION\s*\[[^\]\n]*\]:[ \t]*', re.M)
STACK_REPLY = re.compile(r'^REPLY\s*\[[^\]\n]*\]:[ \t]*', re.M)
STACK_NEXT = re.compile(r'^(?:REPLY|COMMENT)\s*\[[^\]\n]*\]:[ \t]*', re.M)


def latex_spans(text):
    for match in FORMULA.finditer(text):
        body = next((match[name] for name in ('display', 'inline', 'paren', 'bracket', 'environment')
                     if match[name] is not None), '').strip()
        if not 3 <= len(body) <= 1600:
            continue
        tokens = ['<latin>' if len(t) == 1 and t.isascii() and t.isalpha() else
                  '<num>' if t[0].isascii() and t[0].isdigit() else t
                  for t in TEX_TOKEN.findall(body)]
        if len(tokens) >= 3:
            yield tokens


def tutor_pair(document):
    if document.get('question'):
        return document['question'], document['text']
    if document['source'] != 'hoskinson-center/proof-pile':
        return '', ''
    text = document['text']
    question = STACK_QUESTION.search(text)
    reply = STACK_REPLY.search(text, question.end()) if question else None
    if reply is None:
        return '', ''
    following_question = STACK_NEXT.search(text, question.end())
    next_reply = STACK_NEXT.search(text, reply.end())
    question_end = following_question.start() if following_question else reply.start()
    return text[question.end():question_end].strip(), text[reply.end():next_reply.start() if next_reply else None].strip()

def file_hash(path):
    with open(path, 'rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


def text_hash(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def fingerprint(text):
    return text_hash(' '.join(unicodedata.normalize('NFKC', text).casefold().split()))


def split_for(group):
    slot = int(text_hash(group)[:16], 16) % 1000
    return SPLITS[0 if slot < 940 else 1 if slot < 960 else 2 if slot < 980 else 3]


def records(path):
    if path.suffix == '.parquet':
        from pyarrow.parquet import ParquetFile
        for batch in ParquetFile(path).iter_batches(batch_size=512):
            yield from batch.to_pylist()
        return
    with ExitStack() as stack:
        if path.suffix == '.zst':
            import zstandard
            raw = stack.enter_context(path.open('rb'))
            reader = zstandard.ZstdDecompressor().stream_reader(raw)
            file = stack.enter_context(io.TextIOWrapper(reader, encoding='utf8'))
        else:
            open_text = gzip.open if path.suffix == '.gz' else open
            file = stack.enter_context(open_text(path, 'rt', encoding='utf8'))
        for line in file:
            if line.strip():
                yield json.loads(line)


def select(document, field, default=None):
    value = document
    for key in field.split('.'):
        if isinstance(value, str) and value.lstrip().startswith('{'):
            value = json.loads(value)
        if not isinstance(value, dict):
            return default
        value = value.get(key)
    return default if value is None else value


def join(db, group, existing):
    def root(key):
        prior = db.execute('SELECT parent FROM groups WHERE id=?', (key,)).fetchone()
        if not prior:
            db.execute('INSERT INTO groups VALUES (?,?)', (key, key))
            return key
        parent = prior[0]
        while parent != key:
            key = parent
            parent = db.execute('SELECT parent FROM groups WHERE id=?', (key,)).fetchone()[0]
        return key
    a, b = sorted((root(group), root(existing)))
    if a != b:
        db.execute('UPDATE groups SET parent=? WHERE id=?', (a, b))
    return a


def group_identity(reference):
    text = str(reference).strip().split('#', 1)[0]
    url = urlsplit(text)
    if url.netloc and url.scheme in ('http', 'https'):
        host = url.netloc.casefold().removeprefix('www.')
        path = url.path.rstrip('/')
        query = url.query
        if host in ('arxiv.org', 'export.arxiv.org'):
            host = 'arxiv.org'
            path = re.sub(r'^/(?:pdf|abs|html)/', '/', path).removesuffix('.pdf')
            path = re.sub(r'v[0-9]+$', '', path)
            query = ''
        if host.endswith('stackexchange.com') or host in ('stackoverflow.com', 'mathoverflow.net'):
            thread = re.match(r'/(?:questions|q)/([0-9]+)', path)
            if thread:
                path = '/questions/' + thread[1]
                query = ''
        return host + path + ('?' + query if query else '')
    arxiv = re.fullmatch(r'(?:arxiv:)?((?:[a-z.-]+/[0-9]{7}|[0-9]{4}\.[0-9]{4,5}))(?:v[0-9]+)?',
                         text, re.I)
    return 'arxiv.org/' + arxiv.group(1).lower() if arxiv else text


def publisher_reference(raw, source):
    fields = source.get('groupFields', (source.get('groupField', 'url'),))
    value = next((value for field in fields if (value := select(raw, field)) and type(value) in (str, int)), None)
    if value and source.get('groupPrefix') and str(value).isdigit():
        return source['groupPrefix'] + str(value)
    return value


def group_preflight(path, source, sample=32):
    groups = set()
    checked = 0
    for raw in records(path):
        if any(select(raw, field) != value for field, value in source.get('filter', {}).items()):
            continue
        reference = publisher_reference(raw, source)
        if not reference or not group_identity(reference):
            raise ValueError(f"Missing publisher provenance key in sampled {source['id']} record")
        groups.add(text_hash(group_identity(reference)))
        checked += 1
        if checked >= sample:
            break
    if not checked:
        raise ValueError(f"No eligible provenance records sampled from {source['id']}")
    return {'source': source['id'], 'sampled': checked, 'distinctGroups': len(groups)}


def shingles(text):
    words = re.findall(r"[^\W_]+(?:['’][^\W_]+)?", unicodedata.normalize('NFKC', text).casefold())
    if len(words) < 12:
        return frozenset()
    # Hash both uniformly spaced windows and text boundaries. Keeping a bounded
    # signature makes approximate grouping feasible for long LaTeX documents.
    stride = max(1, len(words) // 2048)
    return frozenset(zlib.crc32(' '.join(words[i:i + 4]).encode('utf8'))
                     for i in range(0, len(words) - 3, stride))


def group_near_duplicates(db, signature, group):
    if len(signature) < 8:
        return False
    # A shared minimum is an LSH candidate test. Exact Jaccard on the retained
    # shingle hashes rejects false matches before linking document groups.
    minima = sorted(signature)[:4]
    candidates = set()
    for band in minima:
        candidates.update(row[0] for row in db.execute('SELECT doc FROM bands WHERE band=? LIMIT 256', (band,)))
    matched = False
    for candidate in sorted(candidates):
        other_group, packed = db.execute('SELECT group_id,signature FROM signatures WHERE id=?',
                                         (candidate,)).fetchone()
        import array
        other = array.array('I')
        other.frombytes(packed)
        alternate = frozenset(other)
        intersection = len(signature & alternate)
        if 5 * intersection >= 4 * (len(signature) + len(alternate) - intersection):
            join(db, group, other_group)
            matched = True
    return matched


def add_signature(db, group, signature):
    if len(signature) < 8:
        return
    import array
    doc = db.execute('INSERT INTO signatures(group_id,signature) VALUES (?,?)',
                     (group, array.array('I', sorted(signature)).tobytes())).lastrowid
    db.executemany('INSERT INTO bands VALUES (?,?)', [(band, doc) for band in sorted(signature)[:4]])


def coverage(text):
    return max(SUBJECTS, key=lambda name: len(SUBJECTS[name].findall(text))) if any(
        regex.search(text) for regex in SUBJECTS.values()
    ) else 'other'


def ingest(db, specs, base, exclusions):
    stats = Counter()
    files = []
    for source in specs:
        for group_stat in ('publisherGroupPresent', 'publisherGroupMissing', 'questionFingerprintFallback',
                           'contentFingerprintFallback'):
            stats[group_stat + ':' + source['id']] = 0
        if source['register'] not in REGISTERS:
            raise ValueError(f"Unknown register for {source['id']}")
        if not all(source.get(key) for key in ('id', 'revision', 'license', 'url')):
            raise ValueError('Source provenance is incomplete')
        for shard in source['shards']:
            path = base / shard['path']
            digest = file_hash(path)
            if digest != shard['sha256']:
                raise ValueError(f'Source hash mismatch: {path.name}')
            files.append({'id': source['id'], 'revision': source['revision'], 'license': source['license'],
                          'url': source['url'], **shard})
            for index, raw in enumerate(records(path)):
                stats['read'] += 1
                if any(select(raw, field) != value for field, value in source.get('filter', {}).items()):
                    stats['filtered'] += 1
                    continue
                text = select(raw, source.get('textField', 'text'), '').strip()
                if not text or len(text) > 1_000_000:
                    stats['filtered'] += 1
                    continue
                content = fingerprint(text)
                group_key = publisher_reference(raw, source)
                family = source['id']
                if group_key:
                    stats['publisherGroupPresent:' + family] += 1
                else:
                    stats['publisherGroupMissing:' + family] += 1
                    if source.get('allowQuestionFingerprint'):
                        prompt, _ = tutor_pair({'source': family, 'text': text})
                        if prompt:
                            group_key = 'question:' + fingerprint(prompt)
                            stats['questionFingerprintFallback:' + family] += 1
                    if not group_key and source.get('requirePublisherGroup'):
                        raise ValueError(f"Missing publisher group in {family}, {shard['path']} row {index}")
                    if not group_key:
                        stats['contentFingerprintFallback:' + family] += 1
                group = text_hash(group_identity(group_key)) if group_key else content
                join(db, group, group)
                if content in exclusions or group in exclusions:
                    db.execute('INSERT OR IGNORE INTO excluded VALUES (?)', (group,))
                    stats['replayExcluded'] += 1
                existing = db.execute('SELECT group_id FROM docs WHERE content=?', (content,)).fetchone()
                if existing:
                    join(db, group, existing[0])
                    stats['exactDuplicates'] += 1
                    continue
                n_words = sum(len(sentence) for sentence in PROSE.sentences(text))
                if not n_words:
                    stats['filtered'] += 1
                    continue
                sig = shingles(text)
                if group_near_duplicates(db, sig, group):
                    stats['nearDuplicateGrouped'] += 1
                add_signature(db, group, sig)
                document = {
                    'id': content, 'text': text, 'question': select(raw, source.get('questionField', 'question'), ''),
                    'source': source['id'], 'reference': group_key or select(raw, 'id', str(index)),
                    'shard': shard['path'], 'row': index, 'register': source['register'],
                    'subject': select(raw, source.get('subjectField', 'subject')) or coverage(text),
                    'words': n_words, 'latex': sum(len(span) for span in latex_spans(text)),
                }
                db.execute('INSERT INTO docs VALUES (?,?,?)', (content, group, json.dumps(document, ensure_ascii=False)))
                stats['retained'] += 1
                stats['preSplitWords:' + document['register']] += n_words
                if stats['read'] % 10000 == 0:
                    db.commit()
            db.commit()
            print('INGEST SHARD', shard['path'], json.dumps(stats, sort_keys=True), flush=True)
    return stats, files


def emit(db, out, target_words, shard_docs, mix):
    counts, shard_index, shards = {}, Counter(), []
    opened = {}
    blocked_groups = {join(db, key, key) for key, in db.execute('SELECT group_id FROM excluded')}
    with ExitStack() as stack:
        # Sorting by SHA-256 content mixes sources without allocating a document list.
        for group, payload in db.execute('SELECT group_id,payload FROM docs ORDER BY content'):
            group = join(db, group, group)
            if group in blocked_groups:
                continue
            split = split_for(group)
            document = json.loads(payload)
            document['group'] = group
            register = document['register']
            bucket = counts.setdefault(split, {'documents': 0, 'words': 0, 'latex': 0,
                                               'registers': Counter(), 'subjects': Counter(), 'sources': Counter()})
            if split == 'train' and bucket['registers'][register] >= target_words * mix[register]:
                continue
            if split not in opened or bucket['documents'] % shard_docs == 0:
                if split in opened:
                    opened[split][0].close()
                    opened[split][1].close()
                path = out / f'{split}-{shard_index[split]:05d}.jsonl.gz'
                shard_index[split] += 1
                raw = stack.enter_context(open(path, 'wb'))
                # A fixed gzip timestamp makes the shard hash reproducible.
                compressed = gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0, compresslevel=3)
                opened[split] = (stack.enter_context(io.TextIOWrapper(compressed, encoding='utf8')), raw)
                shards.append({'file': path.name, 'split': split})
            opened[split][0].write(json.dumps(document, ensure_ascii=False, separators=(',', ':')) + '\n')
            for key in ('words', 'latex'):
                bucket[key] += document[key]
            bucket['documents'] += 1
            for key in ('register', 'subject', 'source'):
                bucket[key + 's'][document[key]] += document['words']
    for shard in shards:
        shard['sha256'] = file_hash(out / shard['file'])
    return counts, shards


def build(spec_path, out, target_words, shard_docs, exclusions=(), mix=None, development=None):
    if mix is None:
        mix = dict(zip(REGISTERS, (.6, .3, .1)))
    if set(mix) != set(REGISTERS) or any(x < 0 for x in mix.values()) or not abs(sum(mix.values()) - 1) < 1e-8:
        raise ValueError('Register proportions must sum to one')
    out.mkdir(parents=True, exist_ok=False)
    specs = json.loads(spec_path.read_text())
    with sqlite3.connect(out / 'ingest.sqlite') as db:
        db.execute('PRAGMA temp_store=FILE')
        db.execute('CREATE TABLE docs(content TEXT PRIMARY KEY, group_id TEXT NOT NULL, payload TEXT NOT NULL)')
        db.execute('CREATE TABLE groups(id TEXT PRIMARY KEY, parent TEXT NOT NULL)')
        db.execute('CREATE TABLE excluded(group_id TEXT PRIMARY KEY)')
        db.execute('CREATE TABLE signatures(id INTEGER PRIMARY KEY, group_id TEXT NOT NULL, signature BLOB NOT NULL)')
        db.execute('CREATE TABLE bands(band INTEGER NOT NULL, doc INTEGER NOT NULL, PRIMARY KEY(band,doc)) WITHOUT ROWID')
        stats, sources = ingest(db, specs, spec_path.parent, set(exclusions))
        if development is not None:
            development.mkdir(parents=True, exist_ok=False)
            dev_counts, dev_shards = emit(db, development, 100_000_000, shard_docs, mix)
            write_manifest(development, 100_000_000, mix, dev_counts, dev_shards, sources, stats)
        counts, shards = emit(db, out, target_words, shard_docs, mix)
    (out / 'ingest.sqlite').unlink()
    return write_manifest(out, target_words, mix, counts, shards, sources, stats)


def write_manifest(out, target_words, mix, counts, shards, sources, stats):
    manifest = {'version': 1, 'targetTrainWords': target_words, 'targetRegisterMix': mix,
                'counts': counts, 'shards': shards, 'sources': sources, 'ingest': stats,
                'wordTokenizer': 'n233', 'latexTokenizer': 'latex-v2',
                'shortfallTrainWords': max(0, target_words - counts.get('train', {}).get('words', 0)),
                'shortfallByRegister': {name: max(0, round(target_words * proportion) -
                                                        counts.get('train', {}).get('registers', {}).get(name, 0))
                                        for name, proportion in mix.items()},
                'subjectMethod': 'source subject label when available, otherwise keyword heuristic',
                'nearDuplicateMethod': 'bounded bottom-4 shingle minimum candidates and 0.8 Jaccard verification',
                'splitAlgorithm': 'sha256(parent provenance identity), 94/2/2/2 by document group'}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
    return manifest


def documents(directory, split):
    manifest = json.loads((directory / 'manifest.json').read_text())
    for shard in manifest['shards']:
        if shard['split'] == split:
            path = directory / shard['file']
            if file_hash(path) != shard['sha256']:
                raise ValueError(f'Corpus shard hash mismatch: {path.name}')
            yield from records(path)


def audit_groups(pool, development, scratch):
    """Assert publisher-group and document isolation on the emitted, hashed shards."""
    from tempfile import TemporaryDirectory
    audit = Counter()
    if development:
        manifests = [json.loads((path / 'manifest.json').read_text()) for path in (pool, development)]
        for split in SPLITS[1:]:
            hashes = [[shard['sha256'] for shard in manifest['shards'] if shard['split'] == split]
                      for manifest in manifests]
            if hashes[0] != hashes[1]:
                raise ValueError('Raw development holdout differs from the full corpus')
    with TemporaryDirectory(prefix='lemma-groups-', dir=scratch) as temp:
        with sqlite3.connect(Path(temp) / 'audit.sqlite') as db:
            db.execute('CREATE TABLE publisher(id TEXT PRIMARY KEY, group_id TEXT NOT NULL) WITHOUT ROWID')
            db.execute('CREATE TABLE documents(id TEXT PRIMARY KEY, split TEXT NOT NULL, group_id TEXT NOT NULL) WITHOUT ROWID')
            for split in SPLITS:
                for document in documents(pool, split):
                    source = document['source']
                    reference = group_identity(document['reference'])
                    if (not reference or source == 'EleutherAI/proof-pile-2' and not reference.startswith('arxiv.org/') or
                            source == 'hoskinson-center/proof-pile' and not reference.startswith('math.stackexchange.com/questions/') or
                            source == 'HuggingFaceTB/finemath' and not urlsplit(str(document['reference'])).netloc):
                        audit['missingPublisherIdentity:' + source] += 1
                        raise ValueError(f'Emitted corpus missing a publisher identity for {source}')
                    group = document['group']
                    if split_for(group) != split:
                        raise ValueError('Emitted document split differs from its frozen group split')
                    existing = db.execute('SELECT group_id FROM publisher WHERE id=?', (reference,)).fetchone()
                    if existing is None:
                        db.execute('INSERT INTO publisher VALUES (?,?)', (reference, group))
                    elif existing[0] != group:
                        raise ValueError('A publisher identity has inconsistent connected groups')
                    db.execute('INSERT INTO documents VALUES (?,?,?)', (document['id'], split, group))
                    audit['publisherIdentityVerified:' + source] += 1
                    audit['documents:' + split] += 1
                db.commit()
            for split, count in db.execute('SELECT split,COUNT(DISTINCT group_id) FROM documents GROUP BY split'):
                audit['groups:' + split] = count
            if development:
                for split in SPLITS:
                    for document in documents(development, split):
                        current = db.execute('SELECT split,group_id FROM documents WHERE id=?', (document['id'],)).fetchone()
                        if current != (split, document['group']):
                            raise ValueError('Development document is missing from the full pool or in another group/split')
                        audit['nestedDevelopment:' + split] += 1
    return dict(audit)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--target-words', type=int, choices=(100_000_000, 500_000_000, 1_000_000_000), required=True)
    parser.add_argument('--shard-docs', type=int, default=4000)
    parser.add_argument('--development', type=Path, help='Optional nested 100M sample built using the same groups')
    parser.add_argument('--replay-exclusions', type=Path, help='SHA-256 content fingerprints or source group hashes, one per line')
    args = parser.parse_args()
    exclude = args.replay_exclusions.read_text().splitlines() if args.replay_exclusions else ()
    manifest = build(args.sources, args.out, args.target_words, args.shard_docs, exclude, development=args.development)
    print(json.dumps(manifest['counts'], sort_keys=True))


if __name__ == '__main__':
    main()
