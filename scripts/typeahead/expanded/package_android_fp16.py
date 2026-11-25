"""Package the audited primary FP16 graphs into the optional Android file without retraining."""
import argparse
import json
from pathlib import Path

from corpus import file_hash


def package(export, descriptor, out):
    spec = json.loads(descriptor.read_bytes())
    tmp = out.with_suffix('.partial')
    try:
        with tmp.open('xb') as destination:
            for role in ('tokenizer', 'prefill', 'incremental', 'weights'):
                obj = spec['files'][role]
                source = export / obj['path']
                if source.stat().st_size != obj['bytes'] or file_hash(source) != obj['sha256']:
                    raise ValueError(f'Unexpected FP16 {role}')
                with source.open('rb') as data:
                    while chunk := data.read(1024 * 1024):
                        destination.write(chunk)
        if tmp.stat().st_size > 72 * 2**20 or file_hash(tmp) != spec['packageSha256']:
            raise ValueError('FP16 package integrity or size check failed')
        tmp.replace(out)
    finally:
        tmp.unlink(missing_ok=True)


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--export', required=True, type=Path)
    cli.add_argument('--out', required=True, type=Path)
    default = Path(__file__).resolve().parents[3] / 'src/features/tutor/writingAid/decoder/android-fp16.json'
    cli.add_argument('--descriptor', type=Path, default=default)
    args = cli.parse_args()
    package(args.export, args.descriptor, args.out)
