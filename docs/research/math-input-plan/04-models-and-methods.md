# 4. Models and methods to test

## 4.1 How the components fit, and when each runs

**The engineering fact that matters most:** while the learner types a word, the text before it doesn't change. A language model can therefore predict that word once, when it starts, and each keystroke only filters the cached prediction. Per-keystroke work becomes a lookup, and the model runs about once per word: every one to two seconds at 30 WPM. This is what makes neural models affordable on a mid-range phone.

| Stage | What to test | When it runs | Budget |
| --- | --- | --- | --- |
| Tap decoding and spelling candidates | T2 noisy channel with spatial model | Every keystroke | Within p95 ≤ 50 ms from keystroke to painted suggestion ([specification §11.1](https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/docs/implementation/2026-11-21/mobile-math-input.md)) |
| Word candidates | T1 math lexicon; N1 notation and declared identifiers | Every keystroke | Same |
| Context scoring | L1 n-gram; L2/L3 neural; L4 pretrained | L1 every keystroke. L2/L3 once per word start, cached. L4 on a pause, or at word start if the phone allows | Word-start step finishes before the next keystroke in at least 95% of words |
| Ranking | R1 learning-to-rank | Every keystroke | Under 1 ms |
| Learner-choice filter | S1 rules + classifier (see 07) | Before display | Under 2 ms |
| Display policy | Expected-value rule ([03 §3.8](03-feedback-and-logging.md#38-deciding-when-to-show-anything)) | Every keystroke | Negligible |
| Automatic correction | A1 | At separators | Under 5 ms |
| Phrase and scaffold completion | F1 constrained decoding | Pause of at least 300 ms | Within 200 ms, the deadline proposed in the PR's [model-options note](https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/docs/ui-plan/2026-11-20/local-input-model-options.md) |

## 4.2 Controls

Every comparison includes these three:

- **C0, the current engine:** the SCOWL lexicon, mathlib4 ranks, the rule lanes, the contextual reward ranker with tutor wording, and the PR's guards.
- **C-off, no assistance:** for human trials and for estimating the cost of displaying suggestions.
- **C-oracle, a perfect ranker:** puts the intended word first whenever it is in the pool. It is the upper bound for ranking work and shows how much is left to gain.

## 4.3 Candidate generation and correction

### T1. Math lexicon and prefix index

- **What it is:** a vocabulary of word forms with frequencies, stored in a compact prefix structure (sorted arrays or a minimal automaton). It covers every form that appears at least about 20 times in the public math corpora ([02 §2.4](02-datasets.md#24-public-corpora-d3d12)), plus every word the learner has typed twice. A separate protected list holds tokens that must never be corrected:
  - abbreviations: iff, wlog, s.t.
  - surnames
  - Greek transliterations
  - TeX commands
  - declared identifiers
- **Size:** about 100,000–200,000 forms; a few MB compressed (estimate).
- **Why:** a ranker can't surface a word the pool lacks. In run 2's Faster phase, 49% of targets were absent. Google reports that unfamiliar vocabulary is a known source of keyboard-model errors (cited in the PR's [keyboard research](https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/docs/ui-plan/2026-11-20/keyboard-research.md)).
- **Test:** oracle pool recall on your text ([06 §6.2](06-evaluation.md#62-offline-replay-metrics)). Expect the largest single gain here.

### T2. Noisy-channel corrector with a spatial model

- **What it is:** for a typed token *t*, it picks the correction *c* that maximizes P(*t* | *c*) × P(*c* | context).
  - P(*t* | *c*) combines two models:
    - learned substring-edit probabilities (Brill & Moore 2000)
    - the likelihood of each tap position under a per-key Gaussian (Goodman et al. 2002; Bi & Zhai 2013), personalized from your own taps as Gboard does with spatial-model personalization
  - Candidates come from a symmetric-delete index up to edit distance 2 (SymSpell, MIT licence), plus expansions to neighboring keys.
  - P(*c* | context) comes from L1–L3.
- **Why:**
  - This is the standard autocorrect formulation (Kernighan, Church & Gale 1990; Brill & Moore 2000) and the basis of production keyboard decoding: Ouyang et al. (2017) describe Gboard's version.
  - Language-model decoding with personalization substantially reduces touchscreen typing errors (Fowler et al. 2015).
  - In observational data from 37,370 typists, autocorrect use was associated with faster typing (Palin et al. 2019).
  - Lemma has an advantage most apps lack: it owns the keyboard, so it sees tap coordinates and not just letters.
- **What it replaces:** the four fixed pairs. Any typo can become a candidate, and certification moves from individual pairs to classes of typo (A1).
- **Fit:** milliseconds in TypeScript; a few MB.

### N1. Notation, scaffolds and declared identifiers

- **Keep** the PR's deterministic alias and scaffold lanes.
- **Add:**
  - language-model disambiguation of ambiguous aliases such as "in", and only inside explicit math spans
  - completion of identifiers the learner already declared in the same answer, triggered only by a typed prefix (for example `f_` → `f_n`)
- Both additions follow [07](07-learner-choice-safety.md).
- **Why:** notation is where math typing on a phone loses the most time, and these completions add no mathematical content of their own.

## 4.4 Language models (context scoring)

### L1. Word n-gram model (KenLM, modified Kneser–Ney)

- **What it is:**
  - a 4-gram (also try 5) with modified Kneser–Ney smoothing (Chen & Goodman 1999), built with KenLM (Heafield 2011)
  - trained on the math corpus plus your training text, then pruned (Stolcke 1998) and quantized to 5–20 MB
  - a character n-gram for unseen words
  - interpolated with a personal cache model (Kuhn & De Mori 1990)
- **Licence:** KenLM is LGPL, but it is used only to build the model. The app reads the exported tables with its own small reader.
- **Why:** it's fast (microseconds per query), easy to interpret and a strong baseline. Gboard decoded with an n-gram model before its LSTM (Ouyang et al. 2017; Hard et al. 2018). L1 shows how much the neural models really add.
- **When to drop it:** never. It remains the fallback while neural models load.

### L2. CIFG-LSTM word model (about 1.4M parameters)

- **What it is:** the architecture Gboard shipped for next-word prediction (Hard et al. 2018).
  - one coupled input-and-forget-gate (CIFG) LSTM layer of 670 units
  - tied input and output embeddings
  - about 1.4M parameters with a 10,000-word vocabulary; Gboard's quantized model was about 1.4 MB
  - Lemma's version would use a vocabulary of 16,000–20,000 math words, about 2–2.5M parameters.
- **Why:** it is proven on phones, and in Gboard it beat the n-gram baseline on top-1 and top-3 recall (Hard et al. 2018). It costs a few million multiply-adds per word.
- **How it's used:** it runs once per word start. Each keystroke filters the cached distribution by the typed prefix and by T2's fuzzy matches.
- **Runtime:** ONNX through `onnxruntime-web`, which Lemma already depends on.

### L3. Small transformer trained from scratch (about 27M parameters)

- **What it is:** a decoder-only transformer with 6 layers, width 512, 8 heads and a 256-token context. Its 16,000-piece vocabulary makes frequent words single pieces, and also every catalogue symbol, Greek letter and common TeX command. Embeddings are tied. Total: about 27M parameters ([05 §5.6](05-training.md#56-small-transformer-l3)).
- **Precedent:** Apple's iOS 17 predictive text is a GPT-2-style model that runs as the user types. Reverse engineering estimates about 34M parameters, a 15,000-token vocabulary and 6 decoder blocks (Cook 2023, as reported by Willison 2024).
- **Why:**
  - it uses a longer context than an LSTM: the whole current proof line and the one before it
  - fill-in-the-middle training lets it also work when the caret is inside a draft (Bavarian et al. 2022)
  - training on typo-noised context keeps it robust to the learner's own uncorrected typos
- **Fit on the phone:**
  - about 27 MB at int8
  - one decoding step is about 27M multiply-adds; it runs once per word start with an incremental key/value cache
  - the full 256-token prefill (about 14 GFLOP) runs in the background when a composer opens, while L1 covers the gap
- **Runtime:** `onnxruntime-web` (existing dependency), with single-thread WASM as the baseline and WebGPU optional.

### L4. Pretrained sub-billion models adapted to math prose

**Role:**

- Rerank up to 20 already-approved candidates at a word start or after a pause.
- Propose short wording continuations under constrained decoding (F1).
- Never per keystroke, unless phone measurements show p95 ≤ 50 ms.
- Never unconstrained generation.

| Model | Size | Licence | Why it's on the list | Watch for |
| --- | --- | --- | --- | --- |
| SmolLM2-135M (base) | 135M | Apache 2.0 | Smallest credible pretrained model; its training mix included FineMath (Allal et al. 2025); ONNX and GGUF exports exist | Weaker long-tail vocabulary |
| SmolLM2-360M (base) | 360M | Apache 2.0 | Same family with more capacity; a 256-token FP16 key/value cache is about 10 MiB (the PR's calculation) | 273 MB as q4f16 ONNX |
| Gemma 3 270M | 270M (170M embedding, 100M transformer) | Gemma terms: use restrictions and redistribution conditions | 256k vocabulary handles rare tokens; built for task fine-tuning; quantization-aware INT4 checkpoints (Google 2025) | Large output layer per step; 249 MB INT4 web file |
| LFM2-350M | 350M; 10 short-convolution + 6 attention layers | LFM Open License v1.0: based on Apache 2.0, with commercial rights only below US$10M annual revenue | Designed by hardware-in-the-loop search for edge CPU latency (Liquid AI 2025) | Fine for a personal app; re-check before any company use |
| Qwen3-0.6B (base) | 0.6B | Apache 2.0 | Upper bound for the web path; same family as the Qwen GGUFs you supplied | 570 MB as q4f16 ONNX; memory pressure on 6 GB |
| MobileLLM-R1-140M / 360M | 140M / 360M | FAIR Noncommercial Research License | Strongest published sub-billion math results: R1-360M more than doubles Gemma-3-270M-pt and SmolLM2-360M on MATH500 and GSM8K (Meta AI 2025) | Research comparison only. A model tuned for reasoning isn't necessarily better at predicting the next prose word. |

**How to adapt them:** domain-adaptive continued pretraining on math prose, then learner-style tuning with fill-in-the-middle and noisy context. Use LoRA or full fine-tuning, quantize, and evaluate the quantized file ([05 §5.7](05-training.md#57-adapting-pretrained-models-l4)). Use base checkpoints with raw text, not chat templates.

**Runtime options:**

- **Web:** `onnxruntime-web`, an existing dependency.
- **Native:** llama.cpp (GGUF, MIT) or LiteRT-LM (Apache 2.0) through a Capacitor plugin. Either one is a new native dependency.

Google's published LiteRT-LM figure for Qwen2.5-0.5B is 251 prefill and 30 decode tokens per second on a Galaxy S24 Ultra CPU, which is a flagship. The Snapdragon 4 Gen 4 will be slower: Qualcomm lists two performance cores up to 2.3 GHz and six efficiency cores up to 2.0 GHz, and third-party spec sites report Cortex-A78/A55 cores with an Adreno 613 GPU. Measure it on the phone.

**When to drop one:** if it shows no offline gain over L3 + R1 on your text, or misses the phone's latency or memory budget.

### L5. Teacher models (offline only)

- **What:** a strong model run on a computer or through an API, for example Qwen2.5-Math-7B or a frontier model.
- **Uses:**
  - soft targets for distillation ([05 §5.8](05-training.md#58-distillation-l5--l3-or-l4))
  - pre-labelling the learner-choice set against a rubric, validated against your own labels
  - generating learner-style training text for your courses (training only)
- **Never** shipped, and never called while typing: [specification §4.4](https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/docs/implementation/2026-11-21/mobile-math-input.md) says no cloud call may block typing.

## 4.5 Ranking and personalization

### R1. Learning-to-rank (LambdaMART via LightGBM)

- **What it is:** gradient-boosted trees trained to order candidates (Burges 2010; Ke et al. 2017), with labels built as in [03 §3.3](03-feedback-and-logging.md#33-turning-logs-into-labels).
- **Features:**

  | Group | Features |
  | --- | --- |
  | Language-model scores | L1, L2/L3, and L4 when available; entropy of the language-model distribution |
  | Typing | Prefix length; characters still to type; fuzzy-match edit cost; keyboard-distance cost; noisy-channel posterior |
  | Lexical | Math-corpus frequency; English frequency; length; word family; math-term and function-word flags |
  | Personal | Your frequency with decay; recency; past accepts and rejects; kept spellings; the PR's reward-learner score |
  | Context | Appears earlier in the learner's answer; appears in the tutor's question (allowed only for completing a word already started, specification §4.3); appears in the tutor's suggested wording |
  | Policy | Category; rule id; learner-choice risk, constrained so it can only lower a candidate's score |

- **Size and speed:** a few hundred trees; well under a millisecond for 20 candidates in TypeScript.
- **Why:** it combines mixed kinds of evidence better than a hand-weighted sum, it is standard in production ranking, and it replaces hand-set reward magnitudes with fitted ones.

### P1–P4. Personalization

- **P1, cache model:** your unigram and bigram counts with a 30-day half-life, interpolated with L1 (Kuhn & De Mori 1990). Cheap, and strong for terminology you repeat.
- **P2, kNN-LM:** store pairs of (L3 hidden state at a word start → next word) from your text. At prediction time, blend the nearest neighbors' words with the model's distribution (Khandelwal et al. 2020). It adapts without retraining. Cap it at about 50,000 entries, with reduced dimensions.
- **P3, personal adapter:** a small LoRA adapter (Hu et al. 2021) for L4, or a last-layer fine-tune for L3. Trained weekly on your computer and shipped as a versioned asset.
- **P4, spatial model:** per-key tap offset and spread, updated on the phone and pulled towards the global model until enough of your taps exist (Gboard's spatial-model personalization).

## 4.6 Automatic correction decision

### A1. Calibrated classifier with a certified threshold

- **What it is:** logistic regression or a small tree model that predicts P(learner wants *t*→*c*).
- **Features:**
  - noisy-channel posterior
  - language-model ratio of *c* to *t*
  - whether *t* is a lexicon word, in your personal vocabulary, or protected
  - math-span flag and capitalization
  - edit type and keyboard distance
  - the pair's personal history
  - mode
- **Calibration and threshold:** calibrate the probabilities (Guo et al. 2017). Choose each mode's threshold with Learn-then-Test on shadow-mode logs, so the false-correction rate stays below α with probability 1 − δ (Angelopoulos et al. 2021). The procedure is in [05 §5.10](05-training.md#510-autocorrect-decision-and-certified-thresholds-a1).
- **Plus your rule:** a pair is corrected automatically only when the certified threshold passes **and** the learner has granted permission for that pair, either by two explicit acceptances or with "Always correct this".
- **Why:** it gives a guarantee on real data instead of a synthetic cohort, extends beyond four pairs, and keeps your consent model.

## 4.7 Phrase and scaffold completion

### F1. Constrained decoding

- **What it is:** L3 or L4 proposes at most a few words, and only inside an approved grammar:
  - scaffolds the learner selected
  - neutral communication phrases

  Every mathematical slot stays empty (□). Implement it with grammar- or regex-constrained decoding: llama.cpp grammars natively, or the approach of Willard and Louf (2023).
- **Partial words:** when the caret is inside a word, don't feed the partial word to a subword model as it stands. The "partial token problem" can cut accuracy by 60–95% (Xu et al. 2026). Instead, either:
  - back off to the last complete word and score whole candidate words, or
  - constrain generation to match the typed characters (Athiwaratkun et al. 2024; Vieira et al. 2024).

## 4.8 Methods catalogue

| Method | What it does | Evidence | Used in |
| --- | --- | --- | --- |
| M1 Tap decoding | Treat each tap as uncertain; combine it with the language model | Goodman et al. 2002; Bi & Zhai 2013; Fowler et al. 2015 | T2 |
| M2 Noisy channel | Typo correction as P(typed \| intended) × P(intended \| context) | Kernighan et al. 1990; Brill & Moore 2000 | T2 |
| M3 Domain-adaptive pretraining | Continue pretraining on in-domain text | Gururangan et al. 2020 | L4 |
| M4 Fill-in-the-middle | Train the model to complete text that has a suffix | Bavarian et al. 2022 | L3, L4 |
| M5 Noise augmentation | Typos in the context, clean targets | Validate by ablation (06) | L2–L4 |
| M6 Distillation | A small student learns a teacher's distribution | Hinton et al. 2015; Kim & Rush 2016; Gu et al. 2024 | L3, L4 |
| M7 Learning-to-rank | Fitted combination of evidence | Burges 2010; Ke et al. 2017 | R1 |
| M8 Calibration and risk control | Thresholds with statistical guarantees | Guo et al. 2017; Angelopoulos et al. 2021 | A1, S1, ink |
| M9 Shadow mode | Log decisions before acting on them | Staged-rollout practice | A1 |
| M10 Micro-randomization | Within-person causal effects | Klasnja et al. 2015 | 03 §3.4 |
| M11 Position-bias correction | Unbiased learning from slot behavior | Joachims et al. 2017; Agarwal et al. 2019 | Display policy |
| M12 Personalization | Cache, kNN-LM, adapters, spatial model | Kuhn & De Mori 1990; Khandelwal et al. 2020; Hu et al. 2021 | P1–P4 |
| M13 Constrained decoding | Output limited to a grammar | Willard & Louf 2023 | F1 |
| M14 Token-boundary handling | Correct scoring of partial words | Xu et al. 2026; Athiwaratkun et al. 2024 | L4, F1 |
| M15 Quantization-aware training | Keeps accuracy at int4 and int8 | Gemma 3's QAT checkpoints | L3, L4 |
| M16 Word-start caching and speculative compute | Run models between keystrokes | About 400 ms between keys at 30 WPM | All language models |

## 4.9 Fitting the Snapdragon 4 Gen 4 (6 GB)

| Model | Weights on the phone | Multiply-adds per decoding step | Where it can run |
| --- | --- | --- | --- |
| L2 | About 2 MB, int8 | About 2.5M | Web, every word start |
| L3 | About 27 MB, int8 | About 27M | Web, every word start |
| SmolLM2-135M | 118 MB as q4f16 ONNX (PR table) | About 135M | Web or native; word start or pause |
| Gemma 3 270M | 249 MB INT4 web file | About 270M, most of it in the output layer | Native preferred |
| SmolLM2-360M / LFM2-350M | Roughly 200–300 MB at 4-bit | About 350M | Native; pauses only |
| Qwen3-0.6B | 570 MB as q4f16 ONNX | About 600M | Native; pauses only; may not fit alongside the WebView |

**Estimating before measuring:**

- One decoding step reads every weight once, so it takes at least (weight bytes ÷ sustained memory bandwidth). Measure the bandwidth on the phone with a copy benchmark and divide. Real runtimes, especially in WASM, are usually several times slower than this bound.
- Prefill costs about 2 × parameters × tokens FLOPs, so keep L4's context to about 64 tokens and prefill in the background.
- Android may kill a backgrounded app under memory pressure. Measure peak memory with the drawing recognizer and an active chat loaded, as the PR advised.

The measurement protocol is in [06 §6.4](06-evaluation.md#64-phone-benchmarks).

## 4.10 What not to do

- **No unconstrained LLM completion in the composer:** it writes mathematics. The PR's Qwen probe repeated proof content and completed a logic claim the learner hadn't typed.
- **No cloud inference in the typing loop** (specification §4.4).
- **No Chrome built-in Prompt API:** it doesn't support Android (the PR's research).
- **No federated learning:** there is one learner and nothing to federate. Local personalization is enough.
- **No models above about 1B parameters for typing on the phone.**
- **No choosing between models by simulated WPM.**

## 4.11 Experiment matrix

| ID | Comparison | Question | Data | Primary metric |
| --- | --- | --- | --- | --- |
| E1 | C0 vs C0 + T1 | Does a math lexicon raise the ceiling? | D1 test replay | Oracle pool recall |
| E2 | T2 vs C0's spelling lane | Is typo correction better? | Noisy replay (02 §2.6), later D2 | Correction F0.5; false corrections per 1,000 words |
| E3 | L1 vs L2 vs L3, each with T1 and T2 | Which scorer? | D1/D2 test | Top-1/top-3 at prefix lengths 1–3; keystroke savings |
| E4 | Best of E3 + R1 vs best of E3 | Does fitted ranking help? | Same | Top-1; MRR |
| E5 | L4 variants as word-start or pause reranker | Do pretrained models add anything? | Same, plus phone benchmarks | Top-1 gain vs latency and memory |
| E6 | With P1–P3 vs without | Does personalization help? | Chronological test on your data | Top-1 on the latest weeks |
| E7 | A1 vs the PR's four-pair rule | Which autocorrect? | Shadow logs | Coverage at the certified false-correction rate |
| E8 | F1 vs the PR's ghost lane | Wording continuation | D1 + D13 | Precision of accepted continuations; zero leaks |
| E9 | Best stack vs C0 vs Off, on the phone | Is there a real benefit? | Human trial | WPM, errors, preference |
