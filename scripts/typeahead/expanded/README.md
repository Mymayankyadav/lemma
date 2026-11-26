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

For audited comparisons, export each checkpoint against its own prepared pool and the same train-free case source.

```bash
python export.py --checkpoint work/training/best.pt --data work/prepared \
    --match-training-data --case-data work/shared-heldout --split validation \
    --out work/export --precision int8-weight-only --max-bytes 41943040
```

The seven matched 512-token exports use the same frozen 300 cases per split, with 150 prose and 150 role-marked question/aids/draft contexts. Browser cases exercise partial-word retokenization, whole-word cache reuse and the last predictable token of retained windows. The report records actual input lengths by layout and separate hashes for the checkpoint's training data, shared case data and ordered case list. Require those last two hashes to match across the seven arms. Use validation to select checkpoints and quantization, then evaluate the selected artifacts on the frozen test split. The exporter checks the native full context and cached model, float ONNX and the quantized graphs. The primary int8 graph shares one quantized weight between the embedding and output head. Prefill and incremental graphs share a verified external tensor file. Export qualification, browser/device qualification and UI replay qualification are independent. The candidate stays disabled until the applicable device and replay evidence passes.

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

### Run frozen browser comparisons

From the repository root, run `python scripts/typeahead/expanded/run_frozen_replay.py CONFIG OUTPUT --phase capture`
with Vite and Playwright installed. The runner archives the exact `commit` from `CONFIG`, checks the
`calibration` and `validation` schedule directories, and builds once with the named `assets` directories.
Use absolute paths for inputs, and optionally set `chromiumExecutable` to a local browser. The preview uses a
local Tutor fixture and a synthetic sign-in. The capture phase leaves the final test schedule unopened.

For `--phase final-kn`, `--phase final-fallback` or `--phase final`, include the frozen `test` directory, `scheduleManifestSha256`,
`groupAudit` and its SHA-256, both corpus manifests, and `auditedAssetManifestSha256` for the selected packs.
If using a validated `mixture` or `neuralCalibration`, provide the corresponding capture inventory, its
SHA-256, and both hashed calibration inputs in `mixtureCapture` or `neuralCalibrationCapture`. The runner
checks these against the files that the earlier capture produced. `--locked-neural-trial` keeps the
backend byte cap and edit deadline in force and labels the candidate unqualified.

Use `--phase final-fallback --question-aids` when no neural candidate meets the frozen validation
procedure. Supply `neuralFallbackSelection: {path, sha256}` from the precision selector before opening
the test schedules. If the selector produced a candidate but browser validation failed or was unavailable,
also supply `neuralFallbackValidation: {path, sha256, evidence}`. Its report uses `version: 1`,
`contextSplit: "validation"`, `selectionSha256`, `modelFingerprint`, `status: "failed" | "unavailable"`
and `evidenceSha256`. The runner pins the underlying evidence file. No neural assets or neural calibration
are installed. The four measured arms are the corrected trigram, expanded counts, Tutor priorities and
prospective local personalization. The report identifies neural and weight comparisons as unavailable.
All other frozen-schedule, corpus and fit checks apply.

`--phase neural-controls` uses the full prepared-data audit, three audited prepared manifests, the shared
held-out manifest, and the seven named `neuralControls` records with pinned validation metrics, ledgers and
graph-file hashes. Supply the provider completion status and allocated GPU-hours from the provider record.
The three main checkpoints must share one ledger from the completed 500M-target run. It keeps fitted behavioral calibration out of the controlled comparison and preserves
fallback and unavailable outcomes. Keep configs, model binaries, source schedules and raw outputs in the
experiment workspace. The output inventory identifies the fixture input, assets and source for review.

### Reproduce the archived publisher-group audit

Run the private `group-audit` stage with the pinned full and development manifests.
For the corrected 500M archive only, pass `--archived-group-source SHA256` to
`kaggle_run.py` using the source archive hash in the
[local audit record](evidence/archived-corpus-local-audit.json). This reproduces the
one training-only publisher union. The audit verifies the original shards and rejects
cross-split aliases. Normal group audits omit this archived recovery option.

### Select primary deployment precision

Run `python scripts/typeahead/expanded/select_primary_precision.py CONFIG REPORT` for the
[frozen validation procedure](primary-precision-selection.md). Pin its hash, the three validation metrics files,
the byte-for-byte exporter manifests, and exact compiled asset ledgers. For each runtime-admissible target backend,
the file ledger must match its independently recorded dependency inventory from the same production build.
The selector checks the actual distinct download paths, including the ORT wrapper and pinned WASM payload,
and the runtime's cold ceiling. A selected report is an input to device validation. Production and replay
qualification remain separate.

