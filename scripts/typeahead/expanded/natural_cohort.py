"""Freeze independent public Q/A groups before fitting a menu or scoring a release."""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import re
import sqlite3

from corpus import coverage, documents, file_hash, fingerprint, group_identity, records, text_hash, tutor_pair
from replay_sample import DEFAULT_ROUTE, boundary_cases, jsonl, math_spans


def exclude_training(corpus, legacy, previous, output):
    receipt = json.loads(legacy.with_name('legacy-audit.json').read_bytes())
    if not receipt.get('passed') or receipt['trainingIdentitySha256'] != file_hash(legacy):
        raise ValueError('Unverified legacy exclusion index')
    temp = output.with_suffix('.building')
    temp.unlink(missing_ok=True)
    db = sqlite3.connect(temp)
    db.execute('CREATE TABLE blocked (key TEXT PRIMARY KEY) WITHOUT ROWID')
    count = 0
    def add(values):
        db.executemany('INSERT OR IGNORE INTO blocked VALUES (?)', ((value,) for value in values if value))
    for row in documents(corpus, 'train'):
        question, reply = tutor_pair(row)
        add([group_identity(row.get('reference', '')), row.get('group'), row['id'],
             *(fingerprint(value) for value in (row['text'], question, reply) if value)])
        count += 1
    base = json.loads(legacy.read_bytes())
    if len(base) != 3 or not all(isinstance(column, list) for column in base):
        raise ValueError('Expected a verified legacy training identity index')
    for column in base:
        add(column)
    for path in previous:
        for row in records(path):
            add([row.get('documentGroup'), row.get('answerId'),
                 *(fingerprint(row[key]) for key in ('question', 'answer') if row.get(key))])
    provenance = dict(documents=count, corpus=file_hash(corpus / 'manifest.json'), legacy=file_hash(legacy),
                      earlier=sorted(set(map(file_hash, previous))))
    db.execute('CREATE TABLE provenance (json TEXT NOT NULL)')
    db.execute('INSERT INTO provenance VALUES (?)', (json.dumps(provenance, sort_keys=True),))
    db.commit()
    db.close()
    temp.replace(output)
    print(json.dumps(provenance), flush=True)


def excerpt(answer, long):
    # Complete sentences or complete paragraphs. The schedule is independent of all model outputs.
    for paragraph in re.split(r'\n\s*\n', answer):
        text = ' '.join(paragraph.split())
        if re.search(r'https?://|<[^>]+>', text):
            continue
        segments = re.split(r'(?<=[.!?]) +', text)
        for i in range(len(segments)):
            result = ''
            for part in segments[i:]:
                result = (result + ' ' + part).strip()
                if len(result) > (260 if long else 120):
                    break
                if len(result) >= (121 if long else 48) and not math_spans(result)[1]:
                    return result
    return ''


