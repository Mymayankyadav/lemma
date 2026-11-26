"""Run a matched, opt-in validation comparison from two already served static builds.

Both Playwright configs must point at their respective served builds; start the
servers before invoking. No final or reserve split is accepted. This deliberately
runs quality arms sequentially and makes no isolated latency claim.
"""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys

from corpus import file_hash, records


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('split', 'allocation', 'control-build', 'control-config', 'candidate-build', 'candidate-config', 'out'):
        p.add_argument('--' + name, type=lambda x: Path(x).resolve(), required=True)
    p.add_argument('--model-sha', required=True)
    p.add_argument('--menu-trial', choices=['m1', 'm1-neutral', 'm2', 'm2-tutor', 'm2-right'], required=True)
    p.add_argument('--jobs', type=int, default=2)
    p.add_argument('--block', type=int, default=10)
    p.add_argument('--seed', type=int, default=253)
    a = p.parse_args()
    if a.split.name != 'validation' or a.jobs < 1 or a.block < 1:
        raise ValueError('Use a staged validation split and positive worker/block counts')
    manifest = json.loads((a.split.parent / 'manifest.json').read_bytes())['splits']['validation']
    for name in ('answers.jsonl', 'contexts.jsonl', 'events.jsonl', 'gold.jsonl'):
        if file_hash(a.split/name) != manifest['files'][name]:
            raise ValueError('Validation split digest mismatch: ' + name)
    answers = list(records(a.split/'answers.jsonl'))
    allocation = list(records(a.allocation))
    if ({x['answerId'] for x in answers} != {x['answerId'] for x in allocation} or
            len(answers) != len(allocation) or any(not x.get('stratum') for x in allocation)):
        raise ValueError('Allocation must declare exactly one stratum per staged answer')
    repo = Path(__file__).resolve().parents[3]
    a.out.mkdir(parents=True, exist_ok=True)
    driver = a.out/'driver'
    (driver/'helpers').mkdir(parents=True, exist_ok=True)
    for name in ('n238-typeahead-replay.spec.ts', 'helpers/live-tutor.ts'):
        source, dest = repo/'tests/e2e'/name, driver/name
        if dest.exists() and file_hash(dest) != file_hash(source):
            raise ValueError('Existing comparison used a different driver: ' + name)
        if not dest.exists():
            shutil.copyfile(source, dest)
    base = [sys.executable, str(repo/'scripts/typeahead/expanded/run_cohort.py'), '--split', str(a.split),
            '--driver-from', str(driver), '--arm', 'default', '--sha', a.model_sha, '--jobs', str(a.jobs),
            '--block', str(a.block), '--faster-typing', '--flags=-typeaheadV2,-tutorAnswerAids,-proofAssistGhost']
    for arm, build, config in (('control', a.control_build, a.control_config), ('candidate', a.candidate_build, a.candidate_config)):
        for phase in ('cost', 'capture'):
            cmd = [*base, '--output', str(a.out/(arm+'-'+phase)), '--config', str(config), '--build', str(build), '--phase', phase]
            if arm == 'candidate':
                cmd += ['--menu-trial', a.menu_trial]
            subprocess.run(cmd, cwd=repo, check=True)
    subprocess.run([sys.executable, str(repo/'scripts/typeahead/expanded/study_statistics.py'), '--allocation', str(a.allocation),
                    '--gold', str(a.split/'gold.jsonl'), '--control', str(a.out/'control-capture/impressions.jsonl'),
                    '--candidate', str(a.out/'candidate-capture/impressions.jsonl'), '--control-keys', str(a.out/'control-cost/keys.jsonl'),
                    '--candidate-keys', str(a.out/'candidate-cost/keys.jsonl'), '--seed', str(a.seed),
                    '--out', str(a.out/'paired.json')], cwd=repo, check=True)


if __name__ == '__main__':
    main()
