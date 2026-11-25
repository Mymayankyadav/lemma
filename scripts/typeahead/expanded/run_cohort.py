"""Run the production Tutor replay in independent, complete public thread blocks."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
import re
import shutil
from pathlib import Path
import subprocess

from corpus import file_hash, records
from replay_sample import jsonl


# Construct the evaluation tutor's guidance exclusively from the question. These are simulated tutor choices.
WORDING = [('upper bound','upper limit'), ('lower bound','lower limit'), ('open set','open subset'),
           ('limit point','limit value'), ('basis vector','basis element'), ('unit vector','unit element'),
           ('linear map','linear operator'), ('inner product','scalar product'), ('initial value','initial term'),
           ('open cover','open covering'), ('vector space','vector field'), ('null space','null set')]


def with_tutor(context):
    question = ' '.join(context.get('question','').casefold().split())
    wording, hints = [], []
    for preferred, alternate in WORDING:
        if re.search(r'\b'+re.escape(preferred)+r'\b', question) and alternate not in question:
            start = len(hints)
            wording.extend([preferred, alternate])
            for offset, (entry, priority) in enumerate(((preferred,'prefer'),(alternate,'deemphasize'))):
                hints.append(dict(id=f'wording-{start+offset}',kind='phrase',entry=entry,priority=priority,
                                  role='neutral',scope={'mode':'prose'}))
        if len(hints) >= 6:
            break
    if not hints:
        return context
    aid = dict(level='scaffold',wording=wording,ranking=dict(version=1,hints=hints))
    return {**context, 'aid':aid}


def run(opts):
    repo = Path(__file__).resolve().parents[3]
    manifest = json.loads((opts.split.parent / 'manifest.json').read_bytes())['splits'][opts.split.name]
    static = hashlib.sha256()
    for path in sorted(p for p in opts.build.rglob('*') if p.is_file()):
        static.update(str(path.relative_to(opts.build)).encode() + bytes.fromhex(file_hash(path)))
    opts.output.mkdir(parents=True, exist_ok=True)
    # Pin the driver and the fixture before workers start so every shard executes the same source.
    driver = opts.output / 'driver'
    (driver / 'helpers').mkdir(parents=True, exist_ok=True)
    dep = driver / 'node_modules'
    if not dep.exists():
        dep.symlink_to(repo/'node_modules', target_is_directory=True)
    for source in ('n238-typeahead-replay.spec.ts','helpers/live-tutor.ts'):
        dest = driver/source
        incoming = repo/'tests/e2e'/source
        if not dest.exists():
            shutil.copyfile(incoming, dest)
    config = driver/'config.mts'
    config.write_text('import base from ' + json.dumps(str(opts.config)) + ';\n' +
                      'export default {...base,testDir:' + json.dumps(str(driver)) + ',workers:1};\n')
    invocation = dict(arm=opts.arm, phase=opts.phase, sha=opts.sha, static=static.hexdigest(),
                      config=file_hash(opts.config), harness=file_hash(driver/'n238-typeahead-replay.spec.ts'), fixture=file_hash(driver/'helpers/live-tutor.ts'),
                      split=manifest['files'])
    pack_env = {}
    if opts.fp16_pack:
        spec = json.loads((repo/'src/features/tutor/writingAid/decoder/android-fp16.json').read_bytes())
        if opts.arm != 'neural' or file_hash(opts.fp16_pack) != spec['packageSha256']:
            raise ValueError('Strict FP16 replay needs the pinned package on the neural arm')
        fingerprint = ':'.join(spec['files'][role]['sha256'] for role in ('prefill','incremental','tokenizer','weights'))
        pack_env = {'LEMMA_TYPEAHEAD_REPLAY_FP16_PACK':str(opts.fp16_pack),'LEMMA_TYPEAHEAD_REPLAY_GRAPH_TRIAL':'1',
                    'LEMMA_TYPEAHEAD_REPLAY_STRICT_GRAPH_TRIAL':'1','LEMMA_TYPEAHEAD_REPLAY_EXPECTED_NEURAL_FINGERPRINT':fingerprint}
        invocation['optionalPackage'] = spec['packageSha256']
    capture = opts.phase == 'capture'
    context_file = 'contexts.jsonl' if capture else 'answers.jsonl'
    for name in [context_file, 'events.jsonl']:
        if file_hash(opts.split/name) != manifest['files'][name]:
            raise ValueError('Unfrozen input: ' + name)
    contexts = list(records(opts.split/context_file))
    if opts.arm in ('tutor','personal'):
        contexts = [with_tutor(row) for row in contexts]
    if opts.threads:
        contexts = contexts[:opts.threads]
    fixed = list(records(opts.split/'events.jsonl')) if capture else []
    # A prior shell experiment must not silently change this frozen cohort's flags or model.
    process_env = {key: value for key, value in os.environ.items() if not key.startswith('LEMMA_TYPEAHEAD_REPLAY_')}
    (opts.output/'invocation.json').write_text(json.dumps(invocation, sort_keys=True)+'\n')
    def block(index_and_chunk):
        i, chunk = index_and_chunk
        directory = opts.output / f'block-{i:03}'
        directory.mkdir(exist_ok=True)
        ids = {r['answerId'] for r in chunk}
        events = sorted((r for r in fixed if r['answerId'] in ids), key=lambda r:(r['answerId'],len(r['prefix'])))
        jsonl(directory/'context.jsonl', chunk)
        jsonl(directory/'events.jsonl', events)
        dest = directory/'run'
        expected = str(dest) + ('.impressions.jsonl' if capture else '.keys.jsonl')
        receipt = directory/'receipt.json'
        field = 'eventId' if capture else 'answerId'
        scheduled = [r[field] for r in (events if capture else chunk)]
        if receipt.exists():
            existing = list(records(Path(expected)))
            if json.loads(receipt.read_bytes()) == {**invocation, 'sha256': file_hash(expected)} and [r[field] for r in existing] == scheduled:
                return existing
            raise ValueError('Existing block mismatches schedule')
        env = {**process_env, **pack_env, 'LEMMA_TYPEAHEAD_REPLAY_INPUT':str(directory/'events.jsonl'),
            'LEMMA_TYPEAHEAD_REPLAY_ANSWERS':str(directory/'context.jsonl'), 'LEMMA_TYPEAHEAD_REPLAY_OUTPUT':str(dest),
            'LEMMA_TYPEAHEAD_REPLAY_ARM':opts.arm,'LEMMA_TYPEAHEAD_REPLAY_EXPECTED_NGRAM_SHA':opts.sha,
            'LEMMA_TYPEAHEAD_REPLAY_COMPARE':'1', 'LEMMA_TYPEAHEAD_REPLAY_CAPTURE_ONLY':str(int(capture)),
            'LEMMA_TYPEAHEAD_REPLAY_BLIND':str(int(capture))}
        with (directory/'browser.log').open('w') as log:
            subprocess.run([str(repo/'node_modules/.bin/playwright'),'test','-c',str(config),
                'n238-typeahead-replay.spec.ts','-g','replays visible','--workers=1',
                '--output',str(directory/'playwright')],env=env,cwd=repo,stdout=log,stderr=subprocess.STDOUT,check=True)
        observed = list(records(Path(expected)))
        if [r[field] for r in observed] != scheduled:
            raise ValueError('Browser returned the wrong opportunities')
        receipt.write_text(json.dumps({**invocation, 'sha256': file_hash(expected)}, sort_keys=True) + '\n')
        print(f'{opts.phase} {i} complete', flush=True)
        return observed
    chunks = list(enumerate(contexts[i:i+opts.block] for i in range(0, len(contexts), opts.block)))
    with ThreadPoolExecutor(max_workers=opts.jobs) as pool:
        rows = [r for chunk in pool.map(block, chunks) for r in chunk]
    selected_ids = {r['answerId'] for r in contexts}
    if len(rows) != (sum(r['answerId'] in selected_ids for r in fixed) if capture else len(contexts)):
        raise ValueError('Incomplete replay')
    jsonl(opts.output/('impressions.jsonl' if capture else 'keys.jsonl'), rows)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    for arg in ('split','output','config','build'):
        p.add_argument('--'+arg, type=lambda path:Path(path).resolve(), required=True)
    p.add_argument('--arm', choices=['corrected-v1','expanded-kn','tutor','personal','neural'],required=True)
    p.add_argument('--phase', choices=['capture','cost'],required=True)
    p.add_argument('--sha', required=True)
    p.add_argument('--threads',type=int)
    p.add_argument('--fp16-pack',type=lambda path:Path(path).resolve(),help='Install and validate a pinned optional model through the real settings UI')
    p.add_argument('--jobs', type=int, default=2)
    p.add_argument('--block', type=int, default=10)
    run(p.parse_args())
