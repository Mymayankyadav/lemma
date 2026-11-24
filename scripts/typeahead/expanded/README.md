# Expanded typeahead build and evaluation

Run the offline tools with Python 3.11 or newer. Corpus ingestion uses PyArrow and Zstandard for their respective formats. Subword preparation uses NumPy and Tokenizers 0.22.1. Neural training uses PyTorch 2.11 or newer. Export uses ONNX 1.20.1, ONNX Runtime 1.24.2, and ONNX IR 1.1.0 for int4 conversion. These dependencies are for experiments and asset builds. The app does not install these Python packages.

## Data and vocabulary

`public_sources.py` retrieves explicit public dataset revisions and verifies the publisher's LFS SHA-256 and file length. `corpus.py` accepts the resulting JSON specification, or a local specification with the same fields. Preserve the upstream source identifier, revision, path, licence and document group when adding a source. The current adapter retains the underlying source notices for FineMath, arXiv and Math StackExchange. Store raw documents and checkpoints in the experiment workspace with the corresponding source notices.

```bash
cd scripts/typeahead/expanded
python public_sources.py --out work/sources --shards-per-register 9 7 5
python corpus.py --sources work/sources/sources.json --out work/corpus \
    --development work/corpus-dev --target-words 500000000 \
    --replay-exclusions work/replay-exclusions.txt
python subwords.py --corpus work/corpus-dev --out work/prepared-dev --adapt-contexts 512 1024
python subwords.py --corpus work/corpus --out work/prepared --adapt-contexts 512 1024 \
    --frozen-tokenizer work/prepared-dev/tokenizer.json
```

The exclusion file contains precomputed SHA-256 content fingerprints or canonical source-group hashes from an authorized replay, one per line. Group exact copies, publisher revisions and recognized near duplicates before assigning any split. The near-duplicate search uses bounded four-word shingles and verifies Jaccard similarity of at least 0.8 for candidates. It can miss paraphrases that share few shingles, so known paraphrase groups should share a source group ID. Coverage from inferred subjects uses keyword heuristics.

The nested 100M set and larger pool use the same split membership. Publisher identifiers are required by the declared public-source adapters. FineMath groups by page URL. The private `group-audit` stage verifies every emitted publisher group and checks that development documents remain in those same groups. After preparing the full, development and current-sized pools, `prepared-audit` verifies nested membership, the common tokenizer and identical held-out streams. Final private training takes the audit as an input and runs with `--require-audit`. A shortage in any of the 60/30/10 register allocations appears in the manifest. The 100M and 500M word/maths counts use the legacy KN sentence tokenizer that matches browser KN history. It extracts lowercase ASCII word segments with an optional internal ASCII apostrophe, maps numbers to `<num>` and closed formulas or eligible bare variables to `<m>`, and excludes sentence markers from those corpus counts. These are token occurrences in the retained distinct documents. The KN vocabulary follows that same convention. Browser copy candidates and the separate byte-BPE model cover Unicode names and compounds. BPE stream counts include document start and end markers. Processed training targets count only positions scored by the loss. LaTeX token counts are reported separately. The tokenizer freezes on development training documents only, encodes UTF-8 bytes as a lossless fallback, and is reused across corpus-size comparisons. Math StackExchange question and first-reply blocks provide a separate role adaptation stream. Its prompts contain only the visible question and question-derived lexical reminders.

## N-gram assets

Build each order and pruning strategy on the same development corpus, vocabulary size and byte cap, then choose on validation. Compare serialized assets on identical target events with `score_assets.py`. Pass `--legacy-holdout` for a diagnostic comparison using the old corpus and the intersection of both holdout definitions. Historical and expanded vocabularies have different OOV rates, so prefer final-strip replay on words/symbols for product comparisons.

```bash
python ngram.py --corpus work/corpus-dev --out work/ngram5-count --order 5 --pruning count
python ngram.py --corpus work/corpus-dev --out work/ngram5-entropy --order 5 --pruning entropy
python ngram.py --corpus work/corpus-dev --out work/topology --order 5 --pruning entropy \
    --subject topology --shared-vocab work/ngram5-entropy/vocab.json --limit 4194304
python ngram.py --corpus work/corpus-dev --out work/latex-v2 --kind latex --vocab-size 1500 \
    --order 4 --pruning entropy --limit 2097152
python score_assets.py --corpus work/corpus-dev --model count work/ngram5-count \
    --model entropy work/ngram5-entropy --out work/model-comparison.json
```

