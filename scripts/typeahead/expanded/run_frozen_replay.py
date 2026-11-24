#!/usr/bin/env python3
"""Run a serial frozen Tutor replay from an immutable Git snapshot.

Input JSON keys: commit, calibration, validation, test, assets. Schedule
values point to frozen directories. Assets maps runtime set names to the
packaged directories (ngram-v2, latex-v2, subject-*, neural-v2, neural-large-v2).
For the final comparison, optional mixture and neuralCalibration values name
reviewed fitted JSON files. Use --phase capture first, then --phase final.
Use --phase final-kn for the interim two-arm comparison when no graph qualifies.
"""

import argparse
import hashlib
import itertools
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request


ARMS = ('corrected-v1', 'expanded-kn', 'neural', 'tutor', 'personal')
CONTROL_SPECS = {
    'main-100m': ('prepared', 'primary', 'tokens-100000000.pt'),
    'main-500m': ('prepared', 'primary', 'tokens-500000000.pt'),
    'main-best': ('prepared', 'primary', 'best.pt'),
    'dev-100m': ('prepared-dev', 'primary', 'tokens-100000000.pt'),
    'current-100m': ('prepared-reference', 'primary', 'tokens-100000000.pt'),
    'capacity-100m': ('prepared', 'capacity-reference', 'tokens-100000000.pt'),
    'tutor-best': ('prepared', 'primary', 'best.pt'),
}
QUESTION_AID_V1 = {
    'topology': ('compact', 'open', 'closed', 'cover', 'continuous', 'neighborhood', 'closure'),
    'linear-algebra': ('vector', 'matrix', 'basis', 'linear', 'span', 'dimension', 'eigenvalues'),
    'analysis': ('function', 'continuous', 'sequence', 'limit', 'converges', 'bounded', 'integral'),
    'algebra': ('group', 'ring', 'field', 'subgroup', 'homomorphism', 'ideal'),
    'logic': ('implies', 'equivalent', 'formula', 'predicate', 'proposition'),
    'other': ('definition', 'function', 'condition', 'proof', 'theorem', 'property', 'result', 'set'),
}
SHA = re.compile(r'[0-9a-f]{64}\Z')
FLAGS = dict(VITE_ALLOW_FLAG_OVERRIDES='1', VITE_FLAGS='-v6Shell,-v7Shell',
             # Match the fixture's storage key without pointing at a live account.
             VITE_SUPABASE_URL='https://yemqnhnztlbyxmjxidis.supabase.invalid',
             VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_replay_fixture')


def json_file(path):
    return json.loads(path.read_text())


def rows(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line]


def hash_file(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def hash_text(text):
    return hashlib.sha256(text.encode()).hexdigest()


def checked_schedule(path, phase):
    manifest = json_file(path / 'manifest.json')
    answer_path, event_path, gold_path = (path / (name + '.jsonl') for name in ('answers', 'events', 'gold'))
    if (manifest['split'] != phase or manifest['pilot'] or manifest.get('replaySubjectMethod') != 'question-only' or
            set(manifest['sha256']) != {'answers', 'events', 'gold'}) or any(
            hash_file(path / (name + '.jsonl')) != digest for name, digest in manifest['sha256'].items()):
        raise ValueError(f'Invalid audited {phase} schedule or file checksum')
    answers, events, gold = (rows(file) for file in (answer_path, event_path, gold_path))
    scopes = {answer['answerId']: answer for answer in answers}
    groups = {answer['documentGroup'] for answer in answers}
    index = {event['eventId']: event for event in events}
    if (len(answers) != manifest['answers'] or len(answers) != len(scopes) or len(answers) != len(groups) or
            len(events) != manifest['events'] or len(events) != len(index) or len(gold) != len(index) or
            {item['eventId'] for item in gold} != set(index) or
            hash_text('\n'.join(sorted(groups))) != manifest['documentGroupsSha256'] or
            {event['answerId'] for event in events} != set(scopes) or any(
                row['answerId'] != index[row['eventId']]['answerId'] or
                row['prefixSha256'] != hash_text(index[row['eventId']]['prefix']) for row in gold)):
        raise ValueError(f'Inconsistent {phase} schedule, source groups, or gold join')
    return dict(path=path, groups=groups, subjects={answer['subject'] for answer in answers}, data_sha=manifest['dataSha256'],
                manifest_sha=hash_file(path / 'manifest.json'))


def checked_shared_audit(config, schedule_sha, general_sha, require_full=False):
    if not config.get('groupAudit') and schedule_sha == general_sha:
        if require_full:
            raise ValueError('Final release comparison needs the verified full-corpus group audit')
        return None
    path = Path(config['groupAudit'])
    audit = json_file(path)
    bound = set(audit[key] for key in ('corpusSha256', 'developmentSha256'))
    if (hash_file(path) != config['groupAuditSha256'] or not audit['passed'] or
            schedule_sha not in bound or general_sha not in bound):
        raise ValueError('Selected model and schedules do not match the verified group audit')
    full_path, dev_path = (Path(config[key]) for key in ('fullCorpusManifest', 'developmentCorpusManifest'))
    if (hash_file(full_path) != audit['corpusSha256'] or hash_file(dev_path) != audit['developmentSha256']):
        raise ValueError('The full and development manifests differ from the group audit')
    full, dev = json_file(full_path), json_file(dev_path)
    if require_full and (general_sha != audit['corpusSha256'] or full['counts']['train']['words'] < 500_000_000):
        raise ValueError('Final general model must match the audited 500M-word training pool')
    heldout = {}
    for split in ('calibration', 'validation', 'test'):
        def shards(manifest):
            return [shard['sha256'] for shard in manifest['shards'] if shard['split'] == split]
        heldout[split] = shards(full)
        if not heldout[split] or heldout[split] != shards(dev):
            raise ValueError(f'Audited full and development {split} shard identities differ')
    return {'groupAuditSha256': config['groupAuditSha256'], 'fullCorpusSha256': audit['corpusSha256'],
            'developmentCorpusSha256': audit['developmentSha256'], 'sharedHeldoutShards': heldout}


def question_aid_overlay(dataset, filename):
    answer_rows = rows(dataset['path'] / 'answers.jsonl')
    aided = 0
    for answer in answer_rows:
        if answer.get('aid'):
            raise ValueError('Use a separate run for already-authored structured aides')
        question_words = set(re.findall(r'[a-z]+', answer.get('question', '').casefold()))
        frozen_order = dict.fromkeys(word for terms in QUESTION_AID_V1.values() for word in terms)
        entries = [word for word in frozen_order if word in question_words][:8]
        if not entries:
            continue
        answer['aid'] = {'level': 'light', 'ranking': {'version': 1, 'hints': [
            {'id': 'question-' + word, 'entry': word, 'kind': 'word', 'priority': 'prefer', 'role': 'neutral',
             'scope': {'mode': 'prose'}} for word in entries
        ]}}
        aided += 1
    filename.write_text(''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in answer_rows))
    return {'version': 'question-aid-v1', 'answersWithAids': aided, 'answersSha256': hash_file(filename)}


def checked_file(directory, name, size, sha):
    if not isinstance(name, str) or Path(name).name != name or not isinstance(size, int) or size <= 0 or not SHA.fullmatch(sha):
        raise ValueError('Invalid model asset record')
    file = directory / name
    if file.stat().st_size != size or hash_file(file) != sha:
        raise ValueError(f'Asset checksum mismatch for {directory.name}/{name}')
    return file


def install_assets(model_root, sets):
    installed = {}
    general = json_file(Path(sets['ngram-v2']) / 'manifest.json')
    for name, directory in sorted(sets.items()):
        path = Path(directory).resolve()
        manifest = json_file(path / 'manifest.json')
        if name.startswith('neural-'):
            if name not in ('neural-v2', 'neural-large-v2') or manifest['kind'] != 'neural':
                raise ValueError(f'Unexpected neural set {name}')
            files = [checked_file(path, f['path'], f['bytes'], f['sha256']) for f in manifest['files'].values()]
        else:
            match = re.fullmatch(r'subject-([a-z0-9][a-z0-9_-]{0,79})', name)
            if name not in ('ngram-v2', 'latex-v2') and match is None:
                raise ValueError(f'Unexpected model set {name}')
            budget = 4 if match else 2 if name == 'latex-v2' else 20
            if (manifest['version'] != 2 or manifest['order'] not in (4, 5) or manifest['bytes'] > budget * 2**20 or
                    manifest['kind'] != ('latex' if name == 'latex-v2' else 'ngram') or
                    manifest['subject'] != (match[1] if match else None) or
                    match and manifest['vocabSha256'] != general['vocabSha256']):
                raise ValueError(f'Asset format, scope or budget mismatch for {name}')
            files = [checked_file(path, manifest['file'], manifest['bytes'], manifest['sha256'])]
        target = model_root / name
        target.mkdir()
        for file in files:
            shutil.copyfile(file, target / file.name)
        shutil.copyfile(path / 'manifest.json', target / 'manifest.json')
        installed[name] = manifest
    return installed


def checked_capture_lineage(lineage, fitted, datasets, capture_kind):
    inventory_path = Path(lineage['inventory'])
    inventory = json_file(inventory_path)
    if hash_file(inventory_path) != lineage['inventorySha256'] or inventory['phase'] != 'capture':
        raise ValueError('Fitting capture inventory is missing or altered')
    for phase in ('calibration', 'validation'):
        captured = inventory.get('captureFiles', {}).get(capture_kind, {}).get(phase)
        if (inventory['schedules'][phase] != datasets[phase]['manifest_sha'] or
                fitted[phase + 'Sha256'] != captured or captured != hash_file(Path(lineage[phase]))):
            raise ValueError(f'Fitting {phase} evidence does not belong to the frozen schedule')
    return inventory


def neural_fingerprint(manifest):
    files = manifest['files']
    return ':'.join(files[k]['sha256'] if k in files else '-' for k in ('prefill', 'incremental', 'tokenizer', 'weights'))


def run(command, cwd, env, log):
    with log.open('wb') as output:
        subprocess.run(command, cwd=cwd, env=env, stdout=output, stderr=subprocess.STDOUT, check=True)


def archive_source(repo, revision, target):
    pinned = subprocess.check_output(['git', 'rev-parse', revision + '^{commit}'], cwd=repo, text=True).strip()
    if pinned != revision:
        raise ValueError('Use the exact immutable commit SHA for the replay')
    target.mkdir()
    with subprocess.Popen(['git', 'archive', revision], cwd=repo, stdout=subprocess.PIPE) as archive:
        subprocess.run(['tar', '-x', '-C', target], stdin=archive.stdout, check=True)
        if archive.wait():
            raise RuntimeError('Could not archive the pinned source')
    (target / 'node_modules').symlink_to((repo / 'node_modules').resolve(), target_is_directory=True)


def run_replay(source, output, env, arm, dataset, assets, phase, ghost=False, locked_trial=False):
    path = dataset['path']
    model_root = source / 'public/models/typeahead'
    general = json_file(model_root / 'ngram-v1/manifest.json')['file']['sha256'] if arm == 'corrected-v1' else assets['ngram-v2']['sha256']
    latex = json_file(model_root / 'latex-v1/manifest.json')['file']['sha256'] if arm == 'corrected-v1' else assets['latex-v2']['sha256']
    subjects = {} if arm == 'corrected-v1' else {
        manifest['subject']: manifest['sha256'] for name, manifest in assets.items()
        if name.startswith('subject-') and manifest['subject'] in dataset['subjects']
    }
    options = {'ARM': arm, 'EXPECTED_NGRAM_SHA': general, 'EXPECTED_SUBJECT_SHA_JSON': json.dumps(subjects),
               'INPUT': str(path / 'events.jsonl'), 'ANSWERS': str(dataset.get('answer_overlay', path / 'answers.jsonl')),
               'GOLD': str(path / 'gold.jsonl'),
               'OUTPUT': str(output), 'CAPTURE_ONLY': str(int(phase == 'capture'))}
    if any(item.get('mathOpportunity') == 'equation-command' for item in rows(path / 'gold.jsonl')):
        options['EXPECTED_LATEX_SHA'] = latex
    if ghost:
        candidates = [manifest for name, manifest in assets.items() if name.startswith('neural-') and
                      manifest.get('qualification', {}).get('parity')]
        if len(candidates) != 1:
            raise ValueError('Build a separate ghost probe for each exact parity-checked neural bundle')
        options.update(GRAPH_TRIAL='1', STRICT_GRAPH_TRIAL='1', GHOST_CALIBRATION='1',
                       EXPECTED_NEURAL_FINGERPRINT=neural_fingerprint(candidates[0]))
    if locked_trial and arm in ('neural', 'tutor', 'personal'):
        candidates = [manifest for name, manifest in assets.items() if name.startswith('neural-')]
        if len(candidates) != 1:
            raise ValueError('Build each locked replay with one verified candidate bundle')
        options.update(GRAPH_TRIAL='1', STRICT_GRAPH_TRIAL='1',
                       EXPECTED_NEURAL_FINGERPRINT=neural_fingerprint(candidates[0]))
    elif phase == 'final' and arm in ('neural', 'tutor', 'personal'):
        [candidate] = [manifest for name, manifest in assets.items() if name.startswith('neural-')]
        options['EXPECTED_NEURAL_FINGERPRINT'] = neural_fingerprint(candidate)
    print(f'Starting {output.name} with general {general[:12]} and {len(subjects)} expected subject packs', flush=True)
    run(['node_modules/.bin/playwright', 'test', '--config=replay.config.mts', 'tests/e2e/n238-typeahead-replay.spec.ts',
         '-g', 'replays visible', '--workers=1', '--retries=0'], source,
        {**env, **{'LEMMA_TYPEAHEAD_REPLAY_' + k: v for k, v in options.items()}}, output.with_suffix('.log'))


def verify_control(label, control, prepared, shared_heldout_sha, bundle, parent_sha):
    pool, architecture, checkpoint_file = CONTROL_SPECS[label]
    metrics_path, ledger_path = (Path(control[key]) for key in ('validationMetrics', 'trainingLedger'))
    metrics, ledger = json_file(metrics_path), json_file(ledger_path)
    if hash_file(metrics_path) != control['validationMetricsSha256'] or hash_file(ledger_path) != control['trainingLedgerSha256']:
        raise ValueError(f'{label} metrics or training ledger fail their expected hash')
    checkpoint = ledger['checkpointFiles'][checkpoint_file]['sha256']
    actual_targets, requested_targets = ledger['checkpoint']['tokens'], ledger['requestedTargets']
    expected_targets = 20_000_000 if label == 'tutor-best' else 500_000_000 if label.startswith('main-') else 100_000_000
    exposure_complete = ledger['stopReason'] == 'target-exposure' and actual_targets == expected_targets
    if label == 'tutor-best':
        exposure_complete = (
            (exposure_complete or ledger['stopReason'] == 'time-cap' and actual_targets < requested_targets)
            and ledger['assignedGpus'] == 2 and ledger['leasedHours'] == .5
            and 0 < ledger['allocatedGpuHoursFromScriptStart'] <= .5
            and 0 < control['providerAllocatedGpuHours'] <= .5
        )
    if (metrics['checkpointSha256'] != checkpoint or metrics['trainingDataSha256'] != metrics['dataSha256'] or
            metrics['dataSha256'] != prepared['preparedManifestSha256'][pool] or metrics['caseDataSha256'] != shared_heldout_sha or
            metrics['layouts']['prose']['contexts'] != 150 or metrics['layouts']['roles']['contexts'] != 150 or
            metrics['contextSplit'] != 'validation' or ledger['candidate'] != architecture or
            not exposure_complete or requested_targets != expected_targets or
            type(actual_targets) is not int or actual_targets <= 0 or control['providerStatus'] != 'COMPLETE' or
            label == 'tutor-best' and ledger.get('initialCheckpointSha256') != parent_sha or
            label != 'tutor-best' and ledger.get('initialCheckpointSha256')):
        raise ValueError(f'{label} checkpoint, training pool, architecture or adaptation lineage mismatch')
    checkpoint_targets = None
    if checkpoint_file.startswith('tokens-'):
        checkpoint_targets = ledger['milestoneValidation'][Path(checkpoint_file).stem]['tokens']
        if checkpoint_targets != int(Path(checkpoint_file).stem.removeprefix('tokens-')):
            raise ValueError(f'{label} missed its exact exposure milestone')
    evidence = {'checkpointSha256': checkpoint, 'preparedSha256': metrics['dataSha256'],
                'completedRunTargets': actual_targets, 'requestedRunTargets': requested_targets, 'trainingStopReason': ledger['stopReason'],
                'checkpointTargets': checkpoint_targets,
                'sharedHoldoutManifestSha256': shared_heldout_sha,
                'validationCasesSha256': metrics['casesSha256'], 'validationMetricsSha256': control['validationMetricsSha256'],
                'validationPerplexity': metrics.get('nativePerplexity'), 'quantPerplexity': metrics.get('quantPerplexity'),
                'nativeParityPassed': metrics['exportParityPassed'], 'selectedPrecision': metrics['precision']}
    if not metrics['exportParityPassed']:
        return {**evidence, 'status': 'unavailable-native-parity'}, None
    files = {}
    for name, filename in (('tokenizer', 'tokenizer.json'), ('prefill', 'prefill.onnx'),
                           ('incremental', 'incremental.onnx'), ('weights', 'weights.bin')):
        source = Path(control['directory']) / filename
        sha, size = hash_file(source), source.stat().st_size
        if (sha != control['candidateFilesSha256'][filename] or
                name == 'tokenizer' and sha != prepared['tokenizerSha256']):
            raise ValueError(f'{label} {filename} identity differs from the exported candidate')
        files[name] = {'path': filename, 'bytes': size, 'sha256': sha}
    if sum(file['bytes'] for file in files.values()) != metrics['graphBytes']:
        raise ValueError(f'{label} model bytes differ from the native parity report')
    candidate = dict(version=2, kind='neural', precision='mixed' if metrics['precision'] == 'int4-int8-head' else metrics['precision'].split('-')[0],
                     quantization=metrics['precision'], context=512, vocabSize=16384, layers=4 if architecture == 'capacity-reference' else 8,
                     heads=3 if architecture == 'capacity-reference' else 8, headDim=64, files=files,
                     qualification=dict(parity=True, replay=False, wasm=False, webgpu=False, webgpuJspi=False))
    bundle.mkdir()
    for file in files.values():
        shutil.copyfile(Path(control['directory']) / file['path'], bundle / file['path'])
    (bundle / 'manifest.json').write_text(json.dumps(candidate, indent=2) + '\n')
    return {**evidence, 'status': 'trial-available', 'modelFingerprint': neural_fingerprint(candidate)}, checkpoint


def run_controls(options, config, output):
    prepared_path = Path(config['preparedAudit'])
    prepared = json_file(prepared_path)
    if hash_file(prepared_path) != config['preparedAuditSha256'] or not prepared['passed'] or prepared['scope'] != 'all':
        raise ValueError('Neural controls require the full verified prepared-data audit')
    holdout_path = Path(config['sharedHeldoutManifest'])
    heldout = json_file(holdout_path)
    heldout_sha = hash_file(holdout_path)
    if (heldout_sha != config['sharedHeldoutManifestSha256'] or 'train' in heldout['counts'] or
            heldout['files']['tokenizer.json']['sha256'] != prepared['tokenizerSha256']):
        raise ValueError('Neural controls require the pinned train-free shared holdout and its audited tokenizer')
    for pool in {item[0] for item in CONTROL_SPECS.values()}:
        manifest_path = Path(config['preparedManifests'][pool])
        manifest = json_file(manifest_path)
        if (hash_file(manifest_path) != prepared['preparedManifestSha256'][pool] or
                manifest['sharedHeldoutSha256'] != heldout_sha):
            raise ValueError(f'Prepared pool {pool} differs from the audit or uses a different holdout')
    controls = config['neuralControls']
    if set(controls) != set(CONTROL_SPECS):
        raise ValueError('Declare the exact seven controlled checkpoint names')
    main_ledgers = {control['trainingLedgerSha256'] for name, control in controls.items() if name.startswith('main-') and control}
    if len(main_ledgers) > 1:
        raise ValueError('Main 100M, 500M, and best checkpoints must come from one immutable training run')
    output.mkdir(parents=True)
    paths, report = {}, {}
    parent = None
    for label in CONTROL_SPECS:
        control = controls[label]
        if not control:
            report[label] = {'status': 'unavailable-checkpoint-or-export'}
            continue
        if label == 'tutor-best' and not parent:
            report[label] = {'status': 'unavailable-parent-checkpoint'}
            continue
        target = output / (label + '-bundle')
        report[label], checkpoint = verify_control(label, control, prepared, heldout_sha, target, parent)
        if label == 'main-best':
            parent = report[label]['checkpointSha256']
        if checkpoint is not None:
            paths[label] = target
    if len({record['validationCasesSha256'] for record in report.values() if record.get('validationCasesSha256')}) > 1:
        raise ValueError('All seven controls must use the same mixed validation context schedule')
    summary = output / 'controls.json'
    summary.write_text(json.dumps(report, indent=2) + '\n')
    for label, path in paths.items():
        base_assets = {name: asset for name, asset in config['assets'].items() if not name.startswith('neural-')}
        archived = {**config, 'assets': {**base_assets, 'neural-v2': str(path)}, 'control': label}
        archived.pop('neuralCalibration', None)
        control_config = output / (label + '.config.json')
        control_config.write_text(json.dumps(archived, indent=2) + '\n')
        command = [sys.executable, str(Path(__file__).resolve()), str(control_config), str(output / label), '--repo', str(options.repo),
                   '--phase', 'neural-control']
        if options.question_aids:
            command.append('--question-aids')
        try:
            run(command, options.repo, os.environ, output / (label + '.log'))
            result = json_file(output / label / 'neural.assets.json')
            report[label]['browser'] = result['neuralResults']
            report[label]['status'] = ('unqualified-on-time-observations' if result['neuralResults']['deliveredOnTimeScoredReplies']
                                       and result['assetCounts']['neural']
                                       else 'fallback-no-on-time-neural-scores')
            role_path = output / label / 'tutor.assets.json'
            if role_path.exists():
                role_result = json_file(role_path)
                report[label]['tutorLane'] = role_result['neuralResults']
                report[label]['tutorModelBackedEdits'] = role_result['assetCounts']['neural']
        except subprocess.CalledProcessError:
            report[label]['status'] = 'incomplete-browser-run'
        summary.write_text(json.dumps(report, indent=2) + '\n')
    contrasts = {'exposure': ('main-100m', 'main-500m'), 'full-vs-dev': ('dev-100m', 'main-100m'),
                 'current-vs-dev': ('current-100m', 'dev-100m'), 'capacity': ('capacity-100m', 'main-100m')}
    comparisons = {}
    for compare, pair in {**contrasts, 'role-adaptation': ('main-best', 'tutor-best')}.items():
        lane = 'tutor' if compare == 'role-adaptation' else 'neural'
        if lane == 'tutor':
            delivered = all(report[label].get('tutorModelBackedEdits') and
                            report[label]['tutorLane']['deliveredOnTimeScoredReplies'] for label in pair)
        else:
            delivered = all(report[label]['status'] == 'unqualified-on-time-observations' for label in pair)
        comparisons[compare] = {'lane': lane, 'arms': list(pair), 'status': 'unavailable-no-matched-on-time-graph'}
        if not delivered:
            continue
        inputs = []
        for label in pair:
            directory = output / label
            inputs.extend(('--run', label, str(directory / (lane + '.impressions.jsonl')), str(directory / (lane + '.keys.jsonl'))))
        destination = output / (compare + '.metrics.json')
        run([sys.executable, 'scripts/typeahead/expanded/replay_metrics.py', '--gold', str(Path(config['test']).resolve() / 'gold.jsonl'),
             '--baseline', pair[0], *inputs, '--out', str(destination)], output / pair[0] / 'source', os.environ, output / (compare + '.log'))
        comparisons[compare].update(status='unqualified-controlled-comparison', metricsSha256=hash_file(destination))
    (output / 'control-comparisons.json').write_text(json.dumps(comparisons, indent=2) + '\n')


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('config', type=Path)
    args.add_argument('out', type=Path)
    args.add_argument('--repo', type=Path, default=Path.cwd())
    args.add_argument('--phase', choices=('capture', 'final-kn', 'final', 'neural-controls', 'neural-control'), required=True)
    args.add_argument('--ghost-probe', action='store_true')
    args.add_argument('--locked-neural-trial', action='store_true',
                      help='Evaluate a frozen parity-checked candidate in the full matrix before release qualification')
    args.add_argument('--question-aids', action='store_true', help='Freeze the prespecified question-only scoped ranking fixture')
    options = args.parse_args()
    config, output = json_file(options.config), options.out.resolve()
    if options.phase == 'neural-controls':
        return run_controls(options, config, output)
    splits = ('calibration', 'validation') if options.phase == 'capture' else ('calibration', 'validation', 'test')
    datasets = {phase: checked_schedule(Path(config[phase]).resolve(), phase) for phase in splits}
    expected_schedules = config.get('scheduleManifestSha256')
    if options.phase != 'capture' and not expected_schedules:
        raise ValueError('Pin the schedule manifest hashes before running final comparisons')
    if expected_schedules and any(expected_schedules.get(phase) != dataset['manifest_sha'] for phase, dataset in datasets.items()):
        raise ValueError('A frozen schedule changed after being pinned')
    if any(a['groups'] & b['groups'] for a, b in itertools.combinations(datasets.values(), 2)):
        raise ValueError('Calibration, validation and test contain overlapping source groups')
    if len({data['data_sha'] for data in datasets.values()}) != 1:
        raise ValueError('All compared schedules must use one frozen corpus identity')
    if options.ghost_probe and options.phase != 'capture':
        raise ValueError('The unqualified ghost probe is only for calibration and validation capture')
    if options.locked_neural_trial and options.phase != 'final':
        raise ValueError('A locked neural trial is only for the final five-arm comparison')
    output.mkdir(parents=True)
    source = output / 'source'
    archive_source(options.repo, config['commit'], source)
    if (options.locked_neural_trial or options.ghost_probe or options.phase == 'neural-control') and (
            'STRICT_GRAPH_TRIAL' not in (source/'tests/e2e/n238-typeahead-replay.spec.ts').read_text()):
        raise ValueError('Pinned source does not support cold-budget-enforced graph trials')
    model_root = source / 'public/models/typeahead'
    assets = install_assets(model_root, config['assets'])
    require_full = options.phase != 'capture'
    audit_link = checked_shared_audit(config, datasets[splits[0]]['data_sha'], assets['ngram-v2']['corpusSha256'], require_full)
    if require_full:
        expected = config['auditedAssetManifestSha256']
        for name in assets:
            if not name.startswith('neural-') and hash_file(model_root/name/'manifest.json') != expected[name]:
                raise ValueError(f'Pack {name} differs from its selected audit record')
    aid_link = {}
    if options.question_aids:
        for phase, dataset in datasets.items():
            filename = output / (phase + '.question-aids.answers.jsonl')
            aid_link[phase] = question_aid_overlay(dataset, filename)
            dataset['answer_overlay'] = filename
        if options.phase != 'capture' and not aid_link['test']['answersWithAids']:
            aid_link['test']['effect'] = 'no-aided-answers'
    if 'latex-v2' not in assets:
        raise ValueError('Replay requires the selected LaTeX asset')
    if options.phase != 'capture' and config.get('mixture'):
        fit_path = Path(config['mixture'])
        fit = json_file(fit_path)
        if fit['status'] != 'validated' or fit['assetSha256'] != assets['ngram-v2']['sha256']:
            raise ValueError('Fitted mixture is not validated for this exact general asset')
        fit_inventory = checked_capture_lineage(config['mixtureCapture'], fit, datasets, 'components')
        if any(fit_inventory['questionAids'].get(phase) != aid_link.get(phase) for phase in ('calibration', 'validation')):
            raise ValueError('Mixture capture and replay use different frozen question-aid inputs')
        for subject, sha in fit['subjectAssetSha256'].items():
            if assets.get('subject-' + subject, {}).get('sha256') != sha:
                raise ValueError('Fitted mixture subject pack differs from the built pack')
        shutil.copyfile(fit_path, model_root / 'ngram-v2/mixture.json')
    if config.get('neuralCalibration'):
        path = Path(config['neuralCalibration'])
        calibration = json_file(path)
        available = [name for name, manifest in assets.items() if name.startswith('neural-') and
                     neural_fingerprint(manifest) == calibration['modelFingerprint']]
        if len(available) != 1:
            raise ValueError('Neural calibration is not bound to one exact installed bundle')
        checked_capture_lineage(config['neuralCalibrationCapture'], calibration, datasets, 'ghostExact')
        name = available[0]
        manifest = {**assets[name], 'calibration': calibration}
        (model_root / name / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    if options.phase == 'final':
        gate = 'parity' if options.locked_neural_trial else 'replay'
        candidates = [manifest for name, manifest in assets.items() if name.startswith('neural-')]
        if len(candidates) != 1 or not candidates[0].get('qualification', {}).get(gate):
            raise ValueError('Build the matrix with one exact neural bundle and its applicable qualification')
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    url = f'http://127.0.0.1:{port}/lemma/'
    chromium = config.get('chromiumExecutable')
    launch_options = {'executablePath': str(Path(chromium).resolve())} if chromium else {}
    (source / 'replay.config.mts').write_text(f"""
import config from './playwright.config.ts';
export default {{...config, testDir:'./tests/e2e', outputDir:'./replay-output', reporter:[['list']],
  use:{{...config.use, baseURL:{json.dumps(url)}}}, webServer:undefined,
  projects:config.projects?.map(project=>({{...project,use:{{...project.use,launchOptions:{json.dumps(launch_options)}}}}}))}};
""")
    env = {k: v for k, v in os.environ.items() if not k.startswith(('LEMMA_TYPEAHEAD_REPLAY_', 'VITE_'))}
    env.update(FLAGS)
    run(['node_modules/.bin/vite', 'build', '--outDir', 'dist'], source, env, output / 'build.log')
    inventory = {'sourceCommit': config['commit'], 'phase': options.phase, 'lockedNeuralTrial': options.locked_neural_trial,
                 'launcherSha256': hash_file(Path(__file__).resolve()),
                 'schedules': {name: data['manifest_sha'] for name, data in datasets.items()},
                 'corpusAudit': audit_link, 'questionAids': aid_link,
                 'modelManifests': {name: hash_file(model_root / name / 'manifest.json') for name in assets},
                 'buildIndexSha256': hash_file(source / 'dist/index.html')}
    (output / 'inventory.json').write_text(json.dumps(inventory, indent=2) + '\n')
    with (output / 'preview.log').open('wb') as server_log:
        server = subprocess.Popen(['node_modules/.bin/vite', 'preview', '--host', '127.0.0.1', '--port', str(port), '--strictPort'],
                                  cwd=source, env=env, stdout=server_log, stderr=subprocess.STDOUT)
        try:
            for _ in range(50):
                try:
                    with urllib.request.urlopen(url, timeout=1):
                        break
                except urllib.error.URLError:
                    if server.poll() is not None:
                        raise RuntimeError('Replay preview exited')
                    time.sleep(.2)
            else:
                raise RuntimeError('Replay preview did not become reachable')
            if options.phase == 'capture':
                for phase in ('calibration', 'validation'):
                    run_replay(source, output / phase, env, 'expanded-kn', datasets[phase], assets, options.phase)
                    if options.ghost_probe:
                        run_replay(source, output / (phase + '-ghost'), env, 'neural', datasets[phase], assets, options.phase, ghost=True)
                run([sys.executable, 'scripts/typeahead/expanded/fit.py', 'mixture',
                     '--calibration', str(output / 'calibration.components.jsonl'), '--validation', str(output / 'validation.components.jsonl'),
                     '--asset-sha256', assets['ngram-v2']['sha256'], '--out', str(output / 'mixture.json')], source, env, output / 'fit.log')
                inventory['captureFiles'] = {'components': {
                    phase: hash_file(output / (phase + '.components.jsonl')) for phase in splits
                }}
                if options.ghost_probe:
                    inventory['captureFiles']['ghostExact'] = {
                        phase: hash_file(output / (phase + '-ghost.ghost-calibration.jsonl')) for phase in splits
                    }
                (output / 'inventory.json').write_text(json.dumps(inventory, indent=2) + '\n')
            elif options.phase == 'neural-control':
                run_replay(source, output / 'neural', env, 'neural', datasets['test'], assets, options.phase, locked_trial=True)
                if options.question_aids and config['control'] in ('main-best', 'tutor-best'):
                    run_replay(source, output / 'tutor', env, 'tutor', datasets['test'], assets, options.phase, locked_trial=True)
            else:
                arms = ARMS if options.phase == 'final' else ARMS[:2]
                metric_inputs = []
                for arm in arms:
                    run_replay(source, output / arm, env, arm, datasets['test'], assets, options.phase, locked_trial=options.locked_neural_trial)
                    metric_inputs.extend(('--run', arm, str(output / (arm + '.impressions.jsonl')), str(output / (arm + '.keys.jsonl'))))
                run([sys.executable, 'scripts/typeahead/expanded/replay_metrics.py',
                     '--gold', str(datasets['test']['path'] / 'gold.jsonl'), '--baseline', 'corrected-v1',
                     *metric_inputs, '--out', str(output / 'replay-metrics.json')], source, env, output / 'metrics.log')
        finally:
            server.terminate()
            try:
                server.wait(5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()


if __name__ == '__main__':
    main()
