#!/usr/bin/env python3
"""Pack and reconstruct a pinned student slate dataset using only train-shard references.

The recipe stores document ordinals, word offsets, prefix lengths and candidate
vocabulary IDs. It contains no source passages, questions, drafts or count weights.
It can only reproduce the pinned JSONL from the exact pinned corpus manifest.
"""
import argparse
from collections import Counter
import hashlib
import json
import lzma
from pathlib import Path
import re

from corpus import documents, file_hash, tutor_pair
from data_audit import clean

CORPUS_SHA256 = '1a0406ec50ef4c0389e5aabad15d51717d4689f6d405c66594c1c1d0ea561c2b'
DATA_SHA256 = '283dba8d2b4102f4613e53b84ad9d0b04b1ad05640d17512aa9dab54ce77aad8'
MODEL_SHA256 = 'c97bacd0de80f08a66f65a76c610c8fa6076daaf70f328f4eb8be684e7ef9ba8'
EXPECTED_ROWS, EXPECTED_GROUPS = 20000, 5000
WORD = re.compile(r'[a-z]{3,24}(?=[ \t])')


def source_text(doc):
    question, reply = tutor_pair(doc)
    body = reply if question and reply else doc['text']
    question = question[:1000] if question and reply else ''
    body, _, reason = clean(body)
    return (question, body) if not reason and body else None


def split_for_group(group):
    digest = hashlib.sha256(('student-split:' + group).encode()).hexdigest()
    return 'calibration' if int(digest[:16], 16) % 5 == 0 else 'fit'


def check_corpus(corpus):
    if file_hash(corpus/'manifest.json') != CORPUS_SHA256:
        raise ValueError('source corpus manifest differs from the pinned training archive')


def position_for(body, before, gold):
    start = 0
    while True:
        found = body.find(before + gold, start)
        if found < 0:
            return None
        pos = found + len(before)
        match = WORD.match(body, pos)
        if match and match.group() == gold and body[max(0, pos-1000):pos] == before:
            return pos
        start = found + 1


