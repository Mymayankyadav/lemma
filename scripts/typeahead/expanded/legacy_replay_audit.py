"""Audit replay groups against the exact training source of both deployed v1 assets."""
import argparse
from collections import Counter
import json
from pathlib import Path
import urllib.request

from corpus import documents, file_hash, fingerprint, group_identity, publisher_reference, records, tutor_pair
from kn_build import is_held_out
from public_sources import SOURCES

LEGACY_SHA = '9a33bde2feabb2421936bbde65ab15692ba814812bb2cf0e82a77b35e07e0b9b'
LEGACY_BYTES = 161_818_020
LEGACY_PATH = 'dev/proofpile_dev.jsonl.gz'
SPLITS = ('calibration', 'validation', 'test')
LEARNER = SOURCES[2]


def download(path):
    from shutil import copyfileobj
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.part')
    url = f"https://huggingface.co/datasets/{LEARNER['id']}/resolve/{LEARNER['revision']}/{LEGACY_PATH}"
    with urllib.request.urlopen(url, timeout=90) as stream, temporary.open('wb') as output:
        copyfileobj(stream, output)
    temporary.replace(path)


def training_index(path, expected_sha=LEGACY_SHA, expected_bytes=LEGACY_BYTES):
    if path.stat().st_size != expected_bytes or file_hash(path) != expected_sha:
        raise ValueError('Legacy source does not match the deployed proof-pile development shard')
    groups, questions, contents, counts = set(), set(), set(), Counter()
    for raw in records(path):
        metadata = raw.get('meta')
        try:
            metadata = json.loads(metadata) if isinstance(metadata, str) else metadata
        except ValueError:
            metadata = None
        if (metadata or {}).get('set_name') != 'stack_exchange':
            continue
        text = raw['text']
        if is_held_out(text):
            counts['heldOutDocuments'] += 1
            continue
        counts['trainDocuments'] += 1
        reference = publisher_reference(raw, LEARNER)
        identity = group_identity(reference) if reference else ''
        question, _ = tutor_pair({'source': LEARNER['id'], 'text': text})
        if identity.startswith('math.stackexchange.com/questions/'):
            groups.add(identity)
            counts['publisherIds'] += 1
        else:
            counts['missingPublisherIds'] += 1
            if not question:
                raise ValueError('Unidentified v1 training document has no recoverable question fingerprint')
        if question:
            questions.add(fingerprint(question))
        contents.add(fingerprint(text))
    if not counts['trainDocuments']:
        raise ValueError('Legacy training shard has no eligible training documents')
    counts.update(distinctPublisherIds=len(groups), distinctQuestions=len(questions), distinctContents=len(contents))
    return (groups, questions, contents), counts


def audit(corpus, index):
    known_groups, known_questions, known_contents = index
    excluded = set()
    by_split = {}
    for split in SPLITS:
        seen, overlapping, hits = set(), set(), Counter()
        for document in documents(corpus, split):
            group = document['group']
            seen.add(group)
            identity = group_identity(document['reference'])
            question, _ = tutor_pair(document)
            publisher_hit = identity in known_groups
            question_hit = bool(question and fingerprint(question) in known_questions)
            content_hit = document['id'] in known_contents
            if publisher_hit or question_hit or content_hit:
                overlapping.add(group)
                hits['publisherMatchedDocuments'] += publisher_hit
                hits['questionMatchedDocuments'] += question_hit
                hits['contentMatchedDocuments'] += content_hit
        by_split[split] = {'heldoutGroups': len(seen), 'overlapGroups': len(overlapping), **hits}
        excluded.update(overlapping)
    return excluded, by_split


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sources = parser.add_mutually_exclusive_group(required=True)
    sources.add_argument('--legacy', type=Path)
    sources.add_argument('--identity-index', type=Path, help='Directory emitted by a verified legacy-only audit')
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--corpus', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if args.identity_index:
        path = args.identity_index / 'legacy-training-identity.json'
        report = json.loads((args.identity_index / 'legacy-audit.json').read_text())
        if (not report.get('passed') or report['legacySourceSha256'] != LEGACY_SHA or
                report['legacySourceRevision'] != LEARNER['revision'] or report['trainingIdentitySha256'] != file_hash(path)):
            raise ValueError('Legacy training identity index has changed')
        index = tuple(set(values) for values in json.loads(path.read_text()))
    else:
        if args.download and not args.legacy.exists():
            download(args.legacy)
        index, counts = training_index(args.legacy)
        report = {'legacySourceSha256': LEGACY_SHA, 'legacySourceRevision': LEARNER['revision'],
                  'counts': counts, 'passed': True}
    args.out.mkdir(parents=True, exist_ok=False)
    if args.corpus:
        excluded, overlap = audit(args.corpus, index)
        exclusions = args.out / 'legacy-excluded-groups.jsonl'
        with exclusions.open('w') as file:
            for group in sorted(excluded):
                file.write(json.dumps({'documentGroup': group}) + '\n')
        report.update(corpusSha256=file_hash(args.corpus / 'manifest.json'), overlap=overlap,
                      excludedGroupsSha256=file_hash(exclusions))
    else:
        identities = args.out / 'legacy-training-identity.json'
        identities.write_text(json.dumps([sorted(values) for values in index], separators=(',', ':')) + '\n')
        report['trainingIdentitySha256'] = file_hash(identities)
    (args.out / 'legacy-audit.json').write_text(json.dumps(report, indent=2, sort_keys=True) + '\n')
    print(json.dumps(report, sort_keys=True), flush=True)


if __name__ == '__main__':
    main()
