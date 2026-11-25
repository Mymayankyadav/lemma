"""Select attributable public question/answer pairs before reading any model outcomes."""
import argparse
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit


def extract(root, out, per_site=5000):
    out.mkdir(parents=True, exist_ok=True)
    report = {}
    with gzip.open(out / 'questions.jsonl.gz', 'wt', encoding='utf8') as output:
        for host in ('math.stackexchange.com', 'mathoverflow.net'):
            path, = root.rglob('stackexchange-math--1q1a/' + host + '.jsonl')
            selected, digest, counts = {}, hashlib.sha256(), Counter()
            # Keep a deterministic bottom hash sample of threads; all answers of a thread share its priority.
            ceiling = 2**256
            with path.open('rb') as rows:
                for line in rows:
                    digest.update(line)
                    counts["inputRows"] += 1
                    row = json.loads(line)
                    meta = row.get('meta', row.get('metadata', {}))
                    if not isinstance(meta, dict):
                        counts['invalidMetadata'] += 1
                        continue
                    url = meta.get('url')
                    if not isinstance(url, str):
                        counts['invalidLink'] += 1
                        continue
                    parts = urlsplit(url)
                    path_parts = parts.path.strip('/').split('/')
                    if parts.hostname != host or len(path_parts) < 2 or path_parts[0] not in ('q', 'questions') or not path_parts[1].isdigit():
                        continue
                    group = 'https://' + host + '/questions/' + path_parts[1]
                    priority = int.from_bytes(hashlib.sha256(group.encode()).digest(), 'big')
                    if not all(isinstance(row.get(key), str) and row[key].strip() for key in ('Q', 'A')) or not str(meta.get('answer_id', '')).isdigit():
                        counts['invalidPair'] += 1
                        continue
                    if priority >= ceiling:
                        continue
                    record = dict(url=group, answerId=str(meta['answer_id']), question=row['Q'], answer=row['A'], source=host)
                    if priority not in selected or int(record['answerId']) < int(selected[priority]['answerId']):
                        selected[priority] = record
                    if len(selected) >= 2 * per_site:
                        keep = sorted(selected)[:per_site]
                        selected = {k: selected[k] for k in keep}
                        ceiling = keep[-1] + 1
            chosen = sorted(selected)[:per_site]
            if len(chosen) < per_site:
                raise ValueError(f'{host} yielded only {len(chosen)} valid distinct threads')
            for key in chosen:
                output.write(json.dumps(selected[key], ensure_ascii=False) + '\n')
            report[host] = dict(rows=len(chosen), filename=path.name, sha256=digest.hexdigest(), counts=dict(counts))
    (out / 'sources.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=Path('/kaggle/input'))
    parser.add_argument('--out', type=Path, default=Path('/kaggle/working'))
    parser.add_argument('--per-site', type=int, default=5000)
    args = parser.parse_args()
    extract(args.source_root, args.out, args.per_site)
