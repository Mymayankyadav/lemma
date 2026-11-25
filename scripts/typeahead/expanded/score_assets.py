"""Evaluate serialized word models on identical frozen word events and fit subject weights."""
import argparse
from bisect import bisect_left
from collections import Counter
from functools import lru_cache
import json
import math
import re
from pathlib import Path
import struct

import numpy as np

from corpus import PROSE, documents, file_hash, tutor_pair
from fit import fit_mixtures
from ngram import BOS, EOS, UNK, Model


def sections(data):
    offset = 32

    def read(dtype, count):
        nonlocal offset
        values = np.frombuffer(data, dtype=dtype, count=count, offset=offset)
        offset += (values.nbytes + 3) // 4 * 4
        return values

    return read


class Legacy:
    def __init__(self, data):
        _, _, size, bigrams, histories, trigrams, vocab_bytes, _ = struct.unpack_from('<4s7I', data)
        read = sections(data)
        self.vocab = read('u1', vocab_bytes).tobytes().decode('utf8').split('\n')
        self.uni = np.exp(-.07 * read('u1', size))
        self.beta = np.exp(.1 * read('i1', size))
        self.start = read('<u4', size + 1)
        self.words = read('<u2', bigrams)
        self.bi = np.exp(-.07 * read('u1', bigrams))
        self.history = read('<u4', histories)
        self.tri_start = read('<u4', histories + 1)
        self.alpha = np.exp(.1 * read('i1', histories))
        self.tri_words = read('<u2', trigrams)
        self.tri = np.exp(-.07 * read('u1', trigrams))
        self.uni_mass = float(self.uni.sum())
        self.bi_mass = np.empty(size, dtype='float64')
        for w in range(size):
            start, end = self.start[w:w+2]
            self.bi_mass[w] = self.bi[start:end].sum() + self.beta[w] * (
                self.uni_mass - self.uni[self.words[start:end]].sum()
            )

    def bi_prob(self, last, word):
        start, end = self.start[last:last+2]
        i = bisect_left(self.words, word, start, end)
        return self.bi[i] if i < end and self.words[i] == word else self.beta[last] * self.uni[word]

    @lru_cache(maxsize=100_000)
    def tri_mass(self, idx, last):
        start, end = self.tri_start[idx:idx+2]
        lower = math.fsum(self.bi_prob(last, word) for word in self.tri_words[start:end])
        return self.tri[start:end].sum() + self.alpha[idx] * (self.bi_mass[last] - lower)

    def probability(self, history, word):
        previous, last = history[-2:]
        key = previous * 65536 + last
        idx = bisect_left(self.history, key)
        probability = self.bi_prob(last, word)
        if idx == len(self.history) or self.history[idx] != key:
            return probability / self.bi_mass[last]
        start, end = self.tri_start[idx:idx+2]
        i = bisect_left(self.tri_words, word, start, end)
        raw = self.tri[i] if i < end and self.tri_words[i] == word else self.alpha[idx] * probability
        return raw / self.tri_mass(idx, last)


def model_file(path):
    data = path.read_bytes()
    if data.startswith(b'LMN1'):
        legacy = Legacy(data)
        return legacy.vocab, legacy, 3
    magic, order, size, header, total_rows, total_edges, vocab_bytes = struct.unpack_from('<8s6I', data)
    if magic not in (b'LEMMANG2', b'LEMMANG3') or header != 32:
        raise ValueError('Invalid word model asset')
    read = sections(data)
    vocab = read('u1', vocab_bytes).tobytes().decode('utf8').split('\n')
    model = Model(read('<f4', size).astype('float64'))
    for n in range(1, order):
        rows, edges = map(int, read('<u4', 2))
        history = read('<u2', rows * n).reshape(-1, n)
        offsets = read('<u4', rows + 1)
        alpha = read('<f4', rows)
        words = read('<u2', edges)
        if magic == b'LEMMANG3':
            code = read('<u2', edges)
            probability = np.where(code == 65535, 0., np.exp2(-code.astype('float64') / 2048)).astype('<f4')
        else:
            probability = read('<f4', edges)
        decoded = {}
        for i, state in enumerate(history):
            lo, hi = offsets[i:i+2]
            explicit = dict(zip(map(int, words[lo:hi]), map(float, probability[lo:hi]), strict=True))
            decoded[tuple(map(int, state))] = (explicit, float(alpha[i]))
        model.rows.append(decoded)
        total_rows -= rows
        total_edges -= edges
    if total_rows or total_edges or len(vocab) != size:
        raise ValueError('Asset counts disagree with header')
    return vocab, model, order


