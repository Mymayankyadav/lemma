# 14. Training Scribe on free compute

## 14.1 What's available

Providers change these terms, so check your own accounts.

| Provider | GPU | Quota | Session | Notes |
| --- | --- | --- | --- | --- |
| Kaggle notebooks | 2 × T4 (16 GB each), or 1 × P100 | About 30 GPU-hours a week, shown in your account | 12 h | Runs continue in the background after "Save Version"; 20 GB of saved output; a separate TPU quota (reported as about 20 h a week, 9 h sessions); GPU and internet need phone verification |
| Google Colab (free) | Usually a T4 | Not published; varies | Up to about 12 h, with idle disconnects | A GPU isn't guaranteed at busy times |
| SageMaker Studio Lab | T4 | 4 GPU-hours per 24 h | 4 h | Closed to new customers |
| Lightning AI | Various | Free tier changed in 2026; check | — | Not relied on |
| Google TPU Research Cloud | TPU | Free, by application | — | Worth applying for; needs JAX or PyTorch/XLA |

Plan around Kaggle. About 30 GPU-hours a week covers everything in this file.

## 14.2 Throughput and budgets

**Hardware notes:**

- **Precision.** A T4 has fp16 tensor cores but no bf16, so train with fp16 mixed precision and dynamic loss scaling.
  - Keep norms, logits and the loss in fp32.
  - Add a z-loss of 1e-4 on the logits (Chowdhery et al. 2022), plus QK-norm, for stability.
- **Attention.** Use PyTorch's built-in scaled-dot-product attention; its memory-efficient kernel runs on a T4. FlashAttention-2 needs newer GPUs.
- **Both GPUs.** Use both T4s with data-parallel training, one process per GPU.
- **P100.** It has no tensor cores, so prefer 2 × T4.

**Cost estimate:** training costs about 6 × parameters × tokens FLOPs. Assume 10–20 TFLOP/s effective per T4 at these small widths, and measure the real figure in the pilot run.

| Model | FLOPs per token | 1B tokens on 2 × T4 |
| --- | --- | --- |
| Scribe-S (13M) | About 0.08 GFLOP | About 0.5–1 h |
| Scribe-M (32M) | About 0.19 GFLOP | About 1.3–2.7 h |
| Scribe-L (65M) | About 0.39 GFLOP | About 2.7–5.4 h |

## 14.3 Week-one schedule (about 12–16 GPU-hours)

| Run | Model | Tokens | GPU-hours | Purpose |
| --- | --- | --- | --- | --- |
| Pilot | Scribe-S | 0.1B | 0.3 | Measure throughput; check the loss curve and the data loader |
| Learning-rate sweep | Scribe-S | 3 × 0.1B | 1 | Pick the learning rate, then transfer it to M with μP-style scaling (Yang et al. 2022) |
| Main | Scribe-M | 2B | 3–6 | The candidate model |
| Fallback | Scribe-S | 1.5B | 1–1.5 | In case M is too slow on the phone |
| Tasks stage | Scribe-M | 0.2B | 0.5 | Learner-style data, fill-in-the-middle, noise, conversion, your data upweighted |
| Heads | Scribe-M (frozen) + heads | — | 0.5 | Train H2–H6 |
| Ablations | Scribe-M | 2 × 0.5B | 1.5–3 | For example, 0% vs 5% general English, and hybrid vs plain transformer |

- **Optional, week two:** Scribe-L on 1.5B tokens (4–8 h), if the phone's budget allows it.
- **Ongoing:** 1–3 GPU-hours a week for KTO and DPO rounds and personal adapters. Bandit and off-policy learning run on a CPU.

## 14.4 Hyperparameters

| Setting | S | M | L |
| --- | --- | --- | --- |
| Batch (tokens) | 256k | 256k–512k | 512k |
| Peak learning rate (AdamW, β = 0.9 / 0.95, weight decay 0.1) | 2e-3 | 1.5e-3 | 1e-3 |
| Warm-up | 1,000 steps | 1,000 steps | 1,500 steps |
| Schedule | Warmup–stable–decay: hold the peak, then decay over the last 15% (Hu et al. 2024) | Same | Same |
| Sequence length | 512 | 512 | 512 |
| Gradient clipping | 1.0 | 1.0 | 1.0 |

**Loss weights:**

| Loss | Weight |
| --- | --- |
| Language model (fill-in-the-middle included) | 1.0 |
| Completion and tap decoding | 0.5 |
| Structure, keyboard page and mode | 0.1 each |

As an alternative, learn the weights with uncertainty weighting (Kendall et al. 2018).

The warmup–stable–decay schedule suits sessions that can be cut off. The stable phase continues across sessions, and you can branch a short decay off any checkpoint to evaluate it.

## 14.5 Surviving session limits

- **Checkpoint** every 15–20 minutes: model, optimizer, loss scaler, data position and random-number state. Keep the last two.
- **Save** at the end of each session, either as a Kaggle Dataset version or to a private Hugging Face repository. The next session resumes from there.
- **Run in the background,** so closing the browser doesn't stop training.
- **Make data order a function of seed and step,** so a resumed run continues exactly where it stopped.
- **Evaluate every 30 minutes** on your validation split:
  - bits per character, for prose and math separately
  - command top-3 accuracy at prefix lengths 1–3
  - accuracy at closing open structures
  - the KaTeX-valid rate of sampled continuations

## 14.6 Optional: TPU for a teacher

If Kaggle TPU time or a TPU Research Cloud grant is available, and you're comfortable with JAX:

1. Train Scribe-Teacher, about 100–150M parameters, on the same data.
2. Distill it into Scribe-M, using soft targets on math spans ([05 §5.8](05-training.md#58-distillation-l5--l3-or-l4)).

This keeps to "no pretrained data" while still getting the benefits of distillation. Skip it if the setup would take more than a week.

## 14.7 Pruning a pretrained model (later comparison)

Width pruning plus distillation can shrink a pretrained math model a great deal (Minitron: Muralidharan et al. 2024). Two things count against it here:

- The teacher's forward passes alone would use much of a week's free quota.
- It brings back the pretrained data you chose to avoid.

Keep it as a later benchmark against Scribe.

## 14.8 Export and phone check

1. **Export to ONNX,** with the streaming state (convolution caches and the attention key/value cache) as explicit inputs and outputs. A causal depthwise convolution exports as a standard Conv.
2. **Quantize** with dynamic int8, then run a parity test against PyTorch on 10,000 positions.
3. **Measure on your phone** with `onnxruntime-web`, which Lemma already depends on ([06 §6.4](06-evaluation.md#64-phone-benchmarks)):
   - token-boundary step, p50 and p95
   - keystroke-to-paint, p95
   - memory
   - battery
4. **Choose the largest size that passes G4,** and ship it as a pinned asset ([05 §5.13](05-training.md#513-packaging)).

## 14.9 What this replaces

For the custom path, this file replaces the estimate of 50–150 GPU-hours in 05 §5.14. The first full Scribe takes about 12–16 GPU-hours, then 1–3 a week.
