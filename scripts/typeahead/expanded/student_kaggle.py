"""Stage and verify the private N253 paired-student Kaggle experiment locally."""
import argparse
import ast
import base64
from collections import Counter
from contextlib import closing
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import unicodedata
import zipfile

TEACHER_SHA = 'b5ff62b315695b32b2f85e51f9ddffc2abdd64f25c17d68bd35a2d0712983687'
TOKENIZER_SHA = 'd0badb33606fb1d365c5a9129aa9e2caf4cab30ecfb39a8f8aeabb420dacbefc'
COUNT_SHA = 'c97bacd0de80f08a66f65a76c610c8fa6076daaf70f328f4eb8be684e7ef9ba8'
CORPUS_SHA = '1a0406ec50ef4c0389e5aabad15d51717d4689f6d405c66594c1c1d0ea561c2b'
T4_SHAPE, T4_COUNT = 'NvidiaTeslaT4', 2
MAX_SESSION_SECONDS = 7200
INPUTS = ('data.jsonl', 'data-manifest.json', 'tokenizer.json', 'teacher.pt')
SOURCES = ('build-ngram.py', 'kn_build.py', *(f'expanded/{name}.py' for name in (
    'corpus', 'distill_menu', 'neural', 'student_proposals', 'subwords', 'train')))
PACKET_FILE = 'student-packet.json'
RECEIPT_FILE = 'student-kaggle-receipt.json'
RUN_DIR = 'student-training'
COMPLETE = ('run.json', 'latest.pt', 'metrics.json', 'direct.pt', 'distilled.pt', 'proposal-vocabulary.json')
RESUME_FILES = ('run.json', 'teacher-scores.sqlite3', 'proposal-vocabulary.json', 'latest.pt')
HASH = re.compile(r'^[a-f0-9]{64}$')
IDENTIFIER = re.compile(r'^[a-zA-Z0-9_-]+/[a-z0-9-]+$')
ROW_FIELDS = {'group', 'split', 'kind', 'question', 'draft', 'prefix', 'gold', 'candidates'}
DEFAULT_TRAIN = dict(epochs=3, batch_size=64, lr=.001, seed=253, student_context=192, temperature=2.0,
                     distill_weight=.35, teacher_rows=64, teacher_batch_size=32, teacher_logit_chunk=128,
                     teacher_dtype='auto', checkpoint_every=200, retrieval_weight=.2,
                     retrieval_negatives=64, proposal_vocab=8192, proposal_min_count=1)
