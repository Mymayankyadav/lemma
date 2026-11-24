#!/usr/bin/env python3
"""N236 · one Kaggle notebook script: fetch, prepare, train (hard-capped), export. Run with a GPU (T4) and internet on.

Everything lands in /kaggle/working (model.onnx, manifest.json, metrics.json), which is the notebook's output to download.
GPU time is capped by MAX_MINUTES (training stops and keeps its best checkpoint); the whole run should take about 20-30 minutes.
"""
import os, subprocess, sys, urllib.request

BRANCH = os.environ.get('LEMMA_BRANCH', 'ccr-220fd71d-iaf0fy')
MAX_MINUTES = os.environ.get('MAX_MINUTES', '25')
W = '/kaggle/working'
def run(*cmd, cwd=None):
    print('+', ' '.join(cmd), flush=True)
    subprocess.run(cmd, check=True, cwd=cwd)

run('git', 'clone', '--depth', '1', '--branch', BRANCH, 'https://github.com/Mymayankyadav/lemma.git', f'{W}/lemma')
run(sys.executable, '-m', 'pip', 'install', '-q', 'onnx', 'onnxruntime')
data = f'{W}/proofpile_dev.jsonl.gz'
if not os.path.exists(data):
    urllib.request.urlretrieve('https://huggingface.co/datasets/hoskinson-center/proof-pile/resolve/main/dev/proofpile_dev.jsonl.gz', data)
if os.path.getsize(data) != 161818020:
    raise SystemExit('proofpile_dev.jsonl.gz has an unexpected size; the corpus changed')
T = f'{W}/lemma/scripts/typeahead/train'
run(sys.executable, f'{T}/prepare.py', '--input', data, '--out', f'{W}/data')
run(sys.executable, f'{T}/train.py', '--data', f'{W}/data', '--out', f'{W}/model', '--max-minutes', MAX_MINUTES)
code = subprocess.run([sys.executable, f'{T}/export_onnx.py', '--model', f'{W}/model/best.pt', '--data', f'{W}/data', '--out', f'{W}/neural-v1']).returncode
print('EXPORT GATE', 'PASS' if code == 0 else 'FAIL', flush=True)
