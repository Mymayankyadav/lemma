"""Prepare the offline N253 kernel using an embedded packet and one existing teacher mount."""
import argparse
import ast
import base64
import hashlib
import inspect
import json
import lzma
from pathlib import Path
import shutil
import sys
import tempfile

import student_kaggle as pack
from student_kaggle import PACKET_FILE, T4_SHAPE, describe_file, digest, remote, training_identity, verify_packet, write_json

TEACHER_KERNEL = 'mayankyadav9432/lemma-typeahead-training-full-500m-20261124'
PACKED_FILES = (PACKET_FILE, 'data-manifest.json', 'tokenizer.json', 'data.jsonl')


def locate_teacher(root, signature):
    matches = [path for path in root.rglob('best.pt') if path.is_file() and not path.is_symlink() and
               path.stat().st_size == signature['bytes'] and digest(path) == signature['sha256']]
    if len(matches) != 1:
        raise ValueError(f'Expected one pinned native best.pt in teacher output, found {len(matches)}')
    return matches[0]


def unpack_packet(inputs, destination, info, payload):
    zipped = base64.b85decode(payload)
    if len(zipped) != info['compressedBytes'] or hashlib.sha256(zipped).hexdigest() != info['compressedSha256']:
        raise ValueError('Embedded compressed training packet changed')
    wanted = sum(info['files'][name]['bytes'] for name in PACKED_FILES)
    decoder = lzma.LZMADecompressor(format=lzma.FORMAT_XZ, memlimit=64 * 1024 * 1024)
    raw = decoder.decompress(zipped, max_length=wanted + 1)
    if len(raw) != wanted or not decoder.eof or decoder.unused_data:
        raise ValueError('Embedded packet did not decode to its exact size')
    start = 0
    for name in PACKED_FILES:
        signature = info['files'][name]
        end = start + signature['bytes']
        member = memoryview(raw)[start:end]
        if hashlib.sha256(member).hexdigest() != signature['sha256']:
            raise ValueError(f'Embedded packet member changed: {name}')
        (destination / name).write_bytes(member)
        start = end
    checkpoint = locate_teacher(inputs, info['teacher'])
    target = destination / 'teacher.pt'
    shutil.copyfile(checkpoint, target)
    if describe_file(target) != info['teacher']:
        raise ValueError('Mounted checkpoint changed during staging')


def embedded_entry(settings, sources, info, payload):
    if len(sys.argv) > 1 and sys.argv[1] == '--verify-transport':
        parser = argparse.ArgumentParser(description='Verify this kernel locally without starting a training run')
        parser.add_argument('--verify-transport', action='store_true')
        parser.add_argument('--teacher-root', type=Path, required=True)
        args = parser.parse_args()
        with tempfile.TemporaryDirectory(prefix='lemma-inline-preflight-') as temporary:
            staged = Path(temporary)
            unpack_packet(args.teacher_root, staged, info, payload)
            receipt = verify_packet(staged, settings['packetSha256'])
        print(json.dumps({'packetSha256': settings['packetSha256'], 'trainingIdentity': training_identity(settings),
                          'teacherKernel': info['teacherKernel'], 'sourceArchiveSha256': receipt['sourceArchiveSha256'],
                          'files': receipt['files'], 'data': receipt['data']}, indent=2, sort_keys=True))
        return
    remote(settings, sources, prepare_packet=lambda inputs, out: unpack_packet(inputs, out, info, payload),
           transport={'kind': 'inline-xz-base85-v1', 'teacherKernel': info['teacherKernel'],
                      'compressedBytes': info['compressedBytes'], 'compressedSha256': info['compressedSha256']})


def mounted_kernels(verified, resume):
    prior, receipt = verified['resumeKernel'], verified['resumeReceiptSha256']
    if not resume:
        if prior is not None or receipt is not None:
            raise ValueError('A resumed packet requires an explicit --resume')
        return [TEACHER_KERNEL]
    if (not isinstance(prior, str) or not pack.IDENTIFIER.fullmatch(prior) or
            not isinstance(receipt, str) or not pack.HASH.fullmatch(receipt)):
        raise ValueError('Resume needs a prior paired kernel and its exact receipt SHA-256')
    if prior.lower() in {TEACHER_KERNEL.lower(), verified['kernelId'].lower()}:
        raise ValueError('The teacher, prior paired run and new kernel must be distinct')
    return [TEACHER_KERNEL, prior]


