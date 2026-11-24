# N236 · neural next-word model (GPU part of the Type-Ahead Plan)

A 7.6 M-parameter word-level transformer (4 layers, width 192, context 48) that shares ngram-v1's vocabulary. It exists to re-score the
n-gram's candidates with the whole sentence as context and to give grey text a calibrated probability. Cost: about 3.6e14 FLOP per epoch
of 9 M tokens, so a T4 needs well under a minute per epoch; the run is capped at 25 minutes of training (`MAX_MINUTES`).

| Step | Where | Command | Status |
| --- | --- | --- | --- |
| prepare | CPU, 1 min | `prepare.py --input proofpile_dev.jsonl.gz --out work/data` | run once; vocabulary (30,005) and held-out set (22,388 sentences) match ngram-v1 |
| train | GPU | `train.py --data work/data --out work/model --max-minutes 25` | written, never run |
| export | CPU | `export_onnx.py --model work/model/best.pt --data work/data --out public/models/typeahead/neural-v1` | written, never run |
| all three on Kaggle | T4, internet on | `kaggle_train.py` with `kernel-metadata.json` | written, never run |

Gate (export exits non-zero otherwise): int8 file <= 20 MB; int8 and fp32 agree on the top 3 for >= 95% of 300 held-out contexts;
held-out perplexity <= 0.9 x the n-gram's 101.33 (same definition: sentence by sentence, `<m>` and `<num>` targets skipped, `</s>` counted).
If the gate fails, do not ship; try `--epochs`/`--lr` once, then report the numbers. Do not spend more than ~1 GPU-hour in total.

Known unknowns (first run will show them): `torch.onnx.export(..., dynamo=False)` and `quantize_dynamic` behaviour on the installed versions;
whether the tied 30 k x 192 embedding quantises (if the int8 file is over 20 MB, convert the embedding to fp16 or drop the vocabulary to 20 k).
