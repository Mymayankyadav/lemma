"""Prepare the offline N253 kernel from approved teacher and train-corpus mounts."""
import argparse
import ast
import base64
import hashlib
import inspect
import json
import lzma
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

import student_kaggle as pack
from student_kaggle import (CORPUS_SHA, OFFLINE_CHILD, PACKET_FILE, T4_SHAPE, describe_file, digest, remote,
                            training_identity, verify_packet, verify_sources, write_json)

TEACHER_KERNEL = 'mayankyadav9432/lemma-typeahead-training-full-500m-20261124'
CORPUS_KERNEL = 'mayankyadav9432/lemma-typeahead-cpu-500m-provenance-20261124'
SCRIPT_MAX_BYTES = 1_000_000
RECIPE_FILE = 'data-references.json.xz'
REFERENCE_SOURCES = ('student_source_refs.py', 'data_audit.py')
PACKED_FILES = (PACKET_FILE, 'data-manifest.json', 'tokenizer.json', RECIPE_FILE, *REFERENCE_SOURCES)


def mounted_output(inputs, reference):
    owner, name = reference.split('/')
    expected = (inputs / 'notebooks' / owner / name, inputs / name)
    matches = {path.resolve() for path in expected if path.is_dir()}
    return next(iter(matches)) if len(matches) == 1 else inputs


def pinned_matches(root, name, expected, size=None):
    matches = {}
    for path in root.rglob(name):
        if not path.is_file() or path.is_symlink():
            continue
        stat = path.stat()
        identity = stat.st_dev, stat.st_ino
        if identity not in matches and (size is None or stat.st_size == size) and digest(path) == expected:
            matches[identity] = path
    return list(matches.values())


def locate_attachment(inputs, reference, name, expected, size=None):
    preferred = mounted_output(inputs, reference)
    matches = pinned_matches(preferred, name, expected, size)
    if not matches and preferred != inputs:
        matches = pinned_matches(inputs, name, expected, size)
    if len(matches) != 1:
        raise ValueError(f'Expected one pinned {name} for {reference}, found {len(matches)}')
    return matches[0]


def unpack_members(destination, info, payload):
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


def unpack_packet(inputs, destination, info, payload, sources):
    unpack_members(destination, info, payload)
    if info['corpusManifestSha256'] != CORPUS_SHA:
        raise ValueError('Expected the pinned training corpus manifest')
    train = locate_attachment(inputs, info['corpusKernel'], 'manifest.json', CORPUS_SHA).parent
    checkpoint = locate_attachment(inputs, info['teacherKernel'], 'best.pt',
                                   info['teacher']['sha256'], info['teacher']['bytes'])
    with tempfile.TemporaryDirectory(prefix='lemma-reference-code-', dir=destination) as directory:
        root = Path(directory)
        verify_sources(base64.b64decode(sources, validate=True), info['sourceArchiveSha256'], root)
        expanded = root / 'expanded'
        for name in REFERENCE_SOURCES:
            shutil.copyfile(destination / name, expanded / name)
        env = dict(os.environ, PYTHONPATH=str(expanded))
        result = subprocess.run([sys.executable, '-c', OFFLINE_CHILD, str(expanded / 'student_source_refs.py'),
                                 'reconstruct', '--recipe', str(destination / RECIPE_FILE), '--corpus', str(train),
                                 '--out', str(destination / 'data.jsonl')], env=env, check=True, stdout=subprocess.PIPE, text=True)
        print(result.stdout, file=sys.stderr, end='')
    if describe_file(destination / 'data.jsonl') != info['data']:
        raise ValueError('Reconstructed rows differ from the verified packet')
    target = destination / 'teacher.pt'
    shutil.copyfile(checkpoint, target)
    if describe_file(target) != info['teacher']:
        raise ValueError('Mounted checkpoint changed during staging')


def embedded_entry(settings, sources, info, payload):
    if len(sys.argv) > 1 and sys.argv[1] == '--verify-transport':
        parser = argparse.ArgumentParser(description='Verify this kernel locally without starting a training run')
        parser.add_argument('--verify-transport', action='store_true')
        parser.add_argument('--input-root', type=Path, required=True)
        args = parser.parse_args()
        with tempfile.TemporaryDirectory(prefix='lemma-inline-preflight-') as temporary:
            staged = Path(temporary)
            unpack_packet(args.input_root, staged, info, payload, sources)
            receipt = verify_packet(staged, settings['packetSha256'])
        print(json.dumps({'packetSha256': settings['packetSha256'], 'trainingIdentity': training_identity(settings),
                          'teacherKernel': info['teacherKernel'], 'corpusKernel': info['corpusKernel'],
                          'sourceArchiveSha256': receipt['sourceArchiveSha256'],
                          'files': receipt['files'], 'data': receipt['data']}, indent=2, sort_keys=True))
        return
    remote(settings, sources, prepare_packet=lambda inputs, out: unpack_packet(inputs, out, info, payload, sources),
           transport={'kind': info['kind'], 'teacherKernel': info['teacherKernel'], 'corpusKernel': info['corpusKernel'],
                      'corpusManifestSha256': info['corpusManifestSha256'], 'recipeSha256': info['files'][RECIPE_FILE]['sha256'],
                      'compressedBytes': info['compressedBytes'], 'compressedSha256': info['compressedSha256']})


