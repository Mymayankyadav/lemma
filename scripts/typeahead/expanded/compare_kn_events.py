#!/usr/bin/env python3
"""Compare serialized general KN assets on the same public development word events.

Count-only retrieval diagnostic: not the displayed UI, subject mixtures or action cost.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
from corpus import PROSE, file_hash
from score_assets import loaded

BREAK = re.compile(r'[.!?]\s+|\n\s*\n')
TOKEN = re.compile(r"zzmathzz|[a-z]+(?:'[a-z]+)?|\d+")
IMAGE = re.compile(r'\[\[lemma-image:[^\]]*\]\]')


def history(prefix, lookup, width):
    text = IMAGE.sub(' ', PROSE.MATH.sub(' zzmathzz ', prefix)).lower()
    starts = list(BREAK.finditer(text))
    text = text[starts[-1].end():] if starts else text
    words = TOKEN.findall(text)[-width:]
    words = ['<m>' if w == 'zzmathzz' or (len(w) == 1 and w.isalpha() and w not in ('a', 'i')) else
             '<num>' if w[0].isdigit() else w for w in words]
    ids = [lookup.get(w, 3) for w in words]
    return tuple([0] * (width - len(ids)) + ids)


def suggestions(vocab, model, order, lookup, prefix, stem, top):
    ids = history(prefix, lookup, order - 1)
    candidates = set(top)
    for length in range(min(len(ids), len(model.rows)-1), 0, -1):
        row = model.rows[length].get(ids[-length:])
        if row:
            candidates.update(row[0])
    candidates = [i for i in candidates if i > 4 and vocab[i].startswith(stem)]
    return [vocab[i] for i in sorted(candidates, key=lambda i:(-model.probability(ids, i), i))[:3]]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--split', required=True, type=Path)
    p.add_argument('--model', nargs=2, action='append', required=True, metavar=('NAME','DIRECTORY'))
    p.add_argument('--out', required=True, type=Path)
    a = p.parse_args()
    events = {}
    with (a.split/'events.jsonl').open() as f:
        for line in f:
            item = json.loads(line)
            if item['eventId'] in events:
                raise ValueError('duplicate event')
            events[item['eventId']] = item
    gold = {}
    with (a.split/'gold.jsonl').open() as f:
        for line in f:
            item = json.loads(line)
            if item['eventId'] in gold:
                raise ValueError('duplicate gold event')
            gold[item['eventId']] = item
    if events.keys() != gold.keys():
        raise ValueError('events/gold mismatch')
    prepared = []
    for event_id, event in events.items():
        target = gold[event_id]
        prefix = event['prefix']
        if hashlib.sha256(prefix.encode()).hexdigest() != target['prefixSha256']:
            raise ValueError('prefix checksum mismatch')
        # Require the complete visible insertion to be a lowercase ASCII word and
        # one space: this avoids claiming exactness across capitalization/notation.
        if target['kind'] != 'word' or not re.fullmatch(r'[a-z]{2,} ', target['exactInsertion']):
            continue
        word = target['exactInsertion'][:-1]
        if target['boundary']:
            stem, before, kind = '', prefix, 'boundary'
        else:
            match = re.search(r'[a-z]+$', prefix)
            if not match or not word.startswith(match.group()):
                continue
            stem, before, kind = match.group(), prefix[:match.start()], 'prefix'
        prepared.append((event_id, kind, before, stem, word))
    if not prepared:
        raise ValueError('no admissible word events')
    hits, outputs = {}, {}
    for name, path in a.model:
        vocab, model, order = loaded(Path(path))
        top = sorted(range(5, len(vocab)), key=lambda i:(-model.unigram[i], i))[:256]
        lookup = {word:i for i, word in enumerate(vocab)}
        outcomes, counts = {}, Counter()
        for event_id, kind, before, stem, word in prepared:
            found = word in suggestions(vocab, model, order, lookup, before, stem, top)
            outcomes[event_id] = found
            counts[kind+'Denominator'] += 1
            counts[kind+'Hits'] += found
        hits[name] = outcomes
        outputs[name] = {'assetSha256':file_hash(Path(path)/'model.bin'), 'counts':dict(counts)}
    baselines = list(dict.fromkeys([a.model[0][0]] + (['D1'] if 'D1' in hits else [])))
    for name in outputs:
        for baseline in baselines:
            comparisons = {}
            for kind in ('boundary','prefix'):
                relevant = [event_id for event_id, k, *_ in prepared if k == kind]
                comparisons[kind] = {'gained':sum(hits[name][i] and not hits[baseline][i] for i in relevant),
                                     'lost':sum(hits[baseline][i] and not hits[name][i] for i in relevant),
                                     'denominator':len(relevant)}
            outputs[name]['pairedVersus'+baseline] = comparisons
    result = {'scope':'public development text-only general count retrieval; no subject pack, touch decoder, UI, or action cost',
              'eligibility':'lowercase ASCII word of at least 2 letters followed by a space; exact matching on the fixed visible input',
              'eventsSha256':file_hash(a.split/'events.jsonl'), 'goldSha256':file_hash(a.split/'gold.jsonl'),
              'eventsTotal':len(events), 'eligibleEvents':len(prepared), 'models':outputs}
    a.out.write_text(json.dumps(result, indent=2, sort_keys=True)+'\n')


if __name__ == '__main__':
    main()
