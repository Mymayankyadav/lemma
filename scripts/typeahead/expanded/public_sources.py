"""Fetch explicit, immutable Hugging Face source shards for private CPU preparation."""
import argparse
import json
from pathlib import Path
import urllib.request

from corpus import file_hash

SOURCES = (
    {'id': 'HuggingFaceTB/finemath', 'revision': 'e92b25a616738fe95dc186b64dfb19f9c8525594',
     'prefix': 'finemath-4plus/train-', 'suffix': '.parquet', 'register': 'explanation',
     'license': 'ODC-By, underlying Common Crawl source terms', 'groupField': 'url'},
    {'id': 'EleutherAI/proof-pile-2', 'revision': '901a9273a770e9d4138c5ddd91802f9c5c6cdc4b',
     'prefix': 'arxiv/train/', 'suffix': '.jsonl.zst', 'register': 'proof',
     'license': 'Underlying arXiv author licences, see document metadata and dataset card', 'groupFields': ['meta.arxiv_id', 'meta.id', 'arxiv_id', 'meta.url', 'url', 'id']},
    {'id': 'hoskinson-center/proof-pile', 'revision': '490b980249446f2f3bd2df3a8cf085d0f2de240a',
     'prefix': 'train/proofpile_train_', 'suffix': '.jsonl.gz', 'register': 'learner',
     'license': 'CC BY-SA (Math StackExchange text)',
     'groupFields': ['meta.question_id', 'meta.url', 'url'],
     'groupPrefix': 'https://math.stackexchange.com/questions/',
     'filter': {'meta.set_name': 'stack_exchange'}},
)


def request(url):
    return urllib.request.urlopen(url, timeout=90)


def fetch(out, counts):
    from shutil import copyfileobj
    out.mkdir(parents=True, exist_ok=True)
    manifest = []
    for source, count in zip(SOURCES, counts, strict=True):
        if count == 0:
            continue
        dataset = f"https://huggingface.co/datasets/{source['id']}"
        revision = source['revision']
        with request(f"https://huggingface.co/api/datasets/{source['id']}/revision/{revision}?blobs=true") as response:
            data = json.load(response)
        if data['sha'] != revision:
            raise ValueError(f'Unexpected source revision for {dataset}')
        paths = sorted((entry for entry in data['siblings'] if
                        entry['rfilename'].startswith(source['prefix']) and entry['rfilename'].endswith(source['suffix'])),
                       key=lambda file: file['rfilename'])
        if count > len(paths):
            raise ValueError(f'Requested {count} shards but only {len(paths)} exist for {dataset}; paths: {paths[:3]}')
        entry = {key: value for key, value in source.items() if key not in ('prefix', 'suffix')}
        entry.update(url=dataset, shards=[])
        for i, remote in enumerate(paths[:count]):
            path = remote['rfilename']
            expected = remote.get('lfs', {}).get('sha256')
            if not expected:
                raise ValueError(f'No trusted LFS digest for {path}')
            filename = f"{source['register']}-{i:03}{source['suffix']}"
            dest = out / filename
            if not dest.exists():
                partial = dest.with_name(filename + '.part')
                print(f'Downloading {dataset} @ {revision}: {path}', flush=True)
                with request(f'{dataset}/resolve/{revision}/{path}') as response, partial.open('wb') as file:
                    copyfileobj(response, file)
                partial.replace(dest)
            digest = file_hash(dest)
            if digest != expected or dest.stat().st_size != remote['size']:
                raise ValueError(f'Source size or SHA-256 differs from pinned revision for {path}')
            info = {'path': filename, 'originalPath': path, 'sha256': digest, 'bytes': dest.stat().st_size}
            print(json.dumps(info), flush=True)
            entry['shards'].append(info)
        manifest.append(entry)
    spec = out / 'sources.json'
    spec.write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
    return spec


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--shards-per-register', nargs=3, type=int, required=True, metavar=('EXPLANATION', 'PROOF', 'LEARNER'))
    args = parser.parse_args()
    if any(count < 0 for count in args.shards_per_register):
        parser.error('Shard counts must be nonnegative')
    fetch(args.out, args.shards_per_register)


if __name__ == '__main__':
    main()