def freeze(source, exclusion, out, fit, validation, final):
    db = sqlite3.connect(f'file:{exclusion}?mode=ro', uri=True)
    previous = json.loads(db.execute('SELECT json FROM provenance').fetchone()[0])
    groups, texts, bins = set(), set(), defaultdict(list)
    drops = Counter()
    for row in records(source):
        identity = group_identity(row['url'])
        group = text_hash(identity)
        long = int(group[:2], 16) % 2 == 0
        answer = excerpt(row['answer'], long)
        if not answer:
            drops['lengthOrMarkup'] += 1
            continue
        hashes = {fingerprint(text) for text in (row['question'], row['answer'], answer)}
        keys = [identity, group, *hashes]
        if (group in groups or texts.intersection(hashes) or
                db.execute('SELECT 1 FROM blocked WHERE key IN (' + ','.join('?' for _ in keys) + ')', keys).fetchone()):
            drops['duplicateOrTraining'] += 1
            continue
        subject = coverage(row['question'])
        cases = list(boundary_cases(answer, subject, group, DEFAULT_ROUTE, equation=True))
        if not cases:
            continue
        groups.add(group)
        texts.update(hashes)
        bins[row['source'], long, bool(math_spans(answer)[0])].append(
            (group, dict(answerId=group, documentGroup=group, answer=answer, question=row['question'],
                         subject=subject, source=row['source'], questionUrl=row['url'], url='https://' + row['source'] + '/a/' + row['answerId'],
                         answerSha256=fingerprint(row['answer'])), cases))
    for bucket in bins.values():
        bucket.sort(reverse=True)
    schedule = []
    while any(bins.values()):
        for key in sorted(bins):
            if bins[key]:
                schedule.append(bins[key].pop())
    if len(schedule) < fit + validation + final:
        raise ValueError(f'{len(schedule)} distinct eligible threads, need {fit+validation+final}')
    manifest = dict(source=file_hash(source), exclusions=previous, dropped=dict(drops), splits={})
    offset = 0
    out.mkdir(parents=True, exist_ok=True)
    for name, size in [('fit', fit), ('validation', validation), ('final', final)]:
        split = out / name
        split.mkdir(exist_ok=True)
        selected = schedule[offset:offset+size]
        offset += size
        answers, contexts, events, gold = [], [], [], []
        for _, sample, cases in selected:
            answers.append(sample)
            contexts.append({k: v for k, v in sample.items() if k not in ('answer', 'answerSha256', 'url')})
            for event, outcome in cases:
                # Add a reproducible in-word edit beside the natural boundary. Preserve separate denominators.
                if outcome['kind'] == 'word' and len(outcome['exactInsertion'].rstrip()) >= 4:
                    lexical = outcome['exactInsertion'].rstrip()
                    cut = 1 + int(text_hash(event['eventId'])[:2], 16) % (len(lexical) - 1)
                    begin = len(event['prefix'].encode('utf-16-le')) // 2
                    stem = lexical[:cut]
                    typed = dict(event, eventId=event['eventId']+'-prefix', prefix=event['prefix'] + stem)
                    stop = begin + len(stem.encode('utf-16-le')) // 2
                    target = outcome['exactInsertion']
                    events.append(typed)
                    gold.append(dict(outcome, eventId=typed['eventId'], boundary=False, exactGhost=outcome['exactGhost'][cut:], prefixSha256=text_hash(typed['prefix']),
                                     edit=dict(start=begin, end=stop, insert=target, caret=begin+len(target.encode('utf-16-le'))//2)))
                caret = len(event['prefix'].encode('utf-16-le')) // 2
                new_caret = caret + len(outcome['exactInsertion'].encode('utf-16-le')) // 2
                gold.append(dict(outcome, edit=dict(start=caret, end=caret, insert=outcome['exactInsertion'], caret=new_caret)))
                events.append(event)
        for filename, rows in [('answers', answers), ('contexts', contexts), ('events', events), ('gold', gold)]:
            jsonl(split / (filename + '.jsonl'), rows)
        manifest['splits'][name] = dict(threads=len(answers), events=len(events), sources=dict(Counter(r['source'] for r in answers)),
            files={p.name: file_hash(p) for p in sorted(split.glob('*.jsonl'))})
    (out/'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest), flush=True)


def middle_diagnostic(split, out):
    """One deterministic interior word repair per eligible public development excerpt."""
    if split.name != 'validation':
        raise ValueError('Use the development split for the interior-edit diagnostic')
    parent = json.loads((split.parent/'manifest.json').read_bytes())
    locked = parent['splits'][split.name]['files']
    if file_hash(split/'answers.jsonl') != locked['answers.jsonl']:
        raise ValueError('Development answers differ from the frozen schedule')
    dest = out/'middle'
    dest.mkdir(parents=True,exist_ok=True)
    answers, contexts, events, gold = [], [], [], []
    units = lambda text: len(text.encode('utf-16-le')) // 2
    for sample in records(split/'answers.jsonl'):
        answer = sample['answer']
        if any(math_spans(answer)):
            continue
        options = [m for m in re.finditer(r'(?<![\w-])[A-Za-z]{5,}(?![\w-])',answer)
                   if m.start() > 0 and len(answer)-m.end() >= 4]
        if not options:
            continue
        aid = sample['answerId']
        word = min(options,key=lambda m:text_hash(aid+str(m.start())))
        cut = 2 + int(aid[:4],16) % (len(word[0])-3)
        prefix = answer[:word.start()+cut]
        draft = prefix + answer[word.end():]
        event = dict(answerId=aid,eventId=aid+'-interior',route=sample['route'] if 'route' in sample else DEFAULT_ROUTE,
                     prefix=prefix,draft=draft)
        events.append(event)
        start=units(answer[:word.start()])
        gold.append(dict(answerId=aid,eventId=event['eventId'],boundary=False,kind='word',
                         prefixSha256=text_hash(prefix),draftSha256=text_hash(draft),exactGhost=word[0][cut:],
                         edit=dict(start=start,end=units(prefix),insert=word[0],caret=start+units(word[0]))))
        answers.append(sample)
        contexts.append({k:v for k,v in sample.items() if k not in ('answer','answerSha256','url')})
    for name,rows in [('answers',answers),('contexts',contexts),('events',events),('gold',gold)]:
        jsonl(dest/(name+'.jsonl'),rows)
    meta=dict(threads=len(answers),events=len(events),files={p.name:file_hash(p) for p in sorted(dest.glob('*.jsonl'))})
    (out/'manifest.json').write_text(json.dumps(dict(provenance=locked, splits={'middle':meta}),indent=2)+'\n')


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    subs = cli.add_subparsers(dest='action', required=True)
    idx = subs.add_parser('exclude')
    for key in ('corpus', 'legacy', 'out'):
        idx.add_argument('--' + key, required=True, type=Path)
    idx.add_argument('--previous', type=Path, nargs='+', required=True)
    schedule = subs.add_parser('freeze')
    for key in ('source', 'exclusion', 'out'):
        schedule.add_argument('--' + key, type=Path, required=True)
    for key, default in [('fit', 200), ('validation', 100), ('final', 200)]:
        schedule.add_argument('--' + key, type=int, default=default)
    mid = subs.add_parser('middle')
    mid.add_argument('--split',type=Path,required=True)
    mid.add_argument('--out',type=Path,required=True)
    args = cli.parse_args()
    if args.action == 'exclude':
        exclude_training(args.corpus, args.legacy, args.previous, args.out)
    elif args.action == 'middle':
        middle_diagnostic(args.split,args.out)
    else:
        freeze(args.source, args.exclusion, args.out, args.fit, args.validation, args.final)