The estimator stores sorted counts and unpruned reference rows in SQLite. Entropy priority multiplies each approximate removal cost by its empirical history frequency. Run the count and entropy jobs with sufficient scratch space for distinct n-gram counts and their reference rows. Release binary verification uses the asset SHA-256 and ordered vocabulary SHA-256. General and subject packs share outcome IDs. The binary holds little-endian arrays referenced from a 32-byte header. Every packed row recomputes backoff against the already packed shorter history, using its actual mass.

## Neural training and export

The controlled neural comparison encodes every document of the audited 500M-word pool and nested 100M-word development pool using the same train-only 16K tokenizer. The full pool has no word or BPE cap. The preparation audit walks the verified raw training shards alongside the encoded document trace, checks every document and group, and verifies exact per-register word counts and shared holdout inputs. Record actual BPE IDs and artifact bytes separately from the exact optimizer exposure milestones.

Use `train.py` with `--candidate primary` for the 33,870,848-parameter model and `--candidate larger` for the 70,224,640-parameter capacity comparison. The 48-token reference on the same byte tokenizer has 4,934,784 parameters. The controlled capacity arm uses `--candidate capacity-reference` to match the primary model's 512-token context. Use `--sequence-length 512` for the primary and 1,024 for the larger model. Train with `torchrun --standalone --nproc_per_node=2` after measuring the single- and dual-device cases. Use `--resume .../latest.pt` to continue the same hashed data, tokenizer, optimizer, batch, sampler cursor and schedule. The seeded affine sampler traverses each distinct pool in constant memory. Token milestones count scored next-token targets. At a milestone the final global batch masks surplus labels, records that count and saves the advanced sampler cursor. A staged resume should use the same planned milestone list as the uninterrupted run. Use `--adapt --initialize .../best.pt` for the separate role-masked stage with the same tokenizer.

Prepare the private Kaggle notebook script with `kaggle_run.py`. Pass prior allocated usage when reserving a later run. Set the Kaggle `--timeout` to the maximum wall seconds allowed by allocated GPU-hours divided by assigned device count. NvidiaTeslaT4 assigns two devices, including when training uses only one. Compare the script ledger with the complete Kaggle session duration and provider quota. Save the source archive SHA-256, branch commit and exact Kaggle version with the experiment. Export on a CPU notebook using both the prepared data and training notebooks as inputs.

```bash
python export.py --checkpoint work/training/best.pt --data work/prepared \
    --out work/export --precision int8-weight-only --max-bytes 41943040
```

Select quantization using a fixed validation set of at least 300 distinct contexts with lengths spanning 1 to the model's maximum. Freeze the chosen precision before checking a separate untouched test set. Role-adapted exports also verify the actual question/aids/draft layout. The exporter checks the native full context and cached model, float ONNX and the quantized graphs. The primary int8 graph shares one quantized weight between the embedding and output head. Prefill and incremental graphs share a verified external tensor file. Export qualification, browser/device qualification and UI replay qualification are independent. The candidate stays disabled until the applicable device and replay evidence passes.

## Frozen replay and calibration

Capture the actual ordered three-slot display before opening the gold outcome. Use the same caret schedule, document groups and answer-level full typing trajectories for every arm. The keystroke records declare `costDefinition: "full-answer-v1"` and include all typed keys, taps and undos from the empty draft. Compare both arms against the same manual cost for each answer.

```bash
python replay_metrics.py --gold work/test-gold.jsonl --baseline corrected \
    --run corrected work/corrected-impressions.jsonl work/corrected-keys.jsonl \
    --run expanded work/expanded-impressions.jsonl work/expanded-keys.jsonl --out work/replay-metrics.json
python fit.py mixture --calibration work/calibration.components.jsonl \
    --validation work/validation.components.jsonl --asset-sha256 "$GENERAL_SHA256" --out work/mixture.json
python fit.py calibration --calibration work/calibration.ghost-calibration.jsonl \
    --validation work/validation.ghost-calibration.jsonl --model-fingerprint "$NEURAL_FINGERPRINT" --out work/calibration.json
```

