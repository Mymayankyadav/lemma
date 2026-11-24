"""Package a staged, private Kaggle script without putting secrets in the notebook."""
import argparse
import base64
import io
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ['build-ngram.py', 'build-latex.py', 'kn_build.py', *[
    f'expanded/{name}.py' for name in ('corpus', 'public_sources', 'subwords', 'ngram', 'neural', 'train', 'export', 'fit', 'score_assets')
]]
REPO = re.compile(r'^[A-Za-z0-9_-]+/[a-z0-9-]+$')
STAGE = r'''
import json, pathlib, shutil, subprocess, sys, time

print('BUILD', json.dumps({'commit': commit, 'sourceArchiveSha256': archive_sha256}), flush=True)

def run(cmd, timeout=None):
    print("STEP", json.dumps(cmd), flush=True)
    subprocess.run(cmd, check=True, timeout=timeout)

def locate(name):
    roots = list(pathlib.Path('/kaggle/input').rglob(name))
    matches = [path for path in roots if path.is_dir()]
    if len(matches) != 1:
        raise RuntimeError(f"Expected precisely one staged {name} directory and found {len(matches)}")
    return matches[0]

def locate_file(name):
    matches = [path for path in pathlib.Path('/kaggle/input').rglob(name) if path.is_file()]
    if len(matches) != 1:
        raise RuntimeError(f"Expected precisely one staged {name} file and found {len(matches)}")
    return matches[0]

def command(script, *args):
    return [sys.executable, str(root / 'expanded' / (script + '.py')), *map(str, args)]

work = pathlib.Path('/kaggle/working')
if stage == 'provenance':
    from public_sources import fetch
    spec = fetch(pathlib.Path('/tmp/lemma-provenance-source'), (1, 1, 1))
    shutil.copyfile(spec, work / 'verified-source-preflight.json')
elif stage == 'group-audit':
    from corpus import audit_groups, file_hash
    pool, development = locate('corpus'), locate('corpus-dev')
    report = {'passed': True, 'counts': audit_groups(pool, development, '/tmp'),
              'corpusSha256': file_hash(pool / 'manifest.json'),
              'developmentSha256': file_hash(development / 'manifest.json')}
    (work / 'group-audit.json').write_text(json.dumps(report, indent=2, sort_keys=True) + '\n')
    print('GROUP AUDIT', json.dumps(report, sort_keys=True), flush=True)
elif stage == 'cpu':
    from corpus import build
    from public_sources import fetch
    from subwords import prepare
    spec = fetch(pathlib.Path('/tmp/lemma-source'), source_counts)
    corpus = work / 'corpus'
    assert target_words in (100_000_000, 500_000_000, 1_000_000_000)
    development = work / 'corpus-dev' if target_words > 100_000_000 else None
    manifest = build(spec, corpus, target_words, 4000, development=development)
    print('CORPUS COUNTS', json.dumps(manifest['counts'], sort_keys=True), flush=True)
    if any(manifest['shortfallByRegister'].values()):
        raise RuntimeError(f"Word targets short by register: {manifest['shortfallByRegister']}")
    if not corpus_only:
        run([sys.executable, '-m', 'pip', 'install', '-q', 'tokenizers==0.22.1'])
        if development:
            # Both pools share a tokenizer frozen on the nested development training set.
            small = prepare(development, work / 'prepared-dev', 3_000_000, (512, 1024))
            print('DEVELOPMENT SUBWORD COUNTS', json.dumps(small['counts']), flush=True)
        frozen = work / 'prepared-dev' / 'tokenizer.json' if development else None
        result = prepare(corpus, work / 'prepared', 3_000_000, (512, 1024), target_subwords, frozen)
        print('SUBWORD COUNTS', json.dumps(result['counts']), flush=True)
        if target_subwords is not None and result['counts']['train']['tokens'] < minimum_subwords:
            raise RuntimeError(f"Subword corpus fell short of the required {minimum_subwords} tokens")
elif stage == 'tokenizer':
    from corpus import file_hash
    from corpus import SPLITS
    from subwords import prepare, train
    group_report = json.loads(locate_file('group-audit.json').read_text())
    dev = locate(corpus_dir or 'corpus-dev')
    manifest = file_hash(dev / 'manifest.json')
    if not group_report.get('passed') or group_report['developmentSha256'] != manifest:
        raise RuntimeError('Tokenizer input differs from the audited development corpus')
    run([sys.executable, '-m', 'pip', 'install', '-q', 'tokenizers==0.22.1'])
    tokenizer = work / 'frozen-tokenizer.json'
    train(dev, tokenizer, 3_000_000)
    heldout = work / 'shared-heldout'
    prepare(dev, heldout, 3_000_000, (512, 1024), frozen_tokenizer=tokenizer, splits=SPLITS[1:])
    output = {'version': 1, 'tokenizerSha256': file_hash(tokenizer), 'tokenizerBytes': tokenizer.stat().st_size,
              'developmentSha256': manifest, 'split': 'train', 'sampleWords': 3_000_000,
              'sharedHeldoutSha256': file_hash(heldout / 'manifest.json')}
    (work / 'frozen-tokenizer-manifest.json').write_text(json.dumps(output, indent=2, sort_keys=True) + '\n')
    print('TOKENIZER FROZEN', json.dumps(output, sort_keys=True), flush=True)
elif stage == 'prepare':
    from corpus import file_hash
    from subwords import prepare, train
    group_report = json.loads(locate_file('group-audit.json').read_text()) if require_audit else None
    run([sys.executable, '-m', 'pip', 'install', '-q', 'tokenizers==0.22.1'])
    shared_heldout = None
    if require_audit:
        frozen = locate_file('frozen-tokenizer.json')
        shared_heldout = locate('shared-heldout')
        signature = json.loads(locate_file('frozen-tokenizer-manifest.json').read_text())
        if signature['split'] != 'train':
            raise RuntimeError('Tokenizer must be fitted only on training documents')
        if (signature['developmentSha256'] != group_report['developmentSha256'] or
                signature['tokenizerSha256'] != file_hash(frozen) or
                signature['sharedHeldoutSha256'] != file_hash(shared_heldout / 'manifest.json')):
            raise RuntimeError('Cannot verify the common freeze from the audited development pool')
    if prepare_pool == 'development':
        dev = locate(corpus_dir or 'corpus-dev')
        if not require_audit:
            frozen = work / 'frozen-tokenizer.json'
            train(dev, frozen, 3_000_000)
        jobs = [('prepared-dev', dev, None, None)]
        if reference_words:
            jobs.append(('prepared-reference', dev, None, reference_words))
    else:
        if not require_audit:
            frozen = locate('prepared-dev') / 'tokenizer.json'
        jobs = [('prepared', locate(corpus_dir or 'corpus'), target_subwords, None)]
    for label, source, target, words in jobs:
        group_key = 'corpusSha256' if label == 'prepared' else 'developmentSha256'
        if require_audit and (not group_report.get('passed') or file_hash(source / 'manifest.json') != group_report[group_key]):
            raise RuntimeError('Corpus manifest differs from its publisher-group audit')
        contexts = () if label == 'prepared-reference' else (512, 1024)
        result = prepare(source, work / label, 3_000_000, contexts, target, frozen, words, shared_heldout=shared_heldout)
        print('SUBWORD COUNTS', label, json.dumps(result['counts'], sort_keys=True), flush=True)
        if label == 'prepared' and target and result['counts']['train']['tokens'] < minimum_subwords:
            raise RuntimeError(f"Subword corpus fell short of the required {minimum_subwords} tokens")
elif stage == 'ngram':
    from corpus import build, file_hash
    from ngram import build as build_ngram, build_models
    from score_assets import fit_subjects
    if pilot_source:
        import urllib.request
        raw = pathlib.Path('/tmp/lemma-ngram-source')
        raw.mkdir()
        dataset = 'https://huggingface.co/datasets/hoskinson-center/proof-pile'
        revision = '490b980249446f2f3bd2df3a8cf085d0f2de240a'
        compressed = 'proofpile_dev.jsonl.gz'
        original = 'dev/' + compressed
        print('PILOT SOURCE', dataset, revision, original, flush=True)
        urllib.request.urlretrieve(dataset + '/resolve/' + revision + '/' + original, raw / compressed)
        spec = raw / 'sources.json'
        spec.write_text(json.dumps([dict(id='hoskinson-center/proof-pile', revision=revision,
                                        license='CC BY-SA (Math StackExchange text)', register='learner',
                                        url=dataset, groupFields=['meta.question_id', 'meta.url', 'url'],
                                        groupPrefix='https://math.stackexchange.com/questions/',
                                        filter={'meta.set_name':'stack_exchange'},
                                        shards=[dict(path=compressed, originalPath=original,
                                                     sha256='9a33bde2feabb2421936bbde65ab15692ba814812bb2cf0e82a77b35e07e0b9b')])]))
        corpus = pathlib.Path('/tmp/lemma-ngram-corpus')
        manifest = build(spec, corpus, 100_000_000, 4000, mix=dict(explanation=0, proof=0, learner=1))
        (work / 'ngram-corpus-manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True))
    else:
        corpus = locate(corpus_dir or 'corpus')
    if require_audit:
        audit = json.loads(locate_file('group-audit.json').read_text())
        if not audit.get('passed') or file_hash(corpus / 'manifest.json') not in (
                audit['corpusSha256'], audit['developmentSha256']):
            raise RuntimeError('N-gram inputs differ from the audited corpus')
    latex_pruning = pruning_methods[0]
    if ngram_task != 'latex':
        report = []
        targets = [(work / f'ngram{order}-{pruning}', order, pruning)
                   for order in ngram_orders for pruning in pruning_methods]
        for target, result in build_models(corpus, targets, 20 * 1024 * 1024, 60000, 'ngram', None):
            report.append((target.name, result))
            print('NGRAM', json.dumps(result, sort_keys=True), flush=True)
        chosen, selected = min(report, key=lambda entry: entry[1]['metrics']['validation']['perplexity'])
        latex_pruning = selected['pruning']
        vocab = work / chosen / 'vocab.json'
        subject_models = {}
        for subject in subjects:
            subject_models[subject] = work / ('subject-' + subject)
            result = build_ngram(corpus, subject_models[subject], selected['order'], 4 * 1024 * 1024,
                                 60000, selected['pruning'], 'ngram', subject, vocab)
            print('SUBJECT', json.dumps(result, sort_keys=True), flush=True)
        mixture = fit_subjects(corpus, work / chosen, subject_models, pathlib.Path('/tmp/lemma-mixture-events.jsonl'), 250_000)
        (work / chosen / 'mixture-diagnostic.json').write_text(json.dumps(mixture, indent=2, sort_keys=True) + '\n')
        print('MIXTURE', json.dumps(mixture, sort_keys=True), flush=True)
        (work / 'ngram-selection.json').write_text(json.dumps({'selected': chosen, 'comparisons': report},
                                                            indent=2, sort_keys=True) + '\n')
    if ngram_task != 'prose':
        result = build_ngram(corpus, work / 'latex-v2', 4, 2 * 1024 * 1024, 1500, latex_pruning,
                             'latex', None, train_limit=latex_train_tokens)
        print('LATEX', json.dumps(result, sort_keys=True), flush=True)
        if require_audit and result['metrics']['trainTokens'] < latex_train_tokens:
            raise RuntimeError('Audited LaTeX corpus did not reach the predicted formula token target')
elif stage == 'prepared-audit':
    from subwords import audit_prepared_membership
    dev, ref = locate('prepared-dev'), locate('prepared-reference')
    sources = [(dev, 'developmentSha256'), (ref, 'developmentSha256')]
    full = locate('prepared') if audit_pool == 'all' else None
    if full:
        sources.append((full, 'corpusSha256'))
    group_report = json.loads(locate_file('group-audit.json').read_text())
    for path, key in sources:
        prepared_manifest = json.loads((path / 'manifest.json').read_text())
        if not group_report.get('passed') or prepared_manifest['corpus'] != group_report[key]:
            raise RuntimeError('Prepared comparison corpus differs from the publisher-group audit')
    report = audit_prepared_membership(full, dev, ref, '/tmp')
    (work / 'prepared-audit.json').write_text(json.dumps(report, indent=2, sort_keys=True) + '\n')
    print('PREPARED MEMBERSHIP AUDIT', json.dumps(report, sort_keys=True), flush=True)
elif stage == 'gpu':
    import torch
    from corpus import file_hash
    allocated = torch.cuda.device_count()
    if allocated != assigned_gpus:
        raise RuntimeError(f"Expected {assigned_gpus} assigned GPUs; found {allocated}")
    data = locate(data_dir)
    if require_audit:
        audit = json.loads(locate_file('prepared-audit.json').read_text())
        if not audit.get('passed') or audit['preparedManifestSha256'].get(data_dir) != file_hash(data / 'manifest.json'):
            raise RuntimeError('Prepared data does not match the frozen, audited comparison pools')
    browsers = [name for name in ('chromium', 'chromium-browser', 'google-chrome', 'chrome')
                if shutil.which(name)]
    graphics = {'browserBinaries': browsers,
                'vulkanIcdNames': sorted(path.name for directory in ('/etc/vulkan/icd.d', '/usr/share/vulkan/icd.d')
                                         for path in pathlib.Path(directory).glob('*.json'))}
    search = subprocess.run(['ldconfig', '-p'], capture_output=True, text=True, check=False) if shutil.which('ldconfig') else None
    graphics['libraries'] = sorted({line.split()[0] for line in (search.stdout.splitlines() if search else [])
                                    if line.lstrip().startswith(('libvulkan', 'libEGL', 'libGLX_nvidia'))})
    print('GRAPHICS AVAILABILITY', json.dumps(graphics), flush=True)
    max_seconds = allocated_hours * 3600 / assigned_gpus
    deadline = start + max_seconds
    reserve_seconds = 90

    def planned(script, extra, ranks=1, minutes=None):
        seconds = min(deadline - time.monotonic() - reserve_seconds, float('inf') if minutes is None else minutes * 60)
        if seconds < 30:
            raise RuntimeError('GPU allocation may not cover the next checkpoint')
        opts = ['--candidate', candidate, '--sequence-length', sequence_length, '--data', data,
                '--max-minutes', max(0.1, (seconds - 15) / 60), '--schedule-tokens', schedule_tokens,
                '--lr', learning_rate]
        if adapt:
            opts.append('--adapt')
        train = command('train', *opts, *extra)
        if ranks > 1:
            train = [sys.executable, '-m', 'torch.distributed.run', '--standalone', '--nproc_per_node',
                     str(ranks), *train[1:]]
        run(train, timeout=seconds)

    ledger = {'assignedGpus': allocated, 'leasedHours': allocated_hours,
              'candidate': candidate, 'mode': mode, 'commit': commit, 'stagedData': str(data),
              'graphicsAvailability': graphics}
    try:
        selected = train_ranks
        if mode == 'throughput':
            reports = {}
            trials = [(batch, chunk) for batch in probe_batches for chunk in probe_logit_chunks]
            for batch, chunk in trials:
                key = f'batch-{batch}-chunk-{chunk}'
                trial = work / ('trial-' + key)
                accumulation_at_batch = 64 // (batch * selected)
                try:
                    planned('train', ['--out', trial, '--stop-tokens', 2_000_000, '--validation-windows', 8,
                                      '--microbatch', batch, '--accumulate', accumulation_at_batch, '--logit-chunk', chunk],
                            selected, minutes=4)
                    report = json.loads((trial / 'metrics.json').read_text())
                    reports[key] = {'microbatch': batch, 'logitChunk': chunk, 'tokensPerSecond': report['runTokens'] / report['elapsedSeconds'],
                                      'peakMemoryBytes': report['peakMemoryBytes'],
                                      'targets': report['runTokens'], 'accumulation': accumulation_at_batch,
                                      'ranks': selected}
                    shutil.rmtree(trial)
                except subprocess.CalledProcessError:
                    reports[key] = {'microbatch': batch, 'logitChunk': chunk, 'failed': True}
            passing = {batch: row for batch, row in reports.items() if 'tokensPerSecond' in row}
            if not passing:
                raise RuntimeError('All equal-effective-batch trials failed')
            ledger['batchAndChunkTrials'] = reports
            best_trial = max(passing, key=lambda key: passing[key]['tokensPerSecond'])
            ledger['selectedTrial'] = passing[best_trial]
            print('THROUGHPUT', json.dumps(ledger), flush=True)
        if mode == 'pilot':
            if allocated < 2:
                raise RuntimeError('Pilot needs two GPUs to compare one- and two-device throughput')
            speed = {}
            for ranks in (1, 2):
                trial = work / f'trial-{ranks}'
                planned('train', ['--out', trial, '--stop-tokens', 200_000, '--validation-windows', 8,
                                  '--accumulate', 8 // ranks], ranks, minutes=3)
                report = json.loads((trial / 'metrics.json').read_text())
                speed[ranks] = report['runTokens'] / report['elapsedSeconds']
                shutil.rmtree(trial)
            selected = max(speed, key=speed.get)
            ledger['throughputTokensPerSecond'] = speed
            print('THROUGHPUT', json.dumps(ledger), flush=True)
        if mode != 'throughput':
            checkpoint = []
            if resume_dir:
                checkpoint = ['--resume', locate(resume_dir) / 'latest.pt']
            elif initialize_dir:
                checkpoint = ['--initialize', locate(initialize_dir) / checkpoint_file]
            out = work / 'training'
            planned('train', ['--out', out, '--stop-tokens', stop_tokens, '--accumulate', accumulation,
                              '--microbatch', microbatch, '--logit-chunk', logit_chunk, *checkpoint], selected, minutes=training_minutes)
            if mode == 'pilot':
                report = json.loads((out / 'metrics.json').read_text())
                planned('train', ['--out', out, '--stop-tokens', report['tokens'] + 100_000,
                                  '--accumulate', accumulation, '--microbatch', microbatch, '--logit-chunk', logit_chunk, '--resume', out / 'latest.pt'],
                        selected, minutes=2)
                ledger['resumeVerified'] = True
            ledger['checkpoint'] = json.loads((out / 'metrics.json').read_text())
            ledger['selectedTrainingRanks'] = selected
    finally:
        ledger['sessionSecondsFromScriptStart'] = time.monotonic() - start
        ledger['allocatedGpuHoursFromScriptStart'] = ledger['sessionSecondsFromScriptStart'] * allocated / 3600
        (work / 'gpu-ledger.json').write_text(json.dumps(ledger, indent=2, sort_keys=True) + '\n')
        print('GPU LEDGER', json.dumps(ledger, sort_keys=True), flush=True)
elif stage == 'export':
    # Export and qualify on CPU. A failing export makes the notebook fail.
    run([sys.executable, '-m', 'pip', 'install', '-q', 'onnx==1.20.1', 'onnxruntime==1.24.2', 'onnx-ir==1.1.0'])
    run(command('export', '--out', work / 'export', '--data', locate(data_dir),
                '--checkpoint', locate(checkpoint_dir) / checkpoint_file, '--precision', precision,
                '--max-bytes', max_bytes, '--split', export_split))
else:
    raise ValueError(f"Unsupported notebook stage {stage}")
'''