def loaded(directory):
    manifest = json.loads((directory / 'manifest.json').read_text())
    file = manifest['file']
    info = file if isinstance(file, dict) else manifest
    binary = directory / (file if isinstance(file, str) else file['path'])
    if binary.stat().st_size != info['bytes'] or file_hash(binary) != info['sha256']:
        raise ValueError('Cannot verify model asset')
    return model_file(binary)


def shared_events(corpus, split, legacy_holdout, limit):
    if legacy_holdout:
        from kn_build import is_held_out
    seen = 0
    for doc in documents(corpus, split):
        if legacy_holdout and not is_held_out(doc['text']):
            continue
        for sentence in PROSE.sentences(doc['text']):
            draft = []
            for token in [*sentence, '</s>']:
                if token not in ('<m>', '<num>'):
                    yield doc, draft, token
                    seen += 1
                    if limit and seen >= limit:
                        return
                draft.append(token)


def probability(model, order, lookup, draft, target):
    history = ([BOS] * (order - 1) + [lookup.get(token, UNK) for token in draft[-(order - 1):]])[-(order - 1):]
    word_id = lookup.get(target, UNK)
    return model.probability(tuple(history), word_id), word_id


def evaluate(corpus, split, directories, legacy_holdout, limit):
    models = {}
    for name, directory in directories.items():
        vocab, model, order = loaded(directory)
        models[name] = (model, order, {word: i for i, word in enumerate(vocab)})
    sums = {name: Counter() for name in models}
    subjects = {}
    for doc, draft, target in shared_events(corpus, split, legacy_holdout, limit):
        subject = subjects.setdefault(doc['subject'], {name: Counter() for name in models})
        for name, (model, order, lookup) in models.items():
            prob, word_id = probability(model, order, lookup, draft, target)
            for counter in (sums[name], subject[name]):
                counter['negativeLogLikelihood'] -= math.log(prob)
                counter['targets'] += 1
                counter['lexicalTargets'] += word_id != EOS
                counter['oov'] += word_id == UNK
    for distribution in (sums, *subjects.values()):
        for counts in distribution.values():
            if counts['targets']:
                counts['perplexity'] = math.exp(counts['negativeLogLikelihood'] / counts['targets'])
            if counts['lexicalTargets']:
                counts['oovRate'] = counts['oov'] / counts['lexicalTargets']
    return {'version': 1, 'corpusSha256': file_hash(corpus / 'manifest.json'), 'split': split,
            'legacyHoldoutOnly': legacy_holdout, 'aggregate': sums, 'subjects': subjects}


def fit_subjects(corpus, general, subjects, temporary, limit):
    vocab, model, order = loaded(general)
    lookup = {word: i for i, word in enumerate(vocab)}
    scoped = {}
    for name, directory in subjects.items():
        shared, subject_model, subject_order = loaded(directory)
        if vocab != shared:
            raise ValueError('Subject pack vocabulary differs from general')
        scoped[name] = subject_model, subject_order
    emitted = 0
    with temporary.open('w') as output:
        for doc in documents(corpus, 'calibration'):
            question, answer = tutor_pair(doc)
            if not question or not answer:
                continue
            qcache = Counter(re.findall(r'[A-Za-z]{2,32}', question.lower()))
            question_size = sum(qcache.values())
            dcache = Counter()
            draft_size = 0
            for tokens in PROSE.sentences(answer):
                sentence = []
                for target in tokens:
                    if target in lookup and not target.startswith('<'):
                        prob, _ = probability(model, order, lookup, sentence, target)
                        values = {'general': prob}
                        if doc['subject'] in scoped:
                            specific, s_order = scoped[doc['subject']]
                            values['subject'] = probability(specific, s_order, lookup, sentence, target)[0]
                        if question_size:
                            values['question'] = qcache[target] / question_size
                        if draft_size:
                            values['draft'] = dcache[target] / draft_size
                        output.write(json.dumps({'subject': doc['subject'], 'probability': values}) + '\n')
                        emitted += 1
                    sentence.append(target)
                    if not target.startswith('<'):
                        for word in re.findall(r'[A-Za-z]{2,32}', target):
                            dcache[word] += 1
                            draft_size += 1
                    if limit and emitted >= limit:
                        break
                if limit and emitted >= limit:
                    break
            if limit and emitted >= limit:
                break
    result = fit_mixtures(temporary)
    result['qualification'] = 'offline lexical diagnostic; browser-aligned mixture must use replay components'
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus', type=Path, required=True)
    parser.add_argument('--split', choices=('validation', 'test'), default='validation')
    parser.add_argument('--model', action='append', nargs=2, metavar=('NAME', 'PATH'), required=True)
    parser.add_argument('--legacy-holdout', action='store_true')
    parser.add_argument('--limit', type=int)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = evaluate(args.corpus, args.split, {name: Path(p) for name, p in args.model},
                      args.legacy_holdout, args.limit)
    args.out.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')


if __name__ == '__main__':
    main()