def build(original, output, *, resume=False):
    verified = pack.verify_local(original)
    mounts = mounted_kernels(verified, resume)
    settings_ast, source_ast, *_ = ast.parse((original / 'kernel' / 'run.py').read_bytes()).body
    settings, sources = ast.literal_eval(settings_ast.value), ast.literal_eval(source_ast.value)
    dataset = original / 'dataset'
    signatures = {name: describe_file(dataset / name) for name in PACKED_FILES}
    joined = b''.join((dataset / name).read_bytes() for name in PACKED_FILES)
    zipped = lzma.compress(joined, format=lzma.FORMAT_XZ, preset=6)
    info = {'kind': 'inline-xz-base85-v1', 'teacherKernel': TEACHER_KERNEL, 'teacher': verified['files']['teacher.pt'],
            'files': signatures, 'compressedBytes': len(zipped), 'compressedSha256': hashlib.sha256(zipped).hexdigest()}
    encoded = base64.b85encode(zipped)
    header = f'PACKED_SETTINGS = {settings!r}\nPACKED_SOURCES = {sources!r}\nTRANSPORT_INFO = {info!r}\nTRANSPORT_PAYLOAD = (\n'
    literal = ''.join(f'    {encoded[i:i + 4096]!r}\n' for i in range(0, len(encoded), 4096)) + ')\n'
    core = Path(pack.__file__).read_text(encoding='utf-8').rsplit('\nif __name__ == ', 1)[0]
    runtime = '\n\n'.join(inspect.getsource(func) for func in (locate_teacher, unpack_packet, embedded_entry))
    namespace = f'\nimport lzma\nPACKED_FILES = {PACKED_FILES!r}\n'
    content = header + literal + core + namespace + runtime + '\nif __name__ == "__main__":\n    embedded_entry(PACKED_SETTINGS, PACKED_SOURCES, TRANSPORT_INFO, TRANSPORT_PAYLOAD)\n'
    compile(content, 'run.py', 'exec')
    metadata = pack.json_file(original / 'kernel' / 'kernel-metadata.json')
    metadata.update(dataset_sources=[], competition_sources=[], kernel_sources=mounts, model_sources=[])
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    kernel = output / 'kernel'
    kernel.mkdir()
    (kernel / 'run.py').write_text(content, encoding='utf-8')
    write_json(kernel / 'kernel-metadata.json', metadata)
    receipt = {'packetSha256': verified['packetSha256'], 'trainingIdentity': verified['trainingIdentity'],
               'sourceArchiveSha256': verified['sourceArchiveSha256'], 'baseCommit': verified['baseCommit'],
               'kernelId': metadata['id'], 'teacherKernel': TEACHER_KERNEL, 'transport': info,
               'resumeKernel': verified['resumeKernel'], 'resumeReceiptSha256': verified['resumeReceiptSha256'],
               'private': True, 'internet': False, 'accelerator': T4_SHAPE,
               'sessionSeconds': verified['sessionSeconds'], 'maximumAllocatedGpuHours': verified['maximumAllocatedGpuHours'],
               'sourceFile': describe_file(kernel / 'run.py'),
               'scriptTextJsonBytes': len(json.dumps({'text': content}).encode('utf-8')),
               'commands': [['kernels', 'push', '--path', str(kernel.resolve()), '--accelerator', T4_SHAPE, '--timeout', str(verified['sessionSeconds'])]]}
    write_json(output / 'mount-submission-receipt.json', receipt)
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--from-packet', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--resume', action='store_true', help='Mount the prior paired kernel pinned in the underlying resume packet')
    args = parser.parse_args()
    print(json.dumps(build(args.from_packet, args.out, resume=args.resume), indent=2, sort_keys=True))


if __name__ == '__main__':
    main()