## Public natural-answer replay and the optional FP16 file

The revised evaluation uses the group exclusions from the audited corpus, the verified legacy training identities and all earlier inspected schedules. The frozen manifest records the raw-source digests. The private Kaggle sample contains a deterministic bottom-hash sample from each of the two Stack Math Q&A source files. Each selected thread retains its original question and answer links. Aggregate evidence is published in the repository.

Run the following from a configured training environment. Supply the local file paths for the audited inputs. `PYTHONPATH` must include `scripts/typeahead` and `scripts/typeahead/expanded`.

```sh
python scripts/typeahead/expanded/sample_stackmath.py --source-root "$provider_input" --out "$sample"
python scripts/typeahead/expanded/natural_cohort.py exclude --corpus "$audited_corpus" --legacy "$legacy_training_index" --previous "${earlier_schedules[@]}" --out "$work/exclusions.sqlite"
python scripts/typeahead/expanded/natural_cohort.py freeze --source "$sample/questions.jsonl.gz" --exclusion "$work/exclusions.sqlite" --out "$work/frozen" --fit 200 --validation 100 --final 1000
python scripts/typeahead/expanded/natural_cohort.py middle --split "$work/frozen/validation" --out "$work/interior"
python scripts/typeahead/expanded/run_cohort.py --split "$work/frozen/fit" --phase capture --arm expanded-kn --build "$static_build" --config "$browser_config" --sha "$count_sha256" --output "$work/fit"
python scripts/typeahead/expanded/run_cohort.py --split "$work/frozen/validation" --phase capture --arm expanded-kn --build "$static_build" --config "$browser_config" --sha "$count_sha256" --output "$work/validation"
python scripts/typeahead/expanded/menu_evaluation.py fit --fit "$work/fit/impressions.jsonl" --fit-gold "$work/frozen/fit/gold.jsonl" --validation "$work/validation/impressions.jsonl" --val-gold "$work/frozen/validation/gold.jsonl" --sha "$count_sha256" --out "$ranker"
```

Set `--phase cost` to type complete answers and verify the result of each accepted suggestion. Use the `paired` command on development key files to select final thread count. Pass that count to the fixed-caret and full-answer runners with `--threads`. The `score` command takes `gold.jsonl`, the captured impressions and the same count. Each full-answer cost includes manual input through empty and late menus. Runners group ten public threads per independent browser profile. Preserve the built assets, the per-block driver digests and the frozen schedule to make comparisons reproducible.

For the optional 512-token model, package the audited FP16 export with `package_android_fp16.py --export "$export_dir" --out "$pack"`. Native references come from `android_reference.py --checkpoint "$checkpoint" --cases "$cases" --out "$reference"`. Run `run_cohort.py` with `--arm neural --fp16-pack "$pack"` for an explicitly installed, strict browser trial. A physical test uses a debuggable Android build containing the normal Tutor UI and the lab overrides. Run `node scripts/typeahead/expanded/qualify_android.mjs --pack "$pack" --reference "$reference" --out "$device_result"`. Supply `--serial` when multiple devices are attached and `--renderer` if WebView cannot identify a unique renderer through CDP. The lab records top-three parity by group, cached decode latency, actual keyboard taps, PSS and offline behavior.

Pass `--baseline previous/impressions.jsonl` to `menu_evaluation.py score` to compare visible offers on the same frozen opportunities. The report gives exact completions gained and lost and a thread-bootstrap interval for each change. The `paired` command reports keystroke savings and their interval for each arm and for the paired difference.

### Matched opt-in development comparison

With both static builds already served and each Playwright config pointing to its own server, run:

```sh
python scripts/typeahead/expanded/validation_compare.py \
  --split "$staged/validation" --allocation "$allocation_jsonl" \
  --control-build "$control_build" --control-config "$control_browser_config" \
  --candidate-build "$candidate_build" --candidate-config "$candidate_browser_config" \
  --model-sha "$count_sha256" --menu-trial m2 --jobs 2 --block 10 --out "$comparison"
```

The allocation JSONL has one `answerId` and predeclared `stratum` per answer; add `profileBlock` when answers share learning state. The command validates the staged manifest, pins the driver, runs trace-off full trajectories and trace-on blinded fixed observations for both arms, and writes `paired.json` with 10,000 matched, stratified whole-block draws. The output's planning approximation is not a final enrollment decision; estimate it from a sufficiently informative development comparison and freeze the sample before staging final data. `--punctuation-pairs` on `run_cohort.py` is a separate trajectory definition and cannot be pooled with strict costs. This command accepts the validation split only and does not stage any reserved answers. Tap-to-paint and physical-device tests require separate, isolated runs.
