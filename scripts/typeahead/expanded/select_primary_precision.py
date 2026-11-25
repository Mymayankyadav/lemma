#!/usr/bin/env python3
"""Select a primary precision from prespecified validation metrics and exact cold file ledgers.

The JSON config pins the procedure and shared checkpoint, audit and validation identities.
Each variant supplies its immutable metrics and candidate files. Backend ledgers identify
unique download locations and provide each dependency's path, SHA-256 and role.
This tool reads neither replay gold nor validation context texts.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
from urllib.parse import urlsplit


ORDER = ('int8-weight-only', 'int4', 'int4-int8-head')
RUNTIME = {'wasm': 13_479_978, 'webgpu': 24_254_953, 'webgpuJspi': 15_046_878}
RUNTIME_SHA256 = {'wasm': 'd1ab1b94b16a65b29d710d0b587b29e7bed336827577623913479b8afe8113e6',
                  'webgpu': '7e83cd6cee77e478bc96a7e91b198144fb5e4126287daf1f9b54bb195ebcd55a',
                  'webgpuJspi': '7c28cdb40958a998f5aa0981d5cb8e57ac1e7e9b4d2f18a7d74e00dd9629d7a3'}
LIMIT = 68 * 2**20
RESERVE = 29 * 2**20
EXPORT_LIMIT = 40 * 2**20
FILES = {'prefill': 'prefill.onnx', 'incremental': 'incremental.onnx', 'tokenizer': 'tokenizer.json', 'weights': 'weights.bin'}
SUPPORT = {'prose', 'subject', 'latex', 'lexicon', 'worker', 'runtime-wrapper', 'runtime-wasm'}
HASH = re.compile(r'[0-9a-f]{64}\Z')


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def pinned(path, checksum):
    if not HASH.fullmatch(checksum) or digest(path) != checksum:
        raise ValueError(f'Incorrect checksum for {Path(path).name}')
    return json.loads(Path(path).read_text())


def artifact(path, checksum):
    path = Path(path)
    if not HASH.fullmatch(checksum) or digest(path) != checksum:
        raise ValueError(f'Incorrect candidate file hash for {path.name}')
    return {'path': path.name, 'bytes': path.stat().st_size, 'sha256': checksum}


def ratio(track, numer, denom):
    return track.get(denom, 0) > 0 and track.get(numer, 0) >= .95 * track[denom]


def parity(metrics):
    layouts = metrics['layouts']
    if set(layouts) != {'prose', 'roles'} or any(track['contexts'] != 150 for track in layouts.values()):
        raise ValueError('Expected the same 150 prose and 150 role contexts')
    return (
        metrics['exportParityPassed'] is True
        and all(0 <= metrics[name] <= .001 for name in
                ('floatMaxLogitError', 'nativeCachedMaxLogitError', 'floatCachedMaxLogitError', 'floatRetokenizedMaxLogitError'))
        and metrics['quantTopThreeSetAgreement'] >= .95
        and metrics['quantCachedTopThreeSetAgreement'] >= .95
        and all(ratio(track, 'matches', 'contexts') and ratio(track, 'cachedMatches', 'cachedContexts')
                and (not track.get('partialRetokenizationCases') or ratio(track, 'partialMatches', 'partialRetokenizationCases'))
                and (not track.get('wholeWordCases') or ratio(track, 'wholeWordMatches', 'wholeWordCases'))
                for track in layouts.values())
        and ratio(layouts['roles'], 'partialMatches', 'partialRetokenizationCases')
        and ratio(layouts['roles'], 'wholeWordMatches', 'wholeWordCases')
    )


def backend_record(name, reference, config, export_manifest, neural_files, model_bytes):
    ledger_sha = reference['sha256']
    ledger = pinned(reference['path'], ledger_sha)
    build = Path(reference['buildDirectory']).resolve()
    if (ledger['backend'] != name or ledger['buildFingerprint'] != reference['buildFingerprint'] or
            digest(build / 'index.html') != reference['indexSha256']):
        raise ValueError(f'{name} ledger belongs to a different build or backend')
    inventory = pinned(reference['dependencyInventory'], reference['dependencyInventorySha256'])
    if inventory['buildFingerprint'] != reference['buildFingerprint'] or inventory['backend'] != name:
        raise ValueError('Cold dependency inventory is for another build')
    runtime_manifest_path = Path(reference['runtimeLogicalManifest'])
    runtime_manifest = pinned(runtime_manifest_path, reference['runtimeLogicalManifestSha256'])
    if {k: v for k, v in runtime_manifest.items() if k != 'calibration'} != export_manifest:
        raise ValueError('Runtime logical manifest changed frozen graph identity or qualification flags')
    downloads = {}
    for entry in ledger['files']:
        url_path = urlsplit(entry['download']).path
        relative = url_path.removeprefix('/lemma/').lstrip('/')
        actual = (build / relative).resolve()
        if not actual.is_relative_to(build) or Path(entry['path']).resolve() != actual:
            raise ValueError('Cold download is outside the pinned production build or has the wrong path')
        downloaded = artifact(actual, entry['sha256'])
        row = {**downloaded, 'role': entry['role'], 'download': entry['download']}
        previous = downloads.get(entry['download'])
        if previous is not None and previous != row:
            raise ValueError('Conflicting records for one cold download')
        downloads[entry['download']] = row
    entries = list(downloads.values())
    if set(downloads) != set(inventory['downloads']):
        raise ValueError('Cold file ledger differs from the pinned production dependency inventory')
    roles = {row['role'] for row in entries}
    if not (SUPPORT | set(FILES) | {'neural-manifest'}) <= roles:
        raise ValueError('Cold ledger omitted a declared typeahead dependency')
    required = {key: value['sha256'] for key, value in neural_files.items()}
    if any({row['sha256'] for row in entries if row['role'] == role} != {sha} for role, sha in required.items()):
        raise ValueError('Cold ledger differs from the verified neural files')
    manifest_modules = b''.join((build / urlsplit(row['download']).path.removeprefix('/lemma/').lstrip('/')).read_bytes()
                              for row in entries if row['role'] == 'neural-manifest')
    if any(sha.encode() not in manifest_modules for sha in required.values()):
        raise ValueError('Built runtime manifest omits a frozen graph fingerprint')
    for role in ('prose', 'subject', 'latex', 'lexicon'):
        if {row['sha256'] for row in entries if row['role'] == role} != set(config['supportArtifactSha256'][role]):
            raise ValueError(f'Cold {role} asset differs from common selected support')
    if [(row['bytes'], row['sha256']) for row in entries if row['role'] == 'runtime-wasm'] != [
            (RUNTIME[name], RUNTIME_SHA256[name])]:
        raise ValueError('ORT payload differs from the runtime version and backend used for admission')
    size = sum(row['bytes'] for row in entries)
    admission = model_bytes + RESERVE + RUNTIME[name] <= LIMIT
    return {'name': name, 'runtimeModelCeilingBytes': LIMIT - RESERVE - RUNTIME[name],
            'runtimeAdmission': admission, 'actualColdTypeaheadBytes': size, 'actualColdFiles': entries,
            'ledgerSha256': ledger_sha, 'buildFingerprint': ledger['buildFingerprint'],
            'dependencyInventorySha256': reference['dependencyInventorySha256'],
            'runtimeLogicalManifestBytes': runtime_manifest_path.stat().st_size,
            'runtimeLogicalManifestSha256': reference['runtimeLogicalManifestSha256'],
            'eligible': admission and size <= LIMIT}


def exporter_manifest(precision, files):
    return {'version': 2, 'kind': 'neural', 'precision': 'mixed' if precision == 'int4-int8-head' else precision.split('-')[0],
            'quantization': precision, 'vocabSize': 16384, 'context': 512, 'layers': 8, 'heads': 8, 'headDim': 64,
            'files': files, 'qualification': {'parity': True, 'replay': False, 'wasm': False, 'webgpu': False}}


def candidate(precision, spec, config):
    metrics = pinned(spec['metrics'], spec['metricsSha256'])
    identities = {'checkpointSha256': 'checkpointSha256', 'trainingDataSha256': 'preparedManifestSha256',
                  'dataSha256': 'preparedManifestSha256', 'caseDataSha256': 'sharedHeldoutManifestSha256',
                  'casesSha256': 'validationCasesSha256'}
    if (metrics['contextSplit'] != 'validation' or metrics['precision'] != precision or
            any(metrics[key] != config[expected] for key, expected in identities.items())):
        raise ValueError(f'{precision} metrics do not match the frozen selection inputs')
    if not math.isfinite(metrics['quantNll']) or metrics['quantNll'] < 0:
        raise ValueError(f'{precision} quantized validation NLL is invalid')
    eligible_parity = parity(metrics)
    item = {'precision': precision, 'metricsSha256': spec['metricsSha256'],
            **{key: metrics[key] for key in identities}, 'contextSplit': 'validation',
            'parityPassed': eligible_parity, 'parityByLayout': metrics['layouts'], 'quantNll': metrics['quantNll'],
            'quantMeanNll': metrics['quantNll'] / 300, 'nativeNll': metrics['nativeNll'],
            'probabilityDrift': metrics['quantMeanTotalVariation'], 'eligible': False, 'rejectionReasons': []}
    if not eligible_parity:
        item['rejectionReasons'].append('native-or-layout-parity')
        return item
    files = {role: artifact(Path(spec['directory']) / name, spec['fileSha256'][name]) for role, name in FILES.items()}
    if files['tokenizer']['sha256'] != config['tokenizerSha256']:
        raise ValueError('The candidate tokenizer differs from the common audited tokenizer')
    model_bytes = sum({row['path']: row['bytes'] for row in files.values()}.values())
    manifest_path = Path(spec['manifest'])
    manifest = pinned(manifest_path, spec['manifestSha256'])
    canonical = (json.dumps(exporter_manifest(precision, files), indent=2, sort_keys=True) + '\n').encode()
    if manifest_path.read_bytes() != canonical:
        raise ValueError('Logical manifest differs from exact exporter serialization')
    bundle_bytes = sum(row['bytes'] for row in files.values()) + manifest_path.stat().st_size
    if sum(row['bytes'] for row in files.values()) != metrics['graphBytes'] or bundle_bytes != metrics['downloadBytes']:
        raise ValueError('Native export byte report differs from the exact candidate files and manifest')
    backends = []
    for name in config['targetBackends']:
        if model_bytes + RESERVE + RUNTIME[name] > LIMIT:
            backends.append({'name': name, 'runtimeAdmission': False, 'eligible': False,
                             'runtimeModelCeilingBytes': LIMIT - RESERVE - RUNTIME[name]})
        else:
            ledger = spec['backendLedgers'][name]
            backends.append(backend_record(name, ledger, config, manifest, files, model_bytes))
    item.update(modelFingerprint=':'.join(row['sha256'] for row in files.values()), neuralManifestSha256=spec['manifestSha256'],
                neuralBundleBytes=bundle_bytes, files=files, backends=backends,
                eligible=bundle_bytes <= EXPORT_LIMIT and any(row['eligible'] for row in backends))
    if bundle_bytes > EXPORT_LIMIT:
        item['rejectionReasons'].append('export-bundle-budget')
    if not any(row['eligible'] for row in backends):
        item['rejectionReasons'].append('cold-browser-budget')
    return item


def select(config):
    if digest(config['procedure']) != config['procedureSha256']:
        raise ValueError('Frozen precision selection procedure changed')
    if set(config['variants']) != set(ORDER) or not config['targetBackends'] or not set(config['targetBackends']) <= RUNTIME.keys():
        raise ValueError('Declare all three prespecified precisions and supported target backends')
    variants = [candidate(precision, config['variants'][precision], config) for precision in ORDER]
    winner = min((row for row in variants if row['eligible']),
                 key=lambda row: (row['quantNll'], row['neuralBundleBytes'], ORDER.index(row['precision'])), default=None)
    selected = ({key: winner[key] for key in ('precision', 'modelFingerprint', 'neuralManifestSha256', 'neuralBundleBytes')}
                | {'eligibleBackends': [row['name'] for row in winner['backends'] if row['eligible']]}) if winner else None
    keep = ('procedureSha256', 'sourceCommit', 'runtimeSourceFingerprint', 'checkpointSha256', 'trainingLedgerSha256',
            'preparedManifestSha256', 'sharedHeldoutManifestSha256', 'tokenizerSha256', 'validationCasesSha256')
    return {**{key: config[key] for key in keep}, 'version': 1, 'validationCases': 300,
            'budgetBytes': LIMIT, 'supportReserveBytes': RESERVE, 'variants': variants, 'selected': selected,
            'status': 'selected-for-validation-browser' if selected else 'fallback-no-native-and-byte-qualified-candidate',
            'validationBrowser': 'pending' if selected else 'unavailable', 'finalReplayStatus': 'unqualified'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('config', type=Path)
    parser.add_argument('output', type=Path)
    options = parser.parse_args()
    report = select(json.loads(options.config.read_text()))
    with options.output.open('x') as output:
        output.write(json.dumps(report, indent=2, sort_keys=True) + '\n')