OFFLINE_CHILD = '''
import runpy, socket, sys

def offline(event, values):
    if event in {'socket.gethostbyname', 'socket.gethostbyname_ex', 'socket.getaddrinfo', 'socket.gethostbyaddr', 'socket.getnameinfo'}:
        raise PermissionError('Offline batch does not resolve internet hostnames')
    if event == 'socket.__new__' and values[1] in (socket.AF_INET, socket.AF_INET6):
        raise PermissionError('Offline batch does not open internet sockets')

sys.addaudithook(offline)
try:
    socket.socket(socket.AF_INET, socket.SOCK_STREAM)
except PermissionError:
    print('OFFLINE: Python internet socket guard verified', flush=True)
else:
    raise RuntimeError('Offline socket guard did not apply')
sys.argv = sys.argv[1:]
runpy.run_path(sys.argv[0], run_name='__main__')
'''
PREFLIGHT_CHILD = '''
import json, sqlite3, sys, time
from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace

import torch
from corpus import file_hash
from distill_menu import Config, Encoder, VOCABULARY, accelerated_encoder, build_cache

start = time.monotonic()
dataset, cache = map(Path, sys.argv[1:3])
student_context = int(sys.argv[3])
teacher = torch.load(dataset / 'teacher.pt', map_location='cpu', weights_only=True, mmap=True)
tokenizer_path = dataset / 'tokenizer.json'
tokenizer = Encoder(json.loads(tokenizer_path.read_text())['merges'])
cfg = Config(**teacher['settings']['config'])
if cfg != Config(512, 8, 8, 512) or len(tokenizer.pieces) != VOCABULARY:
    raise ValueError('Unexpected teacher shape or vocabulary in the assembled packet')
if teacher['settings']['tokenizerSha256'] != file_hash(tokenizer_path):
    raise ValueError('Native teacher tokenizer fingerprint disagrees with the assembled packet')
parameter_count = sum(tensor.numel() for tensor in teacher['model'].values())
if parameter_count != 33870848:
    raise ValueError('Unexpected native teacher parameter count')
try:
    encode = accelerated_encoder(tokenizer)
except ModuleNotFoundError as error:
    if error.name != 'tokenizers':
        raise
    encode = tokenizer.encode
build_cache(cache, 'local-package-preflight', dataset / 'data.jsonl', SimpleNamespace(encode=encode),
            {'studentContext': student_context, 'teacherConfig': asdict(cfg)})
with sqlite3.connect(cache) as db:
    rows = dict(db.execute('SELECT split, COUNT(*) FROM slates GROUP BY split'))
    groups = dict(db.execute('SELECT split, COUNT(*) FROM groups GROUP BY split'))
    teacher_rows = db.execute("SELECT COUNT(*) FROM slates WHERE split='fit' AND scores IS NULL").fetchone()[0]
print(json.dumps({'torch': str(torch.__version__), 'teacherConfig': asdict(cfg), 'teacherParameters': parameter_count,
                  'vocabulary': len(tokenizer.pieces), 'indexedRows': rows, 'indexedGroups': groups,
                  'fitSlatesRequiringTeacherScores': teacher_rows, 'elapsedSeconds': time.monotonic() - start}))
'''


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def write_json(path, value):
    scratch = path.with_suffix(path.suffix + '.tmp')
    scratch.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    scratch.replace(path)


def json_file(path):
    return json.loads(path.read_text(encoding='utf-8'))


