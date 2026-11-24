"""Frozen byte BPE shared by neural preparation, graph qualification and the browser."""
import argparse
from collections import Counter
import json
import re
import sqlite3
import shutil
from pathlib import Path
import unicodedata

from corpus import PROSE, SPLITS, documents, file_hash, records, split_for, tutor_pair

RESERVED = dict(pad=0, bos=1, eos=2, question=3, aids=4, draft=5)
BYTE_OFFSET = len(RESERVED)
MERGE_OFFSET = BYTE_OFFSET + 256
VOCABULARY = 16384
ECMASCRIPT_WHITESPACE = frozenset('\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005'
                                '\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff')


def chunk_kind(char):
    if char in ECMASCRIPT_WHITESPACE:
        return 'space'
    category = unicodedata.category(char)[0]
    return 'letter' if category in 'LM' else 'number' if category == 'N' else None


def chunks(text):
    i = 0
    while i < len(text):
        start = i
        i += 1
        if text[start] == '\\':
            while i < len(text) and text[i].isascii() and text[i].isalpha():
                i += 1
        else:
            kind = chunk_kind(text[start])
            if kind:
                while i < len(text) and chunk_kind(text[i]) == kind:
                    i += 1
        yield text[start:i]


class Encoder:
    def __init__(self, merges):
        self.rank = {tuple(pair): MERGE_OFFSET + i for i, pair in enumerate(merges)}
        if len(self.rank) != len(merges):
            raise ValueError('Duplicate tokenizer merge')
        self.pieces = [bytes()] * BYTE_OFFSET + [bytes([i]) for i in range(256)]
        for left, right in merges:
            if not BYTE_OFFSET <= left < len(self.pieces) or not BYTE_OFFSET <= right < len(self.pieces):
                raise ValueError('Invalid tokenizer merge dependency')
            self.pieces.append(self.pieces[left] + self.pieces[right])

    def encode(self, text):
        result = []
        for chunk in chunks(text):
            ids = [byte + BYTE_OFFSET for byte in chunk.encode('utf8')]
            while len(ids) > 1:
                rank = min((self.rank.get(pair, VOCABULARY) for pair in zip(ids, ids[1:])), default=VOCABULARY)
                if rank == VOCABULARY:
                    break
                merged = []
                i = 0
                while i < len(ids):
                    if i + 1 < len(ids) and self.rank.get((ids[i], ids[i + 1])) == rank:
                        merged.append(rank)
                        i += 2
                    else:
                        merged.append(ids[i])
                        i += 1
                ids = merged
            result.extend(ids)
        return result

    def decode(self, ids):
        return b''.join(self.pieces[index] for index in ids).decode('utf8')


def train(corpus, output, sample_words):
    from tokenizers import Tokenizer
    from tokenizers.models import BPE
    from tokenizers.pre_tokenizers import WhitespaceSplit
    from tokenizers.trainers import BpeTrainer

    # Private use Unicode code points encode every byte as a non-whitespace symbol.
    alphabet = [chr(0xE000 + i) for i in range(256)]

    def sample():
        count = 0
        for document in documents(corpus, 'train'):
            for text in (document['text'], document['question']):
                if text:
                    yield ' '.join(''.join(alphabet[byte] for byte in chunk.encode('utf8'))
                                   for chunk in chunks(text))
            count += document['words']
            if count >= sample_words:
                return

    tokenizer = Tokenizer(BPE())
    tokenizer.pre_tokenizer = WhitespaceSplit()
    tokenizer.train_from_iterator(sample(), BpeTrainer(
        vocab_size=VOCABULARY - BYTE_OFFSET, initial_alphabet=alphabet,
        min_frequency=1, show_progress=False,
    ))
    graph = json.loads(tokenizer.to_str())['model']
    known = {char: index + BYTE_OFFSET for index, char in enumerate(alphabet)}
    merges = []
    for pair in graph['merges']:
        left, right = pair.split(' ') if isinstance(pair, str) else pair
        known[left + right] = MERGE_OFFSET + len(merges)
        merges.append([known[left], known[right]])
    if len(merges) + MERGE_OFFSET != VOCABULARY:
        raise ValueError('Train-only sample did not support a 16,384-piece vocabulary')
    output.write_text(json.dumps({'version': 1, 'algorithm': 'utf8-bpe', 'reserved': RESERVED,
                                  'byteOffset': BYTE_OFFSET, 'merges': merges}, separators=(',', ':')) + '\n')


def utf16_clip(text, limit, tail=False):
    data = text.encode('utf-16-le')
    return (data[-2 * limit:] if tail else data[:2 * limit]).decode('utf-16-le', errors='replace')