The [browser fitting procedure](../../../docs/current/N238.md#fitting-and-promotion) defines the capture flags and bundle fingerprints. Use fixed-caret captures from independent grouped schedules and the same fallback build. The mixture fitter redistributes missing component mass to the general model and shrinks subject fits toward pooled coefficients. A mixture becomes loadable only after held-out log loss improves against the captured fallback, with matching general and subject assets. Calibration fits exact match, acceptance after measured display, and retention conditional on acceptance separately. Offline exact captures contain no observed acceptance or retention. Tune the exact-match operating point on validation and report precision, coverage and the answer-level interval on the frozen final schedule.

Run the offline integrity suite with `python test_pipeline.py`. The [pilot evidence](evidence/primary-pilot.json) records measured training, resume, failure of the dynamic-int8 cache parity gate, and validation parity for weight-only int8. The pilot corpus is separate from the expanded-corpus training and product qualification. The [preliminary 100M corpus](evidence/preliminary-100m-corpus.json), [effective-batch GPU probe](evidence/gpu-batch-probe.json), [diagnostic n-grams](evidence/ngram-pilot.json), [baseline browser replay](evidence/corrected-v1-public-replay.json), and [download-size subtotal](evidence/pilot-download-budget.json) preserve measured numbers and their scope. The [int4 validation](evidence/primary-int4-validation.json) and [mixed-precision validation](evidence/primary-mixed-precision-validation.json) missed the 95% parity gate. No pilot candidate is qualified for deployment. The [allocated GPU ledger](evidence/allocated-gpu-runs.json) and [planned controlled matrix](evidence/controlled-run-matrix.json) give the compute bounds and comparisons separately.

### Audited 100M and 500M prose comparisons

Freeze the ordered vocabulary with `ngram-vocab --corpus-dir corpus-dev --subjects`. Count once
on each audited pool with `ngram-counts --ngram-orders 5 --subjects`, mounting the frozen vocabulary.
The two counting jobs can run in parallel. Mount the development checkpoint in one `ngram-pack`
CPU notebook per order. Each runs count and entropy pruning
against the same raw and continuation counts and evaluates the same validation targets. Run
`ngram-select --subjects` with the three pack outputs. Order 3 remains a comparison. Among orders 4
and 5, lowest validation perplexity selects the order and pruning rule. The order-3 control and all
pruning results remain in the selection record.

Mount the 500M count output and the selected development artifact for
`ngram-pack --corpus-dir corpus --subjects`. This uses the selected configuration and unchanged
ordered vocabulary, so the word-count comparison holds vocabulary size and composition constant.
Build each subject in its own `ngram-pack` notebook with the same audited corpus and selected
development artifact, passing one subject at a time.
The count stage checks the compressed size against available output bytes. The packing stage checks
both the archive and extracted database hashes, opens the raw count database read-only, and uses
local scratch for model probability rows. Its output includes the source corpus and count hashes.

### Browser probability audit

Run `node scripts/typeahead/expanded/audit_browser.mjs /tmp/typeahead-audit.json` with the existing
Playwright and Vite dependencies. The verifier starts an isolated localhost server and Chromium.
Use the installed Playwright browser or set `chromiumExecutable` to a local Chromium binary.

```json
{
  "mode": "final",
  "general": "./models/ngram-v2",
  "latex": "./models/latex-v2",
  "subjects": {"linear-algebra": "./models/subject-linear-algebra", "topology": "./models/subject-topology"},
  "corpusManifest": "./corpus/manifest.json",
  "groupAudit": "./group-audit.json",
  "output": "./typeahead-audit-results.json"
}
```

Paths are relative to the config file. Include every published subject shard. Keep the config and
assets outside the repository. Use `diagnostic` mode to exercise preliminary assets without the final
corpus gate. Supply a `mixture` file only if its separate held-out qualification passed. The report
records which scopes activated a fit and checks the fallback where it did not activate.

Chromium uses the product loader, parser and scorer to sum every stored sparse row and edge. Seeded
stored and absent histories are also checked over the full vocabulary, along with the complete mixture
support and LaTeX identifier allocation. The report records exact input hashes and byte counts, the
verifier and source snapshot hashes, coverage, and worst errors. The verifier reads model assets
and corpus metadata without opening replay events, labels or source documents.