def bundle(out, slug, stage, inputs, **variables):
    if not REPO.fullmatch(slug) or any(not REPO.fullmatch(item) for item in inputs):
        raise ValueError('Invalid Kaggle notebook identifier')
    out.mkdir(parents=True, exist_ok=False)
    binary = io.BytesIO()
    with zipfile.ZipFile(binary, 'w', zipfile.ZIP_DEFLATED) as archive:
        for file in SOURCES:
            archive.write(ROOT / file, file)
    startup = f"""import base64, io, pathlib, sys, time, zipfile
start = time.monotonic()
root = pathlib.Path('/tmp/lemma-typeahead-source')
with zipfile.ZipFile(io.BytesIO(base64.b64decode({base64.b64encode(binary.getvalue()).decode()!r}))) as archive:
    archive.extractall(root)
sys.path.insert(0, str(root / 'expanded'))
"""
    settings = '\n'.join(f'{key} = {value!r}' for key, value in
                         dict(stage=stage, archive_sha256=hashlib.sha256(binary.getvalue()).hexdigest(),
                              **variables).items())
    (out / 'run.py').write_text(startup + settings + '\n' + STAGE)
    metadata = {'id': slug, 'title': slug.split('/')[1], 'code_file': 'run.py', 'language': 'python',
                'kernel_type': 'script', 'is_private': True, 'enable_internet': stage != 'gpu',
                'enable_gpu': stage == 'gpu', 'dataset_sources': [], 'competition_sources': [],
                'kernel_sources': inputs}
    if stage == 'gpu':
        metadata['machine_shape'] = 'NvidiaTeslaT4'
    (out / 'kernel-metadata.json').write_text(json.dumps(metadata, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--slug', required=True)
    parser.add_argument('--stage', choices=('provenance', 'group-audit', 'cpu', 'tokenizer', 'prepare', 'prepared-audit', 'gpu', 'export', 'ngram'), required=True)
    parser.add_argument('--input', action='append', default=[])
    parser.add_argument('--ngram-task', choices=('prose', 'latex', 'both'), default='both')
    parser.add_argument('--ngram-orders', nargs='+', type=int, choices=(3, 4, 5), default=[3, 4, 5])
    parser.add_argument('--pruning-methods', nargs='+', choices=('count', 'entropy'), default=['count', 'entropy'])
    parser.add_argument('--subjects', nargs='*', default=['topology', 'linear-algebra'])
    parser.add_argument('--pilot-source', action='store_true')
    parser.add_argument('--source-counts', nargs=3, type=int, default=[2, 1, 2])
    parser.add_argument('--target-words', type=int, default=100_000_000)
    parser.add_argument('--target-subwords', type=int, choices=(500_000_000, 1_000_000_000))
    parser.add_argument('--corpus-only', action='store_true')
    parser.add_argument('--audit-pool', choices=('controls', 'all'), default='all')
    parser.add_argument('--prepare-pool', choices=('development', 'large'), default='development')
    parser.add_argument('--minimum-subwords', type=int, default=500_000_000)
    parser.add_argument('--reference-words', type=int, default=0)
    parser.add_argument('--data-dir', default='prepared')
    parser.add_argument('--corpus-dir')
    parser.add_argument('--latex-train-tokens', type=int, default=50_000_000)
    parser.add_argument('--checkpoint-dir', default='training')
    parser.add_argument('--checkpoint-file', default='best.pt')
    parser.add_argument('--precision', choices=('int8', 'int8-weight-only', 'int4', 'int4-int8-head'), default='int8')
    parser.add_argument('--export-split', choices=('validation', 'calibration', 'test'), default='test')
    parser.add_argument('--max-bytes', type=int, default=40 * 1024 * 1024)
    parser.add_argument('--candidate', choices=('primary', 'larger', 'reference', 'capacity-reference'), default='primary')
    parser.add_argument('--mode', choices=('pilot', 'train', 'throughput'), default='pilot')
    parser.add_argument('--assigned-gpus', type=int, choices=(1, 2), default=2)
    parser.add_argument('--train-ranks', type=int, choices=(1, 2), default=1)
    parser.add_argument('--allocated-hours', type=float, default=1)
    parser.add_argument('--spent-primary-hours', type=float, default=0)
    parser.add_argument('--spent-larger-hours', type=float, default=0)
    parser.add_argument('--training-minutes', type=float, default=15)
    parser.add_argument('--sequence-length', type=int, default=512)
    parser.add_argument('--stop-tokens', type=int, default=5_000_000)
    parser.add_argument('--microbatch', type=int, default=4)
    parser.add_argument('--logit-chunk', type=int, default=1024)
    parser.add_argument('--probe-batches', type=int, nargs='+', choices=(4, 8, 16, 32), default=[4, 8, 16, 32])
    parser.add_argument('--probe-logit-chunks', type=int, nargs='+', choices=(1024, 4096), default=[1024])
    parser.add_argument('--accumulation', type=int, default=8)
    parser.add_argument('--require-audit', action='store_true')
    parser.add_argument('--resume-dir')
    parser.add_argument('--initialize-dir')
    parser.add_argument('--adapt', action='store_true')
    parser.add_argument('--schedule-tokens', type=int, default=1_000_000_000)
    parser.add_argument('--learning-rate', type=float, default=.0004)
    parser.add_argument('--commit', required=True)
    args = parser.parse_args()
    values = vars(args).copy()
    if not re.fullmatch(r'(?:best|latest|tokens-[0-9]+)\.pt', args.checkpoint_file):
        parser.error('Choose best.pt, latest.pt or a saved exposure checkpoint')
    if args.resume_dir and args.initialize_dir:
        parser.error('Resume and initialize are mutually exclusive')
    if args.mode == 'pilot' and args.adapt:
        parser.error('Role adaptation is a separate training stage')
    if args.stage == 'gpu':
        budget = 1 if args.mode == 'pilot' else .5 if args.mode == 'throughput' else 14 if args.candidate == 'larger' else 10
        spent = args.spent_larger_hours if args.candidate == 'larger' else args.spent_primary_hours
        if (not 0 < args.allocated_hours <= budget or args.train_ranks > args.assigned_gpus or
                min(args.spent_primary_hours, args.spent_larger_hours) < 0 or
                spent + args.allocated_hours > (14 if args.candidate == 'larger' else 10) or
                args.spent_primary_hours + args.spent_larger_hours + args.allocated_hours > 24):
            parser.error('GPU allocation exceeds the stage limit')
        if args.mode == 'pilot' and args.candidate != 'primary':
            parser.error('The pilot qualifies the primary architecture')
    for key in ('out', 'slug', 'stage', 'input'):
        del values[key]
    bundle(args.out, args.slug, args.stage, args.input, **values)


if __name__ == '__main__':
    main()
