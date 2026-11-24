#!/usr/bin/env python3
"""N236 · export the trained model to ONNX (last-position log-probabilities), quantise to int8, check it, write the manifest.

    python3 scripts/typeahead/train/export_onnx.py --model work/model/best.pt --data work/data --out public/models/typeahead/neural-v1

The graph takes ids [1, T] (T <= 48, the last words before the caret, <s> first) and returns ln P(next word) over the 30,005-word
vocabulary of ngram-v1 [1, V]. Size gate 20 MB; the int8 graph must agree with the fp32 one on the top-3 for 95% of held-out contexts.
"""
import argparse, hashlib, json, os, sys
import numpy as np, torch, torch.nn.functional as F
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train import LM, CTX

class Last(torch.nn.Module):
    def __init__(self, lm): super().__init__(); self.lm = lm
    def forward(self, ids):
        h = self.lm.hidden(ids)[:, -1]
        return F.log_softmax(h @ self.lm.tok.weight.T, -1)

ap = argparse.ArgumentParser()
ap.add_argument('--model', required=True); ap.add_argument('--data', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--max-mb', type=float, default=20)
a = ap.parse_args()
ck = torch.load(a.model, map_location='cpu')
lm = LM(ck['vocab']); lm.load_state_dict(ck['model']); lm.eval()
os.makedirs(a.out, exist_ok=True)
fp32, int8 = os.path.join(a.out, 'model.fp32.onnx'), os.path.join(a.out, 'model.onnx')
torch.onnx.export(Last(lm), torch.zeros(1, 8, dtype=torch.long), fp32, input_names=['ids'], output_names=['logp'],
                  dynamic_axes={'ids': {1: 'T'}}, opset_version=17, dynamo=False)
from onnxruntime.quantization import quantize_dynamic, QuantType
quantize_dynamic(fp32, int8, weight_type=QuantType.QInt8)
size = os.path.getsize(int8) / 2**20
print(f'int8 graph {size:.1f} MB')
import onnxruntime as ort
sf, sq = ort.InferenceSession(fp32), ort.InferenceSession(int8)
flat, offsets = np.load(os.path.join(a.data, 'held_flat.npy')), np.load(os.path.join(a.data, 'held_offsets.npy'))
rng, agree, total, worst = np.random.default_rng(7), 0, 0, 0.0
for _ in range(300):
    i = int(rng.integers(0, len(offsets) - 1)); s = flat[offsets[i]:offsets[i + 1]][:CTX - 1].astype(np.int64)
    if len(s) < 2: continue
    cut = int(rng.integers(1, len(s) + 1)); ids = np.concatenate([[0], s[:cut]])[None]
    p, q = sf.run(None, {'ids': ids})[0][0], sq.run(None, {'ids': ids})[0][0]
    agree += set(np.argsort(-p)[:3]) == set(np.argsort(-q)[:3]); total += 1; worst = max(worst, float(np.abs(p[np.argsort(-p)[:20]] - q[np.argsort(-p)[:20]]).max()))
parity = agree / total
metrics = json.load(open(os.path.join(os.path.dirname(a.model), 'metrics.json')))
manifest = {'assetSetVersion': 'neural-v1', 'file': {'path': 'model.onnx', 'bytes': os.path.getsize(int8), 'sha256': hashlib.sha256(open(int8, 'rb').read()).hexdigest()},
            'context': CTX, 'vocabulary': 'shares public/models/typeahead/ngram-v1 (ids 0-4: <s> <m> <num> <unk> </s>)',
            'parameters': metrics['parameters'], 'heldPerplexity': metrics['bestHeldPerplexity'], 'ngramHeldPerplexity': 101.33,
            'int8Top3Agreement': parity, 'int8WorstLogProbGap': worst, 'gpuMinutes': metrics['gpuMinutes'],
            'build': {'commands': ['prepare.py', 'train.py', 'export_onnx.py'], 'dir': 'scripts/typeahead/train'}}
json.dump(manifest, open(os.path.join(a.out, 'manifest.json'), 'w'), indent=2)
os.remove(fp32)
print(json.dumps(manifest, indent=2))
ok = size <= a.max_mb and parity >= .95 and metrics['bestHeldPerplexity'] <= .9 * 101.33
print('GATE', 'PASS' if ok else 'FAIL (size, int8 agreement >= 0.95 and perplexity <= 0.9 x the n-gram are required)')
sys.exit(0 if ok else 1)