def mounted_kernels(verified, resume):
    prior, receipt = verified['resumeKernel'], verified['resumeReceiptSha256']
    sources = {TEACHER_KERNEL.lower(), CORPUS_KERNEL.lower()}
    active = verified['kernelId'].lower()
    if active in sources:
        raise ValueError('The new kernel must be distinct from both source kernels')
    if not resume:
        if prior is not None or receipt is not None:
            raise ValueError('A resumed packet requires an explicit --resume')
        return [TEACHER_KERNEL, CORPUS_KERNEL]
    if (not isinstance(prior, str) or not pack.IDENTIFIER.fullmatch(prior) or
            not isinstance(receipt, str) or not pack.HASH.fullmatch(receipt)):
        raise ValueError('Resume needs a prior paired kernel and its exact receipt SHA-256')
    if prior.lower() in sources | {active}:
        raise ValueError('The teacher, corpus, prior paired run and new kernel must be distinct')
    return [TEACHER_KERNEL, CORPUS_KERNEL, prior]


def check_source_size(content):
    size = len(content.encode('utf-8'))
    if size >= SCRIPT_MAX_BYTES:
        raise ValueError(f'Kaggle kernel source is {size} bytes, reaching the {SCRIPT_MAX_BYTES}-byte limit')


def build(original, output, recipe, *, resume=False):
    verified = pack.verify_local(original)
    mounts = mounted_kernels(verified, resume)
    settings_ast, source_ast, *_ = ast.parse((original / 'kernel' / 'run.py').read_bytes()).body
    settings, sources = ast.literal_eval(settings_ast.value), ast.literal_eval(source_ast.value)
    dataset = original / 'dataset'
    paths = {name: dataset / name for name in (PACKET_FILE, 'data-manifest.json', 'tokenizer.json')}
    paths[RECIPE_FILE] = recipe
    paths.update({name: Path(__file__).with_name(name) for name in REFERENCE_SOURCES})
    signatures = {name: describe_file(paths[name]) for name in PACKED_FILES}
    joined = b''.join(paths[name].read_bytes() for name in PACKED_FILES)
    zipped = lzma.compress(joined, format=lzma.FORMAT_XZ, preset=6)
    info = {'kind': 'source-refs-xz-base85-v1', 'teacherKernel': TEACHER_KERNEL, 'teacher': verified['files']['teacher.pt'],
            'corpusKernel': CORPUS_KERNEL, 'corpusManifestSha256': CORPUS_SHA, 'data': verified['files']['data.jsonl'],
            'sourceArchiveSha256': verified['sourceArchiveSha256'],
            'files': signatures, 'compressedBytes': len(zipped), 'compressedSha256': hashlib.sha256(zipped).hexdigest()}
    encoded = base64.b85encode(zipped)
    header = f'PACKED_SETTINGS = {settings!r}\nPACKED_SOURCES = {sources!r}\nTRANSPORT_INFO = {info!r}\nTRANSPORT_PAYLOAD = (\n'
    literal = ''.join(f'    {encoded[i:i + 4096]!r}\n' for i in range(0, len(encoded), 4096)) + ')\n'
    core = Path(pack.__file__).read_text(encoding='utf-8').rsplit('\nif __name__ == ', 1)[0]
    runtime = '\n\n'.join(inspect.getsource(func) for func in (
        mounted_output, pinned_matches, locate_attachment, unpack_members, unpack_packet, embedded_entry))
    namespace = f'\nimport lzma\nPACKED_FILES = {PACKED_FILES!r}\nREFERENCE_SOURCES = {REFERENCE_SOURCES!r}\nRECIPE_FILE = {RECIPE_FILE!r}\n'
    content = header + literal + core + namespace + runtime + '\nif __name__ == "__main__":\n    embedded_entry(PACKED_SETTINGS, PACKED_SOURCES, TRANSPORT_INFO, TRANSPORT_PAYLOAD)\n'
    check_source_size(content)
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
               'kernelId': metadata['id'], 'teacherKernel': TEACHER_KERNEL, 'corpusKernel': CORPUS_KERNEL, 'transport': info,
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
    parser.add_argument('--recipe', type=Path, required=True)
    parser.add_argument('--resume', action='store_true', help='Mount the prior paired kernel pinned in the underlying resume packet')
    args = parser.parse_args()
    print(json.dumps(build(args.from_packet, args.out, args.recipe, resume=args.resume), indent=2, sort_keys=True))


if __name__ == '__main__':
    main()