def describe_file(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError(f'Expected a regular file: {path.name}')
    return {'sha256': digest(path), 'bytes': path.stat().st_size}


def require_digest(path, expected):
    if not HASH.fullmatch(expected) or describe_file(path)['sha256'] != expected:
        raise ValueError(f'SHA-256 mismatch for {path.name}')


def word(text):
    if (not isinstance(text, str) or not 1 <= len(text) <= 32 or text != text.lower() or
            unicodedata.category(text[0])[0] != 'L'):
        return False
    letter_needed = False
    for char in text:
        category = unicodedata.category(char)
        if char in "'’" or category == 'Pd':
            if letter_needed:
                return False
            letter_needed = True
        elif category[0] in 'LM':
            letter_needed = False
        else:
            return False
    return not letter_needed


def validate_data(data, manifest, expected_manifest):
    require_digest(manifest, expected_manifest)
    provenance = json_file(manifest)
    if provenance.get('sourceSplit') != 'train' or provenance.get('countModelSha256') != COUNT_SHA:
        raise ValueError('The data receipt must identify the audited train split and count model')
    if provenance.get('sourceManifestSha256') != CORPUS_SHA:
        raise ValueError('Train split differs from the audited archived corpus')
    sources = provenance.get('sources', [])
    if not sources or any(set(source) != {'id', 'revision', 'license', 'url'} or
                          source['url'] != 'https://huggingface.co/datasets/' + source['id'] or
                          not source['license'] or not re.fullmatch(r'[a-f0-9]{40}', source['revision']) for source in sources):
        raise ValueError('Missing public source attribution')
    require_digest(data, provenance.get('dataSha256', ''))
    groups, splits, kinds, split_kinds = {}, Counter(), Counter(), Counter()
    with data.open(encoding='utf-8') as source:
        for line_no, line in enumerate(source, 1):
            row = json.loads(line)
            if not isinstance(row, dict) or set(row) != ROW_FIELDS:
                raise ValueError(f'Unexpected fields in training row {line_no}')
            group, split, kind = row['group'], row['split'], row['kind']
            if not isinstance(group, str) or not 1 <= len(group) <= 256 or split not in ('fit', 'calibration') or kind not in ('boundary', 'prefix'):
                raise ValueError(f'Row {line_no} is outside the permitted train-only split')
            if groups.setdefault(group, split) != split:
                raise ValueError(f'Group crosses fit and calibration in row {line_no}')
            question, draft, prefix = row['question'], row['draft'], row['prefix']
            if not all(isinstance(x, str) for x in (question, draft, prefix)) or not draft.endswith(prefix) or bool(prefix) != (kind == 'prefix'):
                raise ValueError(f'Typed context disagrees with input lane in row {line_no}')
            candidates = row['candidates']
            if (not word(row['gold']) or not isinstance(candidates, list) or len(candidates) > 32 or
                    not all(map(word, candidates)) or len(set(candidates)) != len(candidates)):
                raise ValueError(f'Malformed shortlist or label in row {line_no}')
            stem = prefix.lower()
            if any(not text.startswith(stem) or text == stem for text in [row['gold'], *candidates]):
                raise ValueError(f'Shortlist or label disagrees with typed stem in row {line_no}')
            splits[split] += 1
            kinds[kind] += 1
            split_kinds[f'{split}|{kind}'] += 1
    group_splits = dict(Counter(groups.values()))
    if (len(splits) != 2 or sum(splits.values()) != provenance.get('rows') or len(groups) != provenance.get('groups') or
            dict(split_kinds) != provenance.get('rowsBySplitAndKind') or group_splits != provenance.get('groupsBySplit')):
        raise ValueError('Train-only row or group totals disagree with the receipt')
    return {'rows': sum(splits.values()), 'groups': len(groups), 'splitRows': dict(splits), 'kindRows': dict(kinds),
            'splitGroups': group_splits, 'sources': sources, 'sourceManifestSha256': CORPUS_SHA, 'dataManifestSha256': expected_manifest}


def source_archive():
    binary = io.BytesIO()
    source_root = Path(__file__).resolve().parent.parent
    with zipfile.ZipFile(binary, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name in SOURCES:
            data = (source_root / name).read_bytes()
            compile(data, name, 'exec')
            archive.writestr(zipfile.ZipInfo(name), data, compress_type=zipfile.ZIP_DEFLATED)
    return binary.getvalue()


def verify_sources(bundle, expected, destination=None):
    if hashlib.sha256(bundle).hexdigest() != expected:
        raise ValueError('Source archive SHA-256 mismatch')
    with zipfile.ZipFile(io.BytesIO(bundle)) as archive:
        if sorted(archive.namelist()) != sorted(SOURCES):
            raise ValueError('Unexpected source archive roster')
        for name in SOURCES:
            data = archive.read(name)
            compile(data, name, 'exec')
            if destination is not None:
                path = destination / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)


def verify_packet(dataset, expected):
    require_digest(dataset / PACKET_FILE, expected)
    packet = json_file(dataset / PACKET_FILE)
    if packet.get('version') != 1 or set(packet.get('files', {})) != set(INPUTS):
        raise ValueError('Unrecognized student packet')
    for name in INPUTS:
        if describe_file(dataset / name) != packet['files'][name]:
            raise ValueError(f'Packet member changed: {name}')
    if packet['files']['teacher.pt']['sha256'] != TEACHER_SHA or packet['files']['tokenizer.json']['sha256'] != TOKENIZER_SHA:
        raise ValueError('Teacher or tokenizer differs from the measured shortlist experiment')
    result = validate_data(dataset / 'data.jsonl', dataset / 'data-manifest.json', packet['data']['dataManifestSha256'])
    if result != packet['data']:
        raise ValueError('Recomputed data audit differs from the packet')
    return packet


def unique_match(root, name, expected):
    matches = [file for file in root.rglob(name) if file.is_file() and not file.is_symlink() and digest(file) == expected]
    if len(matches) != 1:
        raise ValueError(f'Expected one pinned {name} on the attached Kaggle inputs, found {len(matches)}')
    return matches[0]


def training_identity(settings):
    return hashlib.sha256(canonical({'packetSha256': settings['packetSha256'], 'train': settings['train']})).hexdigest()


def copy_resume(inputs, settings, destination):
    path = unique_match(inputs, RECEIPT_FILE, settings['resumeReceiptSha256'])
    receipt = json_file(path)
    if receipt.get('trainingIdentity') != training_identity(settings) or receipt.get('status') != 'resumable-time-cap':
        raise ValueError('Resume receipt is not a time-capped run of this exact experiment')
    origin = path.parent / RUN_DIR
    outputs = receipt.get('outputs', {})
    if 'run.json' not in outputs or 'latest.pt' in outputs and 'teacher-scores.sqlite3' not in outputs:
        raise ValueError('Resume needs the run settings and, after optimization starts, its teacher-score cache')
    for name in (name for name in RESUME_FILES if name in outputs):
        source = origin / name
        if describe_file(source) != outputs[name]:
            raise ValueError(f'Resume artifact changed: {name}')
        shutil.copyfile(source, destination / name)


def gpu_info():
    import torch
    if not torch.cuda.is_available() or torch.cuda.device_count() != T4_COUNT:
        raise RuntimeError('Expected the Kaggle T4 x2 allocation')
    devices = []
    for index in range(T4_COUNT):
        prop = torch.cuda.get_device_properties(index)
        if not re.search(r'\bT4\b', prop.name) or (prop.major, prop.minor) != (7, 5):
            raise RuntimeError(f'Unexpected accelerator: {prop.name}')
        devices.append({'name': prop.name, 'capability': [prop.major, prop.minor], 'memoryBytes': prop.total_memory})
    return {'torch': torch.__version__, 'cuda': torch.version.cuda, 'devices': devices, 'trainingDevice': 'cuda:0'}


def run_training(command, env, end):
    # Stop before Kaggle's hard limit so the notebook may publish an atomic resume checkpoint.
    remaining = end - time.monotonic()
    if remaining <= 0:
        raise RuntimeError('Session budget was consumed before training')
    with subprocess.Popen(command, env=env) as child:
        try:
            return child.wait(timeout=remaining), False
        except subprocess.TimeoutExpired:
            child.terminate()
            try:
                child.wait(timeout=15)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
            return child.returncode, True


def resume_ready(out):
    if not (out / 'run.json').is_file():
        return False
    cache = out / 'teacher-scores.sqlite3'
    if cache.is_file():
        # A timed stop can leave a rollback journal. Recover and check it before
        # pinning the main database so a read-only Kaggle attachment can resume.
        with closing(sqlite3.connect(cache)) as db:
            if db.execute('PRAGMA quick_check(1)').fetchone() != ('ok',):
                raise ValueError('Interrupted teacher-score cache is invalid')
    return cache.is_file() or not (out / 'latest.pt').exists()


def remote(settings, encoded_sources):
    start = time.monotonic()
    inputs, work = Path('/kaggle/input'), Path('/kaggle/working')
    if settings['enableInternet'] is not False:
        raise RuntimeError('This Kaggle experiment must run offline')
    out = work / RUN_DIR
    out.mkdir(exist_ok=False)
    receipt_path = work / RECEIPT_FILE
    receipt = {'version': 1, 'trainingIdentity': training_identity(settings), 'packetSha256': settings['packetSha256'],
               'status': 'failed', 'sessionSecondsAllowed': settings['sessionSeconds'], 'train': settings['train'],
               'enableInternet': False, 'resumeReceiptSha256': settings['resumeReceiptSha256']}
    train_start = None
    try:
        manifest = unique_match(inputs, PACKET_FILE, settings['packetSha256'])
        packet = verify_packet(manifest.parent, settings['packetSha256'])
        receipt.update(data=packet['data'], files=packet['files'], sourceCommit=packet['sourceCommit'],
                       sourceArchiveSha256=packet['sourceArchiveSha256'], accelerator=gpu_info())
        if settings['resumeReceiptSha256']:
            copy_resume(inputs, settings, out)
        with tempfile.TemporaryDirectory(prefix='lemma-student-') as temporary:
            sources = Path(temporary)
            verify_sources(base64.b64decode(encoded_sources, validate=True), packet['sourceArchiveSha256'], sources)
            trainer = sources / 'expanded' / 'distill_menu.py'
            args = [sys.executable, '-c', OFFLINE_CHILD, str(trainer),
                    '--data', str(manifest.parent / 'data.jsonl'), '--teacher', str(manifest.parent / 'teacher.pt'),
                    '--tokenizer', str(manifest.parent / 'tokenizer.json'), '--out', str(out), '--device', 'cuda:0']
            for name, value in settings['train'].items():
                args.extend(('--' + name.replace('_', '-'), str(value)))
            if settings['resumeReceiptSha256']:
                args.append('--resume')
            env = dict(os.environ, PYTHONPATH=str(trainer.parent), PIP_NO_INDEX='1', HF_HUB_OFFLINE='1',
                       TRANSFORMERS_OFFLINE='1', WANDB_MODE='disabled')
            train_start = time.monotonic()
            print('PAIR START', json.dumps(receipt, sort_keys=True), flush=True)
            code, timed_out = run_training(args, env, start + settings['sessionSeconds'] - 60)
            if all((out / name).is_file() for name in COMPLETE) and (code == 0 or timed_out):
                receipt['status'] = 'complete'
            elif timed_out and resume_ready(out):
                receipt['status'] = 'resumable-time-cap'
            else:
                raise RuntimeError(f'Trainer exited {code} with timedOut={timed_out} before publishing required artifacts')
            receipt['offlinePythonSocketGuardVerified'] = True
    finally:
        for path in out.glob('teacher-scores.building.sqlite3*'):
            path.unlink(missing_ok=True)
        outputs = {p.name: describe_file(p) for p in sorted(out.iterdir()) if p.is_file() and not p.name.endswith('.tmp')}
        now = time.monotonic()
        receipt.update(outputs=outputs, sessionSeconds=now - start, trainingSeconds=now - train_start if train_start else 0,
                       allocatedGpuHours=(now - start) * T4_COUNT / 3600 if 'accelerator' in receipt else 0)
        write_json(receipt_path, receipt)
        print('PAIR RECEIPT', json.dumps(receipt, sort_keys=True), flush=True)


def build(args):
    for identifier in [args.dataset_id, args.kernel_id, *([args.resume_kernel] if args.resume_kernel else [])]:
        if not IDENTIFIER.fullmatch(identifier):
            raise ValueError('Use an owner/slug Kaggle identifier')
    if args.resume_kernel == args.kernel_id:
        raise ValueError('A resumed notebook needs a new slug so its previous output remains pinned')
    if bool(args.resume_kernel) != bool(args.resume_receipt_sha256) or (args.resume_receipt_sha256 and not HASH.fullmatch(args.resume_receipt_sha256)):
        raise ValueError('Resume needs a prior private kernel and the exact output receipt SHA-256')
    if not 60 < args.session_seconds <= MAX_SESSION_SECONDS or not re.fullmatch(r'[a-f0-9]{40}', args.commit):
        raise ValueError('Specify a full source commit and a session of 61 to 7,200 seconds')
    data = validate_data(args.data_dir / 'data.jsonl', args.data_dir / 'data-manifest.json', args.data_manifest_sha256)
    require_digest(args.teacher, TEACHER_SHA)
    require_digest(args.tokenizer, TOKENIZER_SHA)
    bundle = source_archive()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    if args.out.exists():
        raise FileExistsError(args.out)
    with tempfile.TemporaryDirectory(prefix='.student-packet-', dir=args.out.parent) as temporary:
        staged = Path(temporary) / 'packet'
        result = write_packet(args, staged, data, bundle)
        if args.out.exists():
            raise FileExistsError(args.out)
        write_json(staged / 'submission-receipt.json', dict(result, commands=kaggle_commands(args.out.resolve(), result)))
        staged.rename(args.out)
    return dict(result, commands=kaggle_commands(args.out.resolve(), result))


def kaggle_commands(out, receipt):
    dataset_id = receipt['datasetId']
    commands = [] if receipt['resumeKernel'] else [
        ['datasets', 'create', '--path', str(out / 'dataset'), '--dir-mode', 'skip', '--keep-tabular']]
    return commands + [
        ['datasets', 'status', dataset_id, '--format', 'json'],
        ['kernels', 'push', '--path', str(out / 'kernel'), '--accelerator', T4_SHAPE, '--timeout', str(receipt['sessionSeconds'])],
    ]


def write_packet(args, out, data, bundle):
    out.mkdir(mode=0o700)
    dataset, kernel = out / 'dataset', out / 'kernel'
    dataset.mkdir()
    kernel.mkdir()
    for path, name in zip((args.data_dir / 'data.jsonl', args.data_dir / 'data-manifest.json', args.tokenizer, args.teacher), INPUTS, strict=True):
        shutil.copyfile(path, dataset / name)
    packet = {'version': 1, 'sourceCommit': args.commit, 'sourceArchiveSha256': hashlib.sha256(bundle).hexdigest(),
              'data': data, 'datasetId': args.dataset_id, 'files': {name: describe_file(dataset / name) for name in INPUTS}}
    write_json(dataset / PACKET_FILE, packet)
    notices = '\n'.join(f"{source['id']} @ {source['revision']} · {source['license']} · {source['url']}" for source in data['sources'])
    write_json(dataset / 'dataset-metadata.json', {'id': args.dataset_id, 'title': 'Lemma N253 student training inputs',
               'licenses': [{'name': 'other'}], 'description': 'Private paired training inputs from the archived train split. '
               'Upstream notices and exact revisions are in data-manifest.json.\n\n' + notices})
    settings = {'packetSha256': digest(dataset / PACKET_FILE), 'sessionSeconds': args.session_seconds,
                'enableInternet': False, 'resumeReceiptSha256': args.resume_receipt_sha256, 'train': DEFAULT_TRAIN}
    metadata = {'id': args.kernel_id, 'title': args.kernel_id.split('/')[1], 'code_file': 'run.py', 'language': 'python',
                'kernel_type': 'script', 'is_private': True, 'enable_internet': False, 'enable_gpu': True,
                'machine_shape': T4_SHAPE, 'dataset_sources': [args.dataset_id], 'competition_sources': [],
                'kernel_sources': [args.resume_kernel] if args.resume_kernel else []}
    write_json(kernel / 'kernel-metadata.json', metadata)
    encoded = base64.b64encode(bundle).decode('ascii')
    wrapper = Path(__file__).read_text(encoding='utf-8')
    content = f'PACKED_SETTINGS = {settings!r}\nPACKED_SOURCES = {encoded!r}\n' + wrapper
    (kernel / 'run.py').write_text(content, encoding='utf-8')
    return verify_local(out)


def verify_local(out):
    dataset, kernel = out / 'dataset', out / 'kernel'
    if {path.name for path in dataset.iterdir()} != {*INPUTS, PACKET_FILE, 'dataset-metadata.json'} or {path.name for path in kernel.iterdir()} != {'kernel-metadata.json', 'run.py'}:
        raise ValueError('Unexpected upload roster')
    ds_meta = json_file(dataset / 'dataset-metadata.json')
    metadata = json_file(kernel / 'kernel-metadata.json')
    if any(metadata.get(key) is not value for key, value in {'is_private': True, 'enable_internet': False, 'enable_gpu': True}.items()):
        raise ValueError('The kernel must be private, GPU-enabled and offline')
    if metadata.get('machine_shape') != T4_SHAPE or metadata.get('dataset_sources') != [ds_meta['id']] or metadata.get('competition_sources') != []:
        raise ValueError('Unexpected Kaggle hardware or attached source')
    settings_ast, sources_ast, *_ = ast.parse((kernel / 'run.py').read_bytes()).body
    settings, sources = ast.literal_eval(settings_ast.value), ast.literal_eval(sources_ast.value)
    packet = verify_packet(dataset, settings['packetSha256'])
    resume = metadata.get('kernel_sources')
    if (packet['datasetId'] != ds_meta['id'] or settings['enableInternet'] is not False or not isinstance(resume, list) or
            len(resume) > 1 or bool(resume) != bool(settings['resumeReceiptSha256'])):
        raise ValueError('Dataset identity or offline setting changed')
    verify_sources(base64.b64decode(sources, validate=True), packet['sourceArchiveSha256'])
    return {'baseCommit': packet['sourceCommit'], 'datasetId': ds_meta['id'], 'kernelId': metadata['id'],
            'packetSha256': settings['packetSha256'], 'trainingIdentity': training_identity(settings),
            'sourceArchiveSha256': packet['sourceArchiveSha256'], 'kernelSha256': digest(kernel / 'run.py'),
            'files': packet['files'], 'data': packet['data'], 'train': settings['train'],
            'private': True, 'internet': False, 'accelerator': T4_SHAPE, 'sessionSeconds': settings['sessionSeconds'],
            'maximumAllocatedGpuHours': settings['sessionSeconds'] * T4_COUNT / 3600,
            'resumeKernel': next(iter(resume), None), 'resumeReceiptSha256': settings['resumeReceiptSha256']}


def local_preflight(out):
    verified = verify_local(out)
    settings_ast, sources_ast, *_ = ast.parse((out / 'kernel' / 'run.py').read_bytes()).body
    settings, encoded = ast.literal_eval(settings_ast.value), ast.literal_eval(sources_ast.value)
    with tempfile.TemporaryDirectory(prefix='lemma-student-preflight-') as workspace:
        files = Path(workspace)
        verify_sources(base64.b64decode(encoded, validate=True), verified['sourceArchiveSha256'], files)
        trainer = files / 'expanded' / 'distill_menu.py'
        driver = trainer.with_name('preflight.py')
        driver.write_text(PREFLIGHT_CHILD, encoding='utf-8')
        env = dict(os.environ, PYTHONPATH=str(trainer.parent), PIP_NO_INDEX='1', HF_HUB_OFFLINE='1',
                   TRANSFORMERS_OFFLINE='1', WANDB_MODE='disabled')
        help_run = subprocess.run([sys.executable, '-c', OFFLINE_CHILD, str(trainer), '--help'],
                                  env=env, check=True, stdout=subprocess.PIPE, text=True)
        for name in settings['train']:
            flag = '--' + name.replace('_', '-')
            if not re.search(r'(?<![\w-])' + re.escape(flag) + r'(?![\w-])', help_run.stdout):
                raise ValueError(f'Packed trainer does not accept {flag}')
        run = subprocess.run([sys.executable, '-c', OFFLINE_CHILD, str(driver), str((out / 'dataset').resolve()),
                              str(files / 'index.sqlite3'), str(settings['train']['student_context'])], env=env,
                             check=True, stdout=subprocess.PIPE, text=True)
        if 'Python internet socket guard verified' not in run.stdout:
            raise ValueError('Packed offline guard did not run')
        tested = json.loads(run.stdout.splitlines()[-1])
        if tested['indexedRows'] != verified['data']['splitRows'] or tested['indexedGroups'] != verified['data']['splitGroups']:
            raise ValueError('Packed trainer index differs from the independent input audit')
        return {'trainingIdentity': verified['trainingIdentity'], 'sourceArchiveSha256': verified['sourceArchiveSha256'],
                'offlinePythonSocketGuardVerified': True, **tested}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    stage = commands.add_parser('build')
    for name in ('out', 'data-dir', 'teacher', 'tokenizer'):
        stage.add_argument('--' + name, type=Path, required=True)
    for name in ('dataset-id', 'kernel-id', 'data-manifest-sha256', 'commit'):
        stage.add_argument('--' + name, required=True)
    stage.add_argument('--session-seconds', type=int, default=MAX_SESSION_SECONDS)
    stage.add_argument('--resume-kernel')
    stage.add_argument('--resume-receipt-sha256')
    listing = commands.add_parser('verify')
    listing.add_argument('--out', type=Path, required=True)
    preflight = commands.add_parser('preflight')
    preflight.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = build(args) if args.command == 'build' else (local_preflight if args.command == 'preflight' else verify_local)(args.out)
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == '__main__':
    if 'PACKED_SETTINGS' in globals():
        remote(PACKED_SETTINGS, PACKED_SOURCES)
    else:
        main()
