#!/usr/bin/env python3
"""Export the historical word model for matched-vocabulary diagnostics."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import numpy as np
import torch
from torch.nn import functional as F

from train import LM, CTX, held_windows

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'expanded'))
from score_assets import loaded


class Last(torch.nn.Module):
    def __init__(self, lm):
        super().__init__()
        self.lm = lm

    def forward(self, ids):
        h = self.lm.hidden(ids)[:, -1]
        return F.log_softmax(h @ self.lm.tok.weight.T, -1)


def holdout_cases(flat, offsets):
    """Unrepeated real contexts with true next source tokens, including EOS."""
    reserved_lengths = {1: {}, 2: {}, CTX: {}}
    other = {}
    for context, gold in held_windows(flat, offsets, limit=len(offsets) - 1):
        for i, target in enumerate(gold):
            if target in (-1, 1, 2):
                continue
            ids = tuple(map(int, context[:i + 1]))
            bucket = reserved_lengths.get(len(ids), other)
            if len(bucket) < 300:
                bucket.setdefault(ids, int(target))
        if all(len(reserved_lengths[length]) >= 80 for length in (2, CTX)) and len(other) >= 300:
            break
    cases = list(reserved_lengths[1].items())
    for length in (2, CTX):
        cases.extend(list(reserved_lengths[length].items())[:80])
    cases.extend(list(other.items())[:300 - len(cases)])
    if len(cases) != 300 or not all(any(len(ids) == length for ids, _ in cases) for length in (1, 2, CTX)):
        raise ValueError('Need 300 distinct word contexts covering lengths 1, 2 and 48')
    return cases


def top3(logp):
    return tuple(np.argsort(-logp, kind='stable')[:3])


def main():
    root = Path(__file__).resolve().parents[3]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--data', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--baseline', type=Path, default=root / 'public/models/typeahead/ngram-v1')
    parser.add_argument('--max-mb', type=float, default=20)
    args = parser.parse_args()

    from onnxruntime import InferenceSession, SessionOptions
    from onnxruntime.quantization import QuantType, quantize_dynamic
    vocab, baseline, _ = loaded(args.baseline)
    if json.loads((args.data / 'vocab.json').read_text()) != vocab:
        raise ValueError('Ordered vocabulary differs from the normalized word baseline')
    checkpoint = torch.load(args.model, map_location='cpu', weights_only=True)
    if checkpoint['vocab'] != len(vocab) or checkpoint['ctx'] != CTX:
        raise ValueError('Model does not have the legacy word-level shape')
    model = LM(len(vocab))
    model.load_state_dict(checkpoint['model'])
    graph = Last(model.eval())
    torch.set_num_threads(2)
    args.out.mkdir(parents=True, exist_ok=False)
    fp32, int8 = [args.out / filename for filename in ('model.fp32.onnx', 'model.onnx')]
    torch.onnx.export(graph, torch.zeros(1, 8, dtype=torch.long), fp32,
                      input_names=['ids'], output_names=['logp'], dynamic_axes={'ids': {1: 'T'}},
                      opset_version=17, dynamo=False)
    quantize_dynamic(str(fp32), str(int8), weight_type=QuantType.QInt8)
    options = SessionOptions()
    options.intra_op_num_threads = 2
    float_ort = InferenceSession(str(fp32), sess_options=options, providers=['CPUExecutionProvider'])
    quant_ort = InferenceSession(str(int8), sess_options=options, providers=['CPUExecutionProvider'])
    flat = np.load(args.data / 'held_flat.npy')
    offsets = np.load(args.data / 'held_offsets.npy')
    cases = holdout_cases(flat, offsets)
    agreement = {'nativeFloatTop3': 0, 'nativeInt8Top3': 0, 'nativeInt8Top1': 0}
    nll = {name: 0. for name in ('native', 'float', 'int8', 'normalizedNgram')}
    drift = 0.
    with torch.no_grad():
        for ids, target in cases:
            example = np.array([ids], dtype='int64')
            native = graph(torch.from_numpy(example)).numpy()[0]
            floats = float_ort.run(None, {'ids': example})[0][0]
            quants = quant_ort.run(None, {'ids': example})[0][0]
            a, b, c = map(top3, (native, floats, quants))
            agreement['nativeFloatTop3'] += set(a) == set(b)
            agreement['nativeInt8Top3'] += set(a) == set(c)
            agreement['nativeInt8Top1'] += int(a[0] == c[0])
            drift = max(drift, float(np.max(np.abs(native - floats))))
            for name, values in (('native', native), ('float', floats), ('int8', quants)):
                nll[name] -= float(values[target])
            nll['normalizedNgram'] -= math.log(baseline.probability((0, *ids)[-2:], target))
    perplexity = {name: math.exp(total / len(cases)) for name, total in nll.items()}
    report = {'scope': 'historical word model, held-out diagnostic', 'targets': len(cases),
              'perplexity': perplexity, 'counts': agreement, 'nativeFloatMaxLogpError': drift}
    (args.out / 'cases.json').write_text(json.dumps(cases) + '\n')
    (args.out / 'metrics.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report), flush=True)
    size = int8.stat().st_size
    qualifies = (size / 2**20 <= args.max_mb and agreement['nativeInt8Top3'] / len(cases) >= .95 and
                 drift <= .001 and perplexity['int8'] <= .9 * perplexity['normalizedNgram'])
    if not qualifies:
        raise SystemExit('Historical word-model size, parity or matched-event perplexity gate failed')
    manifest = {'assetSetVersion': 'neural-v1', 'context': CTX, 'diagnosticOnly': True,
                'file': {'path': int8.name, 'bytes': size, 'sha256': hashlib.sha256(int8.read_bytes()).hexdigest()},
                'vocabSha256': hashlib.sha256('\n'.join(vocab).encode()).hexdigest(), 'metrics': report}
    (args.out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
