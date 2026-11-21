# 8. Handwritten symbol input

## 8.1 Where things stand

- **The model.** Detypify 0.3.0 is an MIT-licensed raster CNN with a 224 × 224 input and 411 classes. Its weights are 4.94 MB; with runtime and metadata it ships at 18.44 MB. Lemma maps 136 of its classes to the 153-symbol catalogue.
- **The missing classes.** Detypify has no exact class for `<`, `>`, `=` or `≠`. In the stress set these four caused all 32 complete-symbol misses, and the geometry fallback recovered only 4 of 36.
- **Extensions.** **Could become** showed the intended longer symbol on 53 of 100 partial traces in the first corpus and 22 of 66 in the stress corpus.
- **Automatic insertion.** It has no supporting evidence: the combined identity-and-completion gate accepted nothing on the stress set. All of these results are synthetic and measured on desktop Chromium.

## 8.2 Data

| Source | Contents | Licence | Use |
| --- | --- | --- | --- |
| Your capture sessions (new; protocol below) | Prompted symbols, deliberate partial symbols, scribbles; finger and stylus | Your own data | Training, calibration, test (split by session date) |
| Other consenting writers (3–5) | Priority subset | With their consent | Writer-disjoint test |
| MathWriting (Gervais et al. 2024) | 253k human-written and 396k synthetic online math expressions; 95% of expressions from Wikipedia | CC BY-NC-SA 4.0 | Research comparisons; shipping weights trained on it needs licence review (non-commercial, share-alike) |
| CROHME competition sets | Online expressions with symbol-level segmentation | Research terms | Isolated-symbol extraction |
| HWRT | Isolated vector strokes, including Detexify data | ODbL | Stroke-sequence training |
| HASYv2 | Rasterized isolated symbols | Check | Raster pretraining |

**Capture protocol** for an **Ink capture** mode in the test APK, behind a flag:

1. **Priority symbols.** Prompt about 30 symbols: ∀ ∃ ∈ ∉ ⊂ ⊆ < ≤ > ≥ = ≠ ∞ ∑ ∫ ∂, plus Greek α β γ δ ε θ λ μ π σ φ ω. Collect 30 repetitions of each across at least 6 sessions. Vary speed and size, and use both finger and stylus if available.
2. **Deliberate partials** for every extension family: draw `<` and stop; then draw `≤`. Do the same for > / ≥, = / ≠, ∈ / ∉ and ⊂ / ⊆. These provide the real partial labels the completion head needs.
3. **Unknown marks.** Scribbles, letters that aren't catalogue symbols, dots and stray flicks.
4. **Time.** About 900–1,200 samples take roughly 45–60 minutes in total, spread over a week. Later, add 10 repetitions of every catalogue symbol.
5. **Record per sample:** strokes with timestamps, device, input type, prompted label, and whether it was a deliberate partial.

## 8.3 Models to test

| ID | Model | Description | Why |
| --- | --- | --- | --- |
| I0 | Detypify 0.3.0 (control) | As shipped | Baseline |
| I1 | Detypify, re-headed and fine-tuned | Replace the classifier head with Lemma's catalogue classes plus "unknown"; fine-tune on HWRT strokes rendered with Lemma's preprocessing, symbols cut from CROHME, and your captures | Adds `<`, `>`, `=`, `≠`; adapts to finger writing |
| I2 | Compact raster CNN from scratch | 64 × 64 input, about 0.5–1.5M parameters, MobileNet-style or a small ResNet | Smaller and faster; can be trained only on data whose licence allows shipping |
| I3 | Stroke-sequence encoder | Resampled points with (Δx, Δy, pen-down, Δt) features; 1-D convolution front end plus a 2-layer transformer (width 128) or a BiLSTM(128); about 0.3–1M parameters | Keeps stroke order and direction, which a raster discards. Gboard's handwriting recognizer is an LSTM over stroke features (Carbune et al. 2020); the AbelNotes model also reads pen sequences |
| I4 | Fusion of I1/I2 with I3 | Weighted sum of calibrated log-probabilities, with weights tuned on validation writers | Raster and sequence models make different errors |
| I5 | Completion head on I3 | Multi-task outputs: P(complete), and P(extension family) given the strokes so far | Gives the independent completion evidence the auto-insert gate needs |
| I6 | Personal prototypes | Embeddings of your samples used as class prototypes (Snell et al. 2017), with no retraining | Fast adaptation to your handwriting |
| — | Comparators | Symbolizer, only after its author grants permission for the weights; MyScript iink as a commercial native benchmark | Completeness |

**Context-independence:** identity and extension decisions must not use the mathematical context (specification §7.3). A model must never prefer `≤` because it would make the proof correct.

## 8.4 Training

1. **Splits:** split by writer, and for your own data by session date. Never put versions of the same trace on both sides of a split.
2. **Augmentation:**
   - affine transforms and elastic distortion (Simard et al. 2003)
   - speed changes and point jitter
   - for multi-stroke symbols, stroke-order permutations and direction reversal
3. **Training setup:**
   - class-balanced sampling
   - label smoothing 0.1
   - an explicit "unknown" class trained on scribbles and symbols outside the catalogue, using outlier exposure (Hendrycks et al. 2019); also compare energy scores (Liu et al. 2020)
4. **Prefix training for I5:** cut every complete trace at each stroke boundary, and inside strokes at 25%, 50% and 75% of their length. Labels come from the full trace and from your deliberate partials.
5. **Calibration:** temperature scaling on calibration writers (Guo et al. 2017). Automatic-insertion thresholds use Learn-then-Test on identity and completion jointly.
6. **Export:** ONNX int8 through `onnxruntime-web`, an existing dependency, using the Detypify asset pattern: manifest, hashes and licence.

## 8.5 Evaluation and gates

Report these on writer-disjoint real data, following [specification §11.2](https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/docs/implementation/2026-11-21/mobile-math-input.md):

- top-1, top-3 and top-5 on complete glyphs, per symbol, with confusion counts
- **Could become** recall, and the clutter it adds
- premature-insertion rate on partial drawings
- abstention on unknown marks
- time and gestures per symbol compared with the manual catalogue

**Gates:**

- **Candidates-only improvements** ship when they beat I0 on writer-disjoint top-3 and **Could become** recall, with no loss of abstention, and preview latency on the phone is p95 ≤ 100 ms (specification §11.1).
- **Automatic insertion** stays off until the false-insertion rate is below 0.1% at a one-sided 95% bound. That means about 3,000 independent automatic acceptances with zero errors (specification §11.3). Expect this to take months of real use. Until then, explicit selection is the right product.

## 8.6 Phone considerations

- Keep the single-thread WASM worker as the baseline; WebGPU is an optional accelerator only.
- Measure cold readiness, pen-up-to-candidates time and peak memory in the Android WebView build, with the writing-aid models loaded at the same time ([06 §6.4](06-evaluation.md#64-phone-benchmarks)).
