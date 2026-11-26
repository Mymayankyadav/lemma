#!/usr/bin/env python3
"""Create train-only public-source word slates for a bounded student experiment.

The shipping count model is frozen and may have seen these training documents;
these rows and their grouped calibration partition are not independent evaluation.
No evaluation or reserved split is read. Raw output belongs only in scratch.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import numpy as np

from compare_kn_events import history
from corpus import FORMULA, documents, file_hash, tutor_pair
from data_audit import clean, digest
from score_assets import loaded

PINNED_MODEL = 'c97bacd0de80f08a66f65a76c610c8fa6076daaf70f328f4eb8be684e7ef9ba8'
WORD = re.compile(r'(?<!\S)([a-z]{3,24})(?=[ \t])')
ADMISSIBLE = re.compile(r'[a-z]{2,24}\Z')
POLICY_PATH = Path(__file__).resolve().parents[3] / 'src/features/tutor/writingAid/eligibility.ts'


def load_policy():
    source = POLICY_PATH.read_text()
    def pattern(name, flags=0):
        match = re.search(r'const ' + name + r' = /(.*?)/iu;', source)
        if match is None:
            raise ValueError('cannot read pinned eligibility rule ' + name)
        return re.compile(match.group(1), flags)
    choice, steering = pattern('CHOICE', re.I), pattern('STEERING', re.I)
    words = [w for w in choice.pattern.removeprefix('^(?:').removesuffix(')$').split('|') if re.fullmatch(r'[a-z]+', w)]
    # OPERAND is case-sensitive in the runtime.
    raw = re.search(r'const OPERAND = /(.*?)/u;', source)
    if raw is None:
        raise ValueError('cannot read pinned operand eligibility')
    return choice, steering, re.compile(raw.group(1)), words


def eligible(word, before, stem, policy):
    choice, steering, operand, words = policy
    if not stem and operand.search(before):
        return False
    if stem and stem == word:
        return True
    if steering.fullmatch(word):
        return bool(stem and word.startswith(stem) and len(stem) >= 5 and len(stem)/len(word) >= .8)
    if choice.fullmatch(word):
        return bool(stem and word.startswith(stem) and (
            len(stem) >= 5 and len(stem)/len(word) >= .8 or
            len(stem) >= 3 and not any(other != word and other.startswith(stem) for other in words)))
    return True


def open_literal(text):
    line = text.rsplit('\n', 1)[-1]
    return (len(re.findall(r'(?<!\\)`', text)) % 2 == 1 or
            len(re.findall(r'(?<!\\)"', line)) % 2 == 1 or
            line.count('“') > line.count('”') or line.count('‘') > line.count('’') or
            bool(re.search(r"(?:^|\s)'[^']*$", line)) or
            bool(re.search(r'(?:^|\s)(?:tutor|teacher|instructor|assistant|solution|system|code|prompt|quotation)\s*:|\b(?:tutor|teacher|assistant|book|solution|prompt)\s+(?:said|says|wrote|asked|suggested|mentions?|mentioned|gives?|gave)\b', line,re.I)) or
            bool(re.search(r'(?:search|identifier|code|literal|verbatim|product|brand|named|called)\b[^.!?\n]*$', line,re.I)))


def build_lexical(vocab, policy):
    """Cache all context-independent admissible IDs by one-to-three letter stem."""
    index = {'':set()}
    for i, word in enumerate(vocab):
        if i <= 4 or not ADMISSIBLE.fullmatch(word):
            continue
        for length in range(0, min(3, len(word)) + 1):
            stem = word[:length]
            if eligible(word, '', stem, policy):
                index.setdefault(stem, set()).add(i)
    return index


class DenseScorer:
    """Compute exact backoff probabilities once for a shared boundary/prefix history."""
    def __init__(self, model):
        self.model = model
        self.last = None
        self.scores = None

    def probabilities(self, ids):
        if self.last == ids:
            return self.scores
        values = np.asarray(self.model.unigram, dtype=np.float64).copy()
        for width in range(1, min(len(ids), len(self.model.rows) - 1) + 1):
            row = self.model.rows[width].get(ids[-width:])
            if row:
                edges, alpha = row
                values *= alpha
                if edges:
                    keys = np.fromiter(edges.keys(), dtype=np.int64, count=len(edges))
                    probabilities = np.fromiter(edges.values(), dtype=np.float64, count=len(edges))
                    values[keys] = probabilities
        self.last, self.scores = ids, values
        return values


def candidates(vocab, model, order, lookup, top, before, stem, policy, limit=16, lexical=None, scorer=None):
    """Score frozen model successors; neither gold nor future text is an input."""
    if not stem and policy[2].search(before):
        return []
    ids = history(before, lookup, order - 1)
    options = set(top)
    for width in range(min(len(ids), len(model.rows) - 1), 0, -1):
        row = model.rows[width].get(ids[-width:])
        if row:
            options.update(row[0])
    lexical = lexical if lexical is not None else build_lexical(vocab, policy)
    options.intersection_update(lexical.get(stem, set()))
    # The student contract requires every offered prefix word to advance it.
    if stem in lookup:
        options.discard(lookup[stem])
    if not options:
        return []
    scorer = scorer if scorer is not None else DenseScorer(model)
    scores = scorer.probabilities(ids)
    indices = np.fromiter(options, dtype=np.int64, count=len(options))
    ordering = np.lexsort((indices, -scores[indices]))[:limit]
    return [vocab[i] for i in indices[ordering]]


def opportunities(text, document_id, count=2):
    """Select positions before scoring; formulas and code blocks are excluded."""
    text = text[:5000]
    spans = [(m.start(), m.end()) for m in FORMULA.finditer(text)]
    spans += [(m.start(), m.end()) for m in re.finditer(r'```[\s\S]*?```', text)]
    positions = [m for m in WORD.finditer(text) if m.start() >= 16 and
                 not any(a <= m.start() < b for a, b in spans)]
    positions.sort(key=lambda m: digest('position:' + document_id + ':' + str(m.start())))
    return positions[:count]


def split_for_group(group):
    return 'calibration' if int(digest('student-split:' + group)[:16], 16) % 5 == 0 else 'fit'


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--corpus', type=Path, required=True)
    p.add_argument('--model', type=Path, required=True)
    p.add_argument('--out-dir', type=Path, required=True)
    p.add_argument('--groups', type=int, default=5000)
    p.add_argument('--max-docs', type=int, default=60000)
    args = p.parse_args()
    if args.groups < 1 or args.max_docs < args.groups:
        p.error('groups must be positive and max-docs at least groups')
    if file_hash(args.model/'model.bin') != PINNED_MODEL:
        raise ValueError('shipping count pack hash does not match the pinned model')
    args.out_dir.mkdir(parents=True, exist_ok=True)
    out, manifest_path = args.out_dir/'data.jsonl', args.out_dir/'data-manifest.json'
    if out.exists() or manifest_path.exists():
        raise FileExistsError('refusing to overwrite an existing data artifact')
    policy = load_policy()
    vocab, model, order = loaded(args.model)
    lookup = {word:i for i,word in enumerate(vocab)}
    top = sorted(range(5, len(vocab)), key=lambda i:(-model.unigram[i], i))[:256]
    lexical = build_lexical(vocab, policy)
    scorer = DenseScorer(model)
    quotas = {'learner':args.groups * 40 // 100, 'proof':args.groups * 10 // 100}
    quotas['explanation'] = args.groups - sum(quotas.values())
    register_counts, question_groups, filtered = Counter(), 0, Counter()
    seen, counts, group_counts, source_counts, ranks, stem_counts = set(), Counter(), Counter(), Counter(), Counter(), Counter()
    tmp = args.out_dir/'data.jsonl.partial'
    checked = 0
    with tmp.open('x', encoding='utf8') as stream:
        for doc in documents(args.corpus, 'train'):
            checked += 1
            if checked > args.max_docs:
                break
            group = doc['group']
            register = doc.get('register')
            if register not in quotas or register_counts[register] >= quotas[register]:
                continue
            if group in seen or not isinstance(doc.get('text'), str) or len(doc['text']) > 100000:
                continue
            question, reply = tutor_pair(doc)
            if register == 'learner' and not (question and reply):
                continue
            if not (question and reply) and re.search(r'^(?:TITLE|QUESTION|REPLY|SYSTEM|USER|ASSISTANT|INSTRUCTION|PROMPT)\s*[:\[]', doc['text'][:500], re.M | re.I):
                continue
            body = reply if question and reply else doc['text']
            question = question[:1000] if question and reply else ''
            # Avoid carrying a quoted web prompt/header into an apparent answer draft.
            if re.search(r'^(?:\s*>\s|\s*(?:quote|originally posted by|system|assistant|prompt)\s*:)', body[:5000], re.M | re.I):
                filtered['quotedOrPromptWrapper'] += 1
                continue
            body, _, reason = clean(body)
            if reason or not body:
                continue
            positions = opportunities(body, doc['id'])
            if len(positions) < 2:
                continue
            split = split_for_group(group)
            rows = []
            for pos in positions:
                gold = pos.group(1)
                # Use only the learner-visible prefix before this position, not the suffix.
                before = body[max(0, pos.start() - 1000):pos.start()]
                # Avoid a context whose left edge cuts a TeX formula.
                if (open_literal(before) or before.count('$') % 2 or before.count('\\(') != before.count('\\)') or
                    before.count('\\[') != before.count('\\]') or
                    before.count('\\begin{') != before.count('\\end{')):
                    continue
                stem_size = 1 + int(digest('stem:' + doc['id'] + ':' + str(pos.start()))[:8], 16) % min(3, len(gold)-1)
                stem = gold[:stem_size]
                for kind, prefix in (('boundary',''), ('prefix',stem)):
                    slate = candidates(vocab, model, order, lookup, top, before, prefix, policy, lexical=lexical, scorer=scorer)
                    row = {'group':group, 'split':split, 'kind':kind, 'question':question,
                           'draft':before + prefix, 'prefix':prefix, 'gold':gold, 'candidates':slate}
                    rows.append(row)
            if len(rows) != 4:
                continue
            seen.add(group)
            group_counts[split] += 1
            register_counts[register] += 1
            question_groups += bool(question)
            source_counts[doc['source']] += 1
            for row in rows:
                stream.write(json.dumps(row, ensure_ascii=False, separators=(',',':'))+'\n')
                key = row['split']+'|'+row['kind']
                counts[key] += 1
                if row['kind']=='prefix':
                    stem_counts[str(len(row['prefix']))] += 1
                slate, gold = row['candidates'], row['gold']
                category = 'top3' if gold in slate[:3] else 'rank4to16' if gold in slate else 'outside16'
                ranks[key+'|'+category] += 1
                if not slate:
                    ranks[key+'|emptySlate'] += 1
            if len(seen) == args.groups:
                break
    if len(seen) != args.groups:
        tmp.unlink()
        raise ValueError(f'only {len(seen)} eligible groups after {checked} training documents; target {args.groups}')
    tmp.rename(out)
    source_manifest = json.loads((args.corpus/'manifest.json').read_text())
    source_records = sorted({(s['id'], s['revision'], s['license'], s['url']) for s in source_manifest['sources']})
    report = {'version':1, 'sourceSplit':'train', 'scope':'archived train shards only; grouped within-training fit/calibration, no independent validation',
              'dataSha256':file_hash(out), 'sourceManifestSha256':file_hash(args.corpus/'manifest.json'),
              'countModelSha256':PINNED_MODEL, 'generatorSha256':file_hash(Path(__file__)),
              'eligibilityPolicySha256':file_hash(POLICY_PATH),
              'rows':sum(counts.values()), 'groups':len(seen), 'documentsScanned':checked,
              'rowsBySplitAndKind':dict(sorted(counts.items())), 'groupsBySplit':dict(sorted(group_counts.items())),
              'groupsBySource':dict(sorted(source_counts.items())), 'groupsByRegister':dict(sorted(register_counts.items())),
              'groupsWithQuestion':question_groups, 'rowsWithQuestion':question_groups * 4,
              'filtered':dict(sorted(filtered.items())), 'prefixStemLengths':dict(sorted(stem_counts.items())),
              'naturalSlateDiagnostics':dict(sorted(ranks.items())), 'maximumCandidates':16,
              'sources':[{'id':i,'revision':r,'license':l,'url':u} for i,r,l,u in source_records],
              'splitMethod':'SHA-256 of student-split: plus archived publisher/duplicate group, 80/20 by hash',
              'selection':'two pre-scoring word positions per group, each with matched boundary and prefix; no gold injection; 50/10/40 explanation/proof/public-Q&A group quotas; Q&A requires a parsed question and first reply',
              'eligibility':'Python port of current prose choice, steering, operand and literal guards with no Tutor-specific aid; not full editor-context or on-device policy execution.',
              'limitations':'Rows from one group and paired boundary/prefix positions are dependent. Existing shipping count pack was trained on the archived corpus and may have seen these documents; the grouped calibration partition is not independent evaluation. Existing archive grouping is bounded; a new sealed substring/near-duplicate exclusion check was not performed.',
              'contract':{'group':'archived group hash','split':['fit','calibration'],'kind':['boundary','prefix'],
                          'question':'visible source question when available, else empty','draft':'visible text including prefix',
                          'prefix':'typed lowercase stem or empty','gold':'actual full next word',
                          'candidates':'at most 16 natural frozen-model full lowercase words; strict prefix advancement; no target injection'}}
    manifest_path.write_text(json.dumps(report,indent=2,sort_keys=True)+'\n')
    print(json.dumps({'rows':report['rows'],'groups':report['groups'],'dataSha256':report['dataSha256'],
                      'manifestSha256':file_hash(manifest_path)},sort_keys=True),flush=True)


if __name__ == '__main__':
    main()
