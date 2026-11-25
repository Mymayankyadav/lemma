# N236 · historical shared-vocabulary comparison

The historical word model has four layers, width 192 and a 48-token rolling context. It shares the ordered 30,005-entry vocabulary of the checked-in trigram. The [expanded pipeline](../expanded/README.md) covers source-grouped splits, byte BPE, larger models and final-strip replay.

| Step | Command |
| --- | --- |
| Prepare the original word corpus | `prepare.py --input proofpile_dev.jsonl.gz --out work/data` |
| Train the historical comparison | `train.py --data work/data --out work/model --max-minutes 25` |
| Compare the trained graph on shared events | `export_onnx.py --model work/model/best.pt --data work/data --out work/neural-v1` |
| Run on a private T4 notebook | `kaggle_train.py` with `kernel-metadata.json` |

Training validation retains the true sentence ending and scores every eligible target once. Maths and number tokens remain in context. The export checks the ordered vocabulary and evaluates the native, float ONNX, int8 ONNX and normalized packed n-gram on the same 300 distinct held-out word contexts, including context lengths 1, 2 and 48. The checkpoint must meet the size and parity limits and the quantized model must achieve at most 90% of the normalized n-gram perplexity on these exact events.

These results are diagnostic because the historical corpus uses one held-out partition. The exporter only writes a manifest after its diagnostic gates pass. The historical 101.33 figure came from the older unnormalized comparison.