def encode(data, corpus, out):
    """Encode a pinned JSONL as a compact xz recipe; never store source text."""
    data, corpus, out = map(Path, (data, corpus, out))
    check_corpus(corpus)
    if file_hash(data) != DATA_SHA256:
        raise ValueError('input JSONL differs from the frozen student dataset')
    if out.exists():
        raise FileExistsError(out)
    with data.open(encoding='utf8') as stream:
        rows = [json.loads(line) for line in stream if line.strip()]
    if len(rows) != EXPECTED_ROWS or len(rows) % 4:
        raise ValueError('expected 20,000 paired rows')
    vocabulary = sorted({word for row in rows for word in row['candidates']})
    vocab_ids = {word:i for i,word in enumerate(vocabulary)}
    pending = {}
    for i in range(0, len(rows), 4):
        block = rows[i:i+4]
        group = block[0]['group']
        if group in pending or any(r['group'] != group or r['split'] != split_for_group(group) for r in block):
            raise ValueError('group blocks or deterministic split do not match the contract')
        for j in (0, 2):
            a, b = block[j:j+2]
            if (a['kind'] != 'boundary' or b['kind'] != 'prefix' or a['prefix'] or
                a['gold'] != b['gold'] or a['question'] != b['question'] or
                b['draft'] != a['draft'] + b['prefix'] or
                not b['gold'].startswith(b['prefix']) or len(b['prefix']) not in (1,2,3)):
                raise ValueError('boundary/prefix pair differs from the expected source contract')
        pending[group] = (i//4, block)
    entries = [None] * (len(rows)//4)
    scanned = 0
    for ordinal, doc in enumerate(documents(corpus, 'train')):
        scanned = ordinal + 1
        item = pending.get(doc['group'])
        if item is None:
            continue
        source = source_text(doc)
        if source is None:
            continue
        question, body = source
        index, block = item
        if question != block[0]['question']:
            continue
        positions = [position_for(body, block[j]['draft'], block[j]['gold']) for j in (0,2)]
        if any(position is None for position in positions):
            continue
        packed = [ordinal]
        for j, pos in zip((0,2), positions):
            a,b = block[j:j+2]
            packed.append([pos, len(b['prefix']), [vocab_ids[w] for w in a['candidates']],
                           [vocab_ids[w] for w in b['candidates']]])
        entries[index] = packed
        del pending[doc['group']]
        if not pending:
            break
    if pending:
        raise ValueError(f'{len(pending)} groups could not be located in pinned train shards')
    payload = {'version':1, 'sourceSplit':'train', 'corpusManifestSha256':CORPUS_SHA256,
               'dataSha256':DATA_SHA256, 'countModelSha256':MODEL_SHA256,
               'rows':len(rows), 'groups':len(entries), 'trainDocumentsScanned':scanned,
               'vocabulary':vocabulary, 'entries':entries}
    raw = json.dumps(payload, ensure_ascii=False, separators=(',',':')).encode('utf8')
    out.write_bytes(lzma.compress(raw, format=lzma.FORMAT_XZ, preset=9))
    return {'recipeSha256':file_hash(out), 'recipeBytes':out.stat().st_size,
            'dataSha256':DATA_SHA256, 'corpusManifestSha256':CORPUS_SHA256, 'rows':len(rows), 'groups':len(entries)}


def reconstruct(recipe, corpus, output):
    """Recreate the exact frozen UTF-8 JSONL using only pinned archived train shards."""
    recipe, corpus, output = map(Path, (recipe, corpus, output))
    check_corpus(corpus)
    if output.exists():
        raise FileExistsError(output)
    payload = json.loads(lzma.decompress(recipe.read_bytes(), format=lzma.FORMAT_XZ))
    if (payload.get('version') != 1 or payload.get('sourceSplit') != 'train' or
        payload.get('corpusManifestSha256') != CORPUS_SHA256 or payload.get('dataSha256') != DATA_SHA256 or
        payload.get('countModelSha256') != MODEL_SHA256 or payload.get('rows') != EXPECTED_ROWS or
        payload.get('groups') != EXPECTED_GROUPS or len(payload.get('entries', [])) != EXPECTED_GROUPS):
        raise ValueError('recipe is not for the pinned train dataset')
    vocabulary, entries = payload['vocabulary'], payload['entries']
    ordinals = {entry[0] for entry in entries}
    if len(ordinals) != len(entries) or any(not isinstance(i, int) or i < 0 for i in ordinals):
        raise ValueError('invalid train-document ordinals')
    resolved = {}
    for ordinal, doc in enumerate(documents(corpus, 'train')):
        if ordinal not in ordinals:
            continue
        source = source_text(doc)
        if source is None:
            raise ValueError('referenced source no longer cleans successfully')
        resolved[ordinal] = (doc['group'], *source)
        if len(resolved) == len(ordinals):
            break
    if len(resolved) != len(ordinals):
        raise ValueError('referenced training documents are missing')
    temporary = output.with_name(output.name+'.partial')
    if temporary.exists():
        raise FileExistsError(temporary)
    rows_written = 0
    try:
        with temporary.open('w', encoding='utf8', newline='\n') as stream:
            for ordinal, *positions in entries:
                group, question, body = resolved[ordinal]
                split = split_for_group(group)
                for pos, stem_size, boundary_ids, prefix_ids in positions:
                    match = WORD.match(body, pos)
                    if not match or stem_size not in (1,2,3):
                        raise ValueError('invalid source word offset')
                    gold = match.group()
                    if stem_size >= len(gold):
                        raise ValueError('prefix must leave an untyped remainder')
                    before, stem = body[max(0, pos-1000):pos], gold[:stem_size]
                    for kind, prefix, candidate_ids in [('boundary','',boundary_ids),('prefix',stem,prefix_ids)]:
                        if (len(candidate_ids)>16 or any(not isinstance(i,int) or i<0 or i>=len(vocabulary) for i in candidate_ids)):
                            raise ValueError('invalid candidate IDs')
                        candidates = [vocabulary[i] for i in candidate_ids]
                        if len(set(candidates)) != len(candidates) or any(not w.startswith(prefix) or w == prefix for w in candidates):
                            raise ValueError('invalid candidate prefix or duplication')
                        row = {'group':group, 'split':split, 'kind':kind, 'question':question,
                               'draft':before+prefix, 'prefix':prefix, 'gold':gold, 'candidates':candidates}
                        stream.write(json.dumps(row, ensure_ascii=False, separators=(',',':'))+'\n')
                        rows_written += 1
        if rows_written != payload['rows'] or file_hash(temporary) != DATA_SHA256:
            raise ValueError('reconstructed JSONL does not match the pinned data hash')
        temporary.rename(output)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return {'dataSha256':DATA_SHA256, 'recipeSha256':file_hash(recipe), 'rows':rows_written,
            'groups':len(entries), 'corpusManifestSha256':CORPUS_SHA256}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    subs = p.add_subparsers(dest='command', required=True)
    e = subs.add_parser('encode')
    e.add_argument('--data', type=Path, required=True)
    e.add_argument('--corpus', type=Path, required=True)
    e.add_argument('--out', type=Path, required=True)
    r = subs.add_parser('reconstruct')
    r.add_argument('--recipe', type=Path, required=True)
    r.add_argument('--corpus', type=Path, required=True)
    r.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    result = encode(a.data, a.corpus, a.out) if a.command == 'encode' else reconstruct(a.recipe, a.corpus, a.out)
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main()
