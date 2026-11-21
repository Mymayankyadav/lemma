# 5. Training instructions

## 5.1 Shared setup

1. **Experiment registry.** Each run writes a manifest containing:
   - code commit
   - dataset ids and SHA-256 hashes
   - tokenizer version
   - configuration and seeds
   - hardware and wall time
   - metrics
   - protocol version ([06 §6.1](06-evaluation.md#61-one-protocol-file))
2. **Seeds.** Use one seed for exploration. Any configuration that competes in a phase decision gets three seeds; report the mean and the spread.
3. **Model selection** uses validation replay metrics ([06 §6.2](06-evaluation.md#62-offline-replay-metrics)). Never use the test split, and never perplexity alone.
4. **Compute.** One modern GPU with 24–80 GB covers everything here. T1, T2, L1, R1 and A1 train on a CPU.

## 5.2 Text preparation and tokenizer

1. Normalize to NFC, not NFKC. NFKC maps ℝ to R and turns other math letters into plain letters.
2. Keep TeX spans verbatim, and tag math spans ([02 §2.3](02-datasets.md#23-your-data-d1-d2-the-only-data-that-decides)).
3. For L3, train a SentencePiece unigram tokenizer (Kudo & Richardson 2018):
   - 16,384 pieces, trained on a 50-million-sentence sample of the training mix
   - force these to be single pieces:
     - the 153 catalogue symbols
     - Greek letters
     - common TeX commands
     - the roughly 8,000 most frequent words, so most candidates are one piece
   - enable byte fallback
4. For L4, keep each model's own tokenizer and handle partial words as in [04 §4.7](04-models-and-methods.md#47-phrase-and-scaffold-completion).

## 5.3 Lexicon and error model (T1, T2)

1. **Lexicon:**
   1. Count word forms over the deduplicated training corpus and keep forms seen at least 20 times; tune this cutoff.
   2. Add your words seen twice, and inflections from a morphological list.
   3. Attach log frequencies, and build the protected list ([02 §2.6](02-datasets.md#26-realistic-typing-noise-for-the-correct-task)).
2. **Edit model:** estimate substring edits up to length 3 from D11 with the Brill–Moore alignment. Smooth the estimates and mix them with a keyboard-adjacency prior.
3. **Spatial model:**
   1. Start each key's Gaussian from the key geometry.
   2. Once D2 exists, fit means and covariances from the tap offsets.
   3. Shrink each key towards the global estimate, with a prior worth about 50 taps per key.
4. **Language-model weight:** tune λ in log P(*t* | *c*) + λ · log P(*c* | context) on validation, maximizing correction F0.5.

## 5.4 n-gram model (L1)

1. Build a 4-gram with modified Kneser–Ney smoothing using KenLM on the training mix; also try a 5-gram. The vocabulary is the lexicon plus `<unk>`.
2. Prune to 5–20 MB, by entropy (Stolcke 1998) or by count thresholds. Quantize probabilities and back-off weights to 8 bits.
3. Export to a compact binary table that Lemma's own reader loads: ARPA format converted to sorted arrays. Check that its scores match KenLM's on 10,000 random queries.
4. Add a character 6- or 7-gram model for unseen words.
5. **P1 personal cache:** interpolate with the n-gram model, tuning the weight on your validation period.

## 5.5 CIFG-LSTM (L2)

1. Follow Hard et al. (2018)'s architecture:
   - embedding dimension 96
   - one CIFG layer of 670 units, projected back to 96
   - tied embeddings
   - a vocabulary of 16,000–20,000 math words plus an out-of-vocabulary class
2. Train on the same mix at word level:
   - sequences of 64 words
   - Adam, learning rate 1e-3 with decay
   - dropout 0.1–0.2
   - early stopping on validation top-3 accuracy
3. Finish with a short fine-tuning stage on learner-style text: D7 plus your training period.
4. Export to ONNX, quantize to int8, and check parity against PyTorch.

## 5.6 Small transformer (L3)

| Setting | Starting point |
| --- | --- |
| Architecture | Decoder-only; 6 layers; width 512; 8 heads; MLP 2,048; pre-norm; rotary positions; tied embeddings |
| Vocabulary | 16,384 SentencePiece pieces as in §5.2 |
| Context | 256 tokens |
| Parameters | About 27M: about 19M in the blocks and 8M in embeddings |
| Tokens | 2–5B for pretraining, plus 50–100M for the learner-style stage |
| Optimizer | AdamW; β = (0.9, 0.95); weight decay 0.1; gradient clip 1.0 |
| Learning rate | Peak 1e-3; 1,000–2,000 warm-up steps; cosine decay to 10% |
| Batch | About 0.5M tokens per step |
| Precision | bf16 for training; int8 for export |
| Objectives | Next-token prediction; fill-in-the-middle on 50% of documents; typo noise on 3–5% of context words, with clean targets |
| Seeds | Three for the final configuration |
| Selection | Validation replay metrics: top-1, top-3 and keystroke savings |

**Stages:**

1. **Pretrain** on the public mix for 2–5B tokens. That's far beyond the roughly 0.5B tokens that are compute-optimal for 27M parameters (Hoffmann et al. 2022). Training longer is deliberate: for a deployed model, inference cost matters more than training cost. Small deployed models are routinely trained this long; SmolLM2-135M saw 2T tokens.
2. **Learner-style stage**, 50–100M tokens, with the learning rate going from 3e-4 to 3e-5:
   - Math.SE questions
   - your training text, upweighted 5–10×
   - synthetic learner proofs, at most 20%
3. **Fill-in-the-middle:** apply the prefix-suffix-middle transformation to 50% of documents, using special tokens. Bavarian et al. (2022) found this doesn't hurt left-to-right quality.
4. **Noise:** replace 3–5% of context words with noised versions from §5.3. Targets stay clean.
5. **Evaluate** a checkpoint every 500M tokens using the replay metrics.
6. **Quantize** to dynamic int8 with ONNX Runtime. If top-3 accuracy drops by more than 0.5 percentage points, run quantization-aware training for the last 10% of steps.
7. **Export** with key/value-cache inputs and outputs for incremental decoding, and check parity.

**Compute:** 6 × 27M parameters × 3B tokens ≈ 5 × 10¹⁷ FLOP. That's about 1–3 GPU-hours per run on one data-center GPU at typical utilization (estimate).

## 5.7 Adapting pretrained models (L4)

| Stage | Data | Method | Starting settings |
| --- | --- | --- | --- |
| 1. Domain-adaptive pretraining (Gururangan et al. 2020) | 0.2–1B tokens of math prose (D3–D9), plus about 10% general text to limit forgetting | Full fine-tune up to 360M; LoRA (r = 16, α = 32, dropout 0.05 on attention and MLP projections) for 0.6B and above; QLoRA (Dettmers et al. 2023) if memory-bound | Learning rate 1e-4 (full) or 2e-4 (LoRA), cosine schedule, context 512 |
| 2. Learner-style tuning | D7, your training period, synthetic data at most 20%; fill-in-the-middle; noisy context | Same | Learning rate 5e-5 to 1e-4; 50–100M tokens |
| 3. Distillation (optional) | Teacher soft targets (§5.8) | KL loss | Temperature 2; 50/50 weighting with hard labels |
| 4. Quantization | — | GGUF Q4_K_M and Q8_0 for llama.cpp; ONNX int4 for the web; for Gemma, start from its QAT INT4 checkpoint | Evaluate the quantized file, not the FP16 model |

**Notes:**

- Use base checkpoints and raw-text format, never chat templates.
- If the tokenizer has fill-in-the-middle tokens, use them; otherwise add special tokens.
- After merging adapters and re-quantizing, measure accuracy again. QAT gains can be lost in the merge.

## 5.8 Distillation (L5 → L3 or L4)

1. Run the teacher over 5 million word positions of learner-style text. At each word start, score the top 20 candidate words from T1 and L1, giving a word-level distribution. Working at word level sidesteps mismatched tokenizers. Expect about 5–20 GPU-hours with a 7B teacher.
2. Student loss: 0.5 × cross-entropy on the true word + 0.5 × T² × KL(teacher ‖ student), at temperature T = 2 (Hinton et al. 2015). If the student spreads probability too thinly, try reverse KL (Gu et al. 2024).
3. Keep only distillation targets that pass the learner-choice filter, so the student never learns blocked continuations.

## 5.9 Ranker (R1)

1. **Groups:** one per opportunity (context + typed prefix), labelled 1 for the intended word.
2. **Data:** replays of your training period and of learner-style public text; later, D2 logs.
3. **Settings:**
   - LightGBM with the `lambdarank` objective; metrics NDCG@1 and NDCG@3
   - 31–63 leaves; learning rate 0.05; up to 500 trees with early stopping; at least 50 samples per leaf
   - a monotone constraint so learner-choice risk can only lower scores
4. **Export:** the trees go to a JSON array format evaluated in TypeScript. Parity test: maximum absolute difference of at most 1e-6 over 10,000 groups.
5. **Ablations:** train once each without personal features, without language-model features, and without context features.

## 5.10 Autocorrect decision and certified thresholds (A1)

1. **Model:** the features in [04 §4.6](04-models-and-methods.md#46-automatic-correction-decision), with L2-regularized logistic regression or LightGBM limited to 100 trees.
2. **Calibration:** isotonic or Platt scaling on a separate calibration period. Report a reliability diagram and the expected calibration error.
3. **Learn-then-Test, for each mode:**
   1. Make a grid of thresholds from strict to loose: 0.999, 0.998, … 0.80.
   2. For each threshold λ, count n(λ), the shadow events with probability ≥ λ, and e(λ), how many of them were unwanted.
   3. Compute the p-value for "the false-correction rate exceeds α": the binomial probability of seeing e(λ) or fewer errors in n(λ) trials at rate α.
   4. Test from the strictest threshold to the loosest, continuing while p ≤ δ, and stop at the first failure. Use the loosest threshold that passed.

   With probability at least 1 − δ, that threshold's false-correction rate is at most α (Angelopoulos et al. 2021). This assumes future typing resembles the calibration period.
4. **Starting values:** α = 0.5% for Strict and α = 1% for Balanced, with δ = 0.05. With zero errors, these need at least 598 and 299 events respectively.
5. **Upkeep:** re-certify monthly. If live monitoring's upper bound exceeds α, fall back to suggest-only automatically.
6. **Certify by class.** Pair-level certification would need hundreds of events per pair, so certify classes of typo, for example "transposition in a lexicon word of length ≥ 4 that isn't protected". Your per-pair permission still applies on top.

## 5.11 Personalization (P1–P4)

- **P1:** counts update on the phone; the interpolation weight is re-tuned weekly.
- **P2:** rebuild the datastore weekly from your training text with L3, reducing dimensions to 128 with PCA. Use k = 16 neighbors, and tune the blend weight on the latest validation week.
- **P3:** LoRA with r = 4–8 on L4's attention, for 1–3 epochs over your text. Evaluate prequentially: train through week *t*, test on week *t* + 1. Ship it only if it beats the global model on the next week.
- **P4:** running estimates on the phone with shrinkage, reset by Forget.

## 5.12 Learner-choice classifier (S1)

1. **Input:** the context and the candidate, with its category and rule features.
2. **Model:** a logistic head on L3's hidden state plus the rule features, or a small fine-tuned encoder.
3. **Training data:** the training half of D13, plus synthetic hard negatives from the teacher.
4. **Threshold:** choose the "blocked" threshold by Learn-then-Test, so the leak rate on the calibration half is at most 0.5% at δ = 0.05. The classifier can only remove candidates, never add them.

## 5.13 Packaging

Follow the Detypify pattern: `public/models/writing-aid/<model>-<version>/` with a manifest of:

- files, sizes and SHA-256 hashes
- licence notices
- tokenizer and preprocessing versions
- the data card and evaluation report
- the compatible engine version

At runtime the app should:

1. load assets lazily
2. verify their hashes before use
3. cache them for offline use
4. fall back to the previous layer if anything fails

## 5.14 Compute summary (estimates)

| Item | Hardware | Time per run | Runs |
| --- | --- | --- | --- |
| T1, T2, L1 | CPU | Hours | 2–3 |
| L2 | CPU or GPU | Under 1 GPU-hour | 3–5 |
| L3 | GPU | 1–3 GPU-hours | About 10 |
| L4 adaptation (each; up to 360M parameters on about 0.5B tokens) | GPU | About 3–6 GPU-hours | 5 models |
| Teacher scoring for distillation | GPU | About 5–20 GPU-hours | 1–2 |
| R1, A1, S1 | CPU | Minutes | Weekly |

The whole plan needs roughly 50–150 GPU-hours.

> For the custom Scribe path, [14](14-scribe-free-compute.md) replaces this estimate. The first full model takes about 12–16 GPU-hours of free Kaggle time, then 1–3 GPU-hours a week.