def prompt_ids(encoder, question, aids, draft, context):
    if context < 8:
        raise ValueError('Context too small for role markers')
    question_ids = encoder.encode(utf16_clip(question, 4096))[:context // 4 - 1]
    aid_ids = encoder.encode(utf16_clip(aids, 4096))[:context // 4 - 1]
    prefix = [RESERVED['bos'], RESERVED['question'], *question_ids,
              RESERVED['aids'], *aid_ids, RESERVED['draft']]
    draft_budget = context - len(prefix)
    if draft_budget <= 0:
        raise ValueError('Context too small for draft')
    return prefix + encoder.encode(utf16_clip(draft, 8192, tail=True))[-draft_budget:]


def accelerated_encoder(encoder):
    from tokenizers import Tokenizer
    from tokenizers.models import BPE
    from tokenizers.pre_tokenizers import WhitespaceSplit
    alphabet = [chr(0xE000 + i) for i in range(256)]
    names = [f'<{name}>' for name in RESERVED] + [
        ''.join(alphabet[byte] for byte in value) for value in encoder.pieces[BYTE_OFFSET:]
    ]
    native = Tokenizer(BPE({piece: i for i, piece in enumerate(names)},
                           [(names[left], names[right]) for left, right in encoder.rank]))
    native.pre_tokenizer = WhitespaceSplit()

    def encode(text):
        prepared = ' '.join(''.join(alphabet[byte] for byte in chunk.encode('utf8'))
                            for chunk in chunks(text))
        return native.encode(prepared).ids

    for text in ('Hausdorff, non-Archimedean', 'Émile’s \u03c0 and \\mathbb{R}', 'A  𝓍\t\n 😀'):
        if encode(text) != encoder.encode(text):
            raise ValueError('Native and portable tokenizer segmentation differ')
    return encode


def write_streams(corpus, out, encoder, target=None, word_target=None, splits=SPLITS):
    import numpy as np
    counts = {}
    encode = accelerated_encoder(encoder)
    mix = {'explanation': .6, 'proof': .3, 'learner': .1}
    for split in splits:
        stats = Counter()
        word_registers = Counter()
        registers, subjects = Counter(), Counter()
        with (open(out / f'{split}.tokens', 'wb') as stream,
              open(out / f'{split}.index', 'wb') as index,
              (out / f'{split}.documents.jsonl').open('w') as trace):
            for document in documents(corpus, split):
                register = document['register']
                if split == 'train' and ((target and registers[register] >= target * mix[register]) or
                                         (word_target and word_registers[register] >= word_target * mix[register])):
                    continue
                ids = [RESERVED['bos'], *encode(document['text']), RESERVED['eos']]
                registers[register] += len(ids)
                word_registers[register] += document['words']
                subjects[document['subject']] += len(ids)
                np.asarray([stats['tokens'], len(ids)], dtype='<u8').tofile(index)
                np.asarray(ids, dtype='<u2').tofile(stream)
                trace.write(json.dumps({'id': document['id'], 'group': document['group']}, separators=(',', ':')) + '\n')
                stats.update(tokens=len(ids), words=document['words'], documents=1)
        counts[split] = {**stats, 'registers': registers, 'wordRegisters': word_registers, 'subjects': subjects}
    return counts


def question_aids(question):
    # These reminders come from the visible question. They contain no answer terms.
    words = (word for sent in PROSE.sentences(question) for word in sent
             if len(word) > 3 and not word.startswith('<'))
    return ' '.join(list(dict.fromkeys(words))[:32])


def partial_role_contexts(corpus, out, encoder, context, split):
    locations = []
    seen = set()
    for document in documents(corpus, split):
        question, reply = tutor_pair(document)
        if not question or not reply:
            continue
        aids = question_aids(question)
        matches = list(re.finditer(r"[^\W_]{3,}(?:[’'-][^\W_]+)*", reply))
        if not matches:
            continue
        position = int(document['id'][:8], 16) % len(matches)
        match = matches[position]
        start = match.start() + max(1, len(match.group()) // 2 - 1)
        previous = prompt_ids(encoder, question, aids, reply[:start], context - 16)
        caret = start + 1
        current = prompt_ids(encoder, question, aids, reply[:caret], context - 16)
        stable = next((index for index, (a, b) in enumerate(zip(previous, current)) if a != b),
                      min(len(previous), len(current)))
        if stable >= min(len(previous), len(current)) or tuple(current) in seen:
            continue
        target = encoder.encode(reply[caret:match.end()])[0]
        if len(current) < 4:
            continue
        seen.add(tuple(current))
        base = prompt_ids(encoder, question, aids, reply[:match.start()], context - 36)
        word = encoder.encode(match.group())
        boundary = encoder.encode(reply[match.end():])[:1] or [RESERVED['eos']]
        if not word or len(word) > 36:
            continue
        locations.append({'ids': current, 'target': target, 'previousIds': previous, 'stablePrefix': stable,
                          'documentId': document['id'], 'layout': 'roles',
                          'wholeWordBase': base, 'wholeWordPieces': word, 'wholeWordNextToken': boundary[0]})
        if len(locations) >= 256:
            break
    path = out / f'adapt-{context}-{split}.partial.jsonl'
    with path.open('w') as file:
        for sample in locations:
            file.write(json.dumps(sample, separators=(',', ':')) + '\n')
    return len(locations)


def role_streams(corpus, out, encoder, context, splits=SPLITS):
    import numpy as np
    encode = accelerated_encoder(encoder)
    counts = {}
    for split in splits:
        stats = Counter()
        with open(out / f'adapt-{context}-{split}.tokens', 'wb') as stream, open(
            out / f'adapt-{context}-{split}.index', 'wb',
        ) as index:
            for document in documents(corpus, split):
                question, answer = tutor_pair(document)
                if not question or not answer:
                    continue
                aids = question_aids(question)
                prefix = prompt_ids(encoder, question, aids, '', context)
                draft_budget = context + 1 - len(prefix)
                draft = [*encode(answer), RESERVED['eos']]
                stride = max(1, draft_budget // 2)
                for offset in range(0, len(draft), stride):
                    end = min(offset + stride, len(draft))
                    start = max(0, end - draft_budget)
                    ids = prefix + draft[start:end]
                    first_gold = len(prefix) + offset - start
                    np.asarray([stats['tokens'], len(ids), first_gold], dtype='<u8').tofile(index)
                    np.asarray(ids, dtype='<u2').tofile(stream)
                    stats.update(tokens=len(ids), targets=end - offset, windows=1)
                stats.update(documents=1)
        if split != 'train':
            stats['partialRetokenizationCases'] = partial_role_contexts(corpus, out, encoder, context, split)
        counts[split] = stats
    return counts


def shared_heldout_files(shared, out, tokenizer_hash, adapt_contexts):
    manifest = json.loads((shared / 'manifest.json').read_text())
    if manifest['files']['tokenizer.json']['sha256'] != tokenizer_hash or 'train' in manifest['counts']:
        raise ValueError('Shared holdout has incompatible tokenizer or contains training documents')
    files = []
    for split in SPLITS[1:]:
        files.extend(f'{split}.{ext}' for ext in ('tokens', 'index', 'documents.jsonl'))
        files.extend(f'adapt-{context}-{split}.{ext}' for context in adapt_contexts
                     for ext in ('tokens', 'index', 'partial.jsonl'))
    for name in files:
        expected = manifest['files'][name]
        artifact = shared / name
        if artifact.stat().st_size != expected['bytes'] or file_hash(artifact) != expected['sha256']:
            raise ValueError(f'Shared holdout asset mismatch: {name}')
        shutil.copyfile(artifact, out / name)
    return manifest


def prepare(corpus, out, sample_words, adapt_contexts=(), target=None, frozen_tokenizer=None,
            word_target=None, *, splits=SPLITS, shared_heldout=None):
    out.mkdir(parents=True, exist_ok=False)
    tokenizer = out / 'tokenizer.json'
    if frozen_tokenizer is None:
        train(corpus, tokenizer, sample_words)
    else:
        tokenizer.write_bytes(frozen_tokenizer.read_bytes())
    encoder = Encoder(json.loads(tokenizer.read_text())['merges'])
    active = ('train',) if shared_heldout else splits
    counts = write_streams(corpus, out, encoder, target, word_target, active)
    roles = {str(context): role_streams(corpus, out, encoder, context, active) for context in adapt_contexts}
    if shared_heldout:
        heldout = shared_heldout_files(shared_heldout, out, file_hash(tokenizer), adapt_contexts)
        counts.update(heldout['counts'])
        for context, values in roles.items():
            values.update(heldout['adaptation'][context])
    files = {path.name: {'bytes': path.stat().st_size, 'sha256': file_hash(path)}
             for path in sorted(out.iterdir())}
    manifest = {'version': 1, 'corpus': file_hash(corpus / 'manifest.json'), 'counts': counts,
                'tokenizerSampleWords': sample_words, 'files': files, 'adaptation': roles, 'targetTrainSubwords': target, 'targetTrainWords': word_target,
                'shortfallTrainSubwords': max(0, target - counts.get('train', {}).get('tokens', 0)) if target else None,
                'sharedHeldoutSha256': file_hash(shared_heldout / 'manifest.json') if shared_heldout else None}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
    return manifest


def verify_prepared(directory, streams, role_case_files=()):
    """Verify only the immutable prepared files used by this run."""
    manifest_path = directory / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    required = ['tokenizer.json']
    required.extend(f'{split}.{extension}' for split in streams for extension in ('tokens', 'index'))
    required.extend(role_case_files)
    for name in required:
        item = manifest['files'].get(name)
        path = directory / name
        if item is None or path.stat().st_size != item['bytes'] or file_hash(path) != item['sha256']:
            raise ValueError(f'Prepared input SHA-256 mismatch or missing entry: {name}')
    return file_hash(manifest_path), manifest['files']['tokenizer.json']['sha256']


def audit_prepared_membership(full, development, reference, scratch):
    """Prove identical held-out inputs and nested membership before training."""
    from tempfile import TemporaryDirectory
    pools = {'prepared-dev': development, 'prepared-reference': reference}
    if full:
        pools = {'prepared': full, **pools}
    first = next(iter(pools))
    manifests = {name: json.loads((path / 'manifest.json').read_text()) for name, path in pools.items()}
    tokenizers = {manifest['files']['tokenizer.json']['sha256'] for manifest in manifests.values()}
    if len(tokenizers) != 1:
        raise ValueError('Controlled corpora must share an immutable tokenizer')
    for split in SPLITS[1:]:
        for ext in ('index', 'tokens', 'documents.jsonl'):
            file = f'{split}.{ext}'
            hashes = {manifest['files'][file]['sha256'] for manifest in manifests.values()}
            if len(hashes) != 1:
                raise ValueError(f'Controlled-corpus holdout differs for {file}')
    result = {}
    with TemporaryDirectory(prefix='lemma-prepared-membership-', dir=scratch) as temp:
        with sqlite3.connect(Path(temp) / 'audit.sqlite') as db:
            db.execute('CREATE TABLE included(id TEXT PRIMARY KEY, group_id TEXT NOT NULL, split TEXT NOT NULL, dev INT NOT NULL DEFAULT 0) WITHOUT ROWID')
            for name, path in pools.items():
                result[name] = {}
                for split in SPLITS:
                    filename = f'{split}.documents.jsonl'
                    file = path / filename
                    if file_hash(file) != manifests[name]['files'][filename]['sha256']:
                        raise ValueError(f'Prepared document trace hash mismatch for {name}/{filename}')
                    count = 0
                    for row in records(file):
                        document, group = row['id'], row['group']
                        if split_for(group) != split:
                            raise ValueError('Prepared document group is in another frozen split')
                        if name == first:
                            db.execute('INSERT INTO included(id,group_id,split,dev) VALUES (?,?,?,?)',
                                       (document, group, split, int(name == 'prepared-dev')))
                        else:
                            current = db.execute('SELECT group_id,split,dev FROM included WHERE id=?', (document,)).fetchone()
                            if current is None or current[:2] != (group, split) or name == 'prepared-reference' and current[2] != 1:
                                raise ValueError('Prepared data pool is not a nested subset of its parent')
                            if name == 'prepared-dev':
                                db.execute('UPDATE included SET dev=1 WHERE id=?', (document,))
                        count += 1
                    expected = manifests[name]['counts'][split].get('documents', 0)
                    if count != expected:
                        raise ValueError(f'Prepared document count disagrees for {name}/{split}')
                    result[name][split] = count
                    db.commit()
    return {'version': 1, 'passed': True, 'scope': 'all' if full else 'dev-and-reference',
            'counts': result, 'tokenizerSha256': tokenizers.pop(),
            'preparedManifestSha256': {name: file_hash(path / 'manifest.json') for name, path in pools.items()}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--sample-words', type=int, default=3_000_000)
    parser.add_argument('--adapt-contexts', nargs='*', type=int, choices=(512, 1024), default=[])
    parser.add_argument('--target-train-subwords', type=int, choices=(100_000_000, 500_000_000, 1_000_000_000))
    parser.add_argument('--frozen-tokenizer', type=Path)
    parser.add_argument('--target-train-words', type=int)
    args = parser.parse_args()
    print(json.dumps(prepare(args.corpus, args.out, args.sample_words, args.adapt_contexts,
                             args.target_train_subwords, args.frozen_tokenizer, args.target_train_words)['counts'], sort_keys=True))


if __name__ == '__main__':
    main()
