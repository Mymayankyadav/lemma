# Math writing aid and symbol input: improvement plan

Prepared 21 November 2026 from [PR #1738](https://github.com/Mymayankyadav/lemma/pull/1738) at head `05f297d3`. This is a plan with instructions. It changes no code, flag or data, and it claims no NEXT.md item.

**Update, 21 November (later):** you chose a custom model trained from scratch on math-only data. It uses reinforcement learning and every feedback signal, and trains only on free compute such as Kaggle. Files 11–14 specify it as **Scribe**. Scribe replaces L3; the pretrained models (L4) and pruning become later comparisons.

## Short answer

Better math autocorrect and completion can be built with established, published methods. PR #1738 couldn't show an improvement, and the reasons are measurable. None of them is a lack of capable models.

| Cause | Evidence in PR #1738 |
| --- | --- |
| The engine had almost nothing to suggest from | The runtime lexicon is 41,557 SCOWL spellings plus 1,500 unigrams and 750 bigrams taken from mathlib4 comments. In run 2's Faster phase, 712 of 1,440 intended words never entered the candidate pool, so no ranker could reach them. |
| The test data was not math writing | 576 tasks with only 104 distinct target sentences, averaging 33 characters, such as "I read the question." and "My labels are X and Y. I choose Y." The whole test split is 4,581 characters. |
| The metric couldn't see ranking | Every candidate that matched the target was displayed whatever its rank (377 of 377 steps). Random ranking scored 29.96 WPM; the selected model scored 29.97. |
| The simulated user was assumed, not measured | Acceptance was 75% in one run and 45% in the next, with different tap-cost models, so results across runs can't be compared. |
| The autocorrect evidence came from the generator | All four typo pairs produced identical cold-start counts (246 right, 22 wrong), with the errors at the same template positions. |

Details are in [01-diagnosis.md](01-diagnosis.md).

What works in production keyboards is a pipeline rather than a single model:

1. Decode each tap with a keyboard noise model.
2. Generate candidates from a large domain lexicon.
3. Score them with a language model trained on the right kind of text.
4. Rank them with a learned model that includes personal history.
5. Apply a correction automatically only when a calibrated probability clears a threshold chosen to bound the false-correction rate.

The models involved are small. Gboard shipped a CIFG-LSTM of about 1.4 million parameters for next-word prediction (Hard et al. 2018). Apple's iOS 17 predictive text is a GPT-2-style transformer of roughly 34 million parameters, by a reverse-engineering estimate (Cook 2023). Models of that size fit a Snapdragon 4 Gen 4 phone easily. Sub-billion pretrained models can be adapted to math prose and used wherever the latency budget allows: SmolLM2-135M/360M, Gemma 3 270M, LFM2-350M and Qwen3-0.6B.

One constraint stays on purpose: the aid never supplies a mathematical choice the learner hasn't made (your 21 November specification). That rules out the most impressive-looking LLM behavior, predicting the next proof step. The evidence backs the rule: predictive text measurably steers what people write (Arnold et al. 2020). The gains to expect therefore come from four places:

- finishing words
- decoding typos
- notation shortcuts
- fewer wrong corrections

They don't come from writing the proof for the learner.

## Target pipeline

1. **Tap decoder.** Lemma owns its keyboard, so it can score each tap's position against the nearby keys instead of trusting the nearest key.
2. **Candidate generators.** Five sources:
   - math-lexicon prefix search
   - noisy-channel spelling candidates
   - explicit notation aliases
   - identifiers the learner has already declared
   - scaffolds the learner selects
3. **Learner-choice filter.** The PR's deterministic rules plus a tested classifier. It runs before anything is displayed.
4. **Scorers.** Three tiers:
   - an n-gram model on every keystroke
   - a small neural model once per word start
   - an adapted pretrained model on pauses, if the phone can afford it
5. **Ranker.** Gradient-boosted learning-to-rank over the scorer outputs, personal history and context.
6. **Display policy.** Three stable slots. A list is shown only when its expected benefit beats the attention it costs.
7. **Autocorrect policy.** A calibrated probability, a threshold certified on real shadow-mode logs, and your personal-permission rule.
8. **Logger.** Impressions and outcomes, stored on the device and scoped to the owner, which become the next training and test sets.

## Plan at a glance

| Phase | Work | Exit gate |
| --- | --- | --- |
| 0 | Fix measurement: real-text replay harness, frozen protocol, impression logging, shadow autocorrect | The harness ranks random below the current engine below a perfect ranker on your text |
| 1 | Data: your export and trial logs, public math corpora, typo and notation data, learner-choice test set, ink capture | Data cards, licence register, frozen test splits with hashes |
| 2 | Classical stack: math lexicon, noisy-channel corrector, n-gram model, learning-to-rank | Beats the current engine offline, with no learner-choice regression |
| 3 | Scribe, the custom LaTeX-native model: trained from scratch on free Kaggle GPU time, then benchmarked on the phone (11–14) | Beats Phase 2 offline within the phone's latency and memory budget |
| 4 | Autocorrect and policy learning: certified autocorrect; RL from bandits up to off-policy learning (13) | Statistical certificate on real logs; every new policy passes high-confidence off-policy checks |
| 5 | Human trial on the phone: blinded, randomized sessions | Speed no worse, fewer errors, preferred by you |
| 6 | Ink, in parallel: capture, missing classes, stroke model, completion head | Writer-disjoint gains; automatic insertion only after the specification's 0.1% gate |
| 7 | Personalization loop, monitoring, Harden | Stable metrics for 4 weeks before any flag defaults on |

Checklists are in [10-roadmap.md](10-roadmap.md).

## Rules for every experiment

1. Decide on real math text written by the learner. Synthetic data is for training augmentation and regression tests only.
2. Use one versioned evaluation protocol. A result produced under different assumptions is a different experiment, reported separately.
3. Report ranking (top-1, top-3, MRR), effort (keystroke savings), safety (learner-choice leaks, false corrections) and cost (latency, memory) separately. Never collapse them into one simulated WPM.
4. A metric must tell the candidates apart. Before using it, check that it scores random ranking below the current engine.
5. Held-out means held out. A fix re-tested on the cases that exposed its bug is a regression test, not evidence.
6. Shadow mode comes before automatic changes. Log what autocorrect would have done, and apply it only once the logs certify it.
7. Enforce the learner-choice boundary with deterministic filters and a tested classifier before display, never with a model instruction.
8. Measure on the phone (Snapdragon 4 Gen 4, 6 GB): p95 latency, memory and battery, in the Android WebView build.

## Files

| File | Contents |
| --- | --- |
| [01-diagnosis.md](01-diagnosis.md) | What went wrong in the PR's simulations, and what to keep |
| [02-datasets.md](02-datasets.md) | Data sources, licences, construction, noise models, splits, sample sizes |
| [03-feedback-and-logging.md](03-feedback-and-logging.md) | Events to log, deriving labels, safe randomization, shadow mode, update cadence, privacy |
| [04-models-and-methods.md](04-models-and-methods.md) | Every model and method to test, with descriptions, sizes, licences and evidence |
| [05-training.md](05-training.md) | Training recipes, hyperparameters, certification procedures, packaging, compute |
| [06-evaluation.md](06-evaluation.md) | Protocol, metrics, phone benchmarks, human trial, statistics, decision gates |
| [07-learner-choice-safety.md](07-learner-choice-safety.md) | The boundary rule, taxonomy, enforcement layers, tests |
| [08-handwriting.md](08-handwriting.md) | Symbol recognition: data capture, models, partial-symbol completion, gates |
| [09-owner-suggestions.md](09-owner-suggestions.md) | Each of your suggestions traced in the PR, and what this plan does with it |
| [10-roadmap.md](10-roadmap.md) | Phases, checklists, suggested NEXT.md items, risks |
| [11-scribe-architecture.md](11-scribe-architecture.md) | Scribe: front end, inputs, hybrid backbone, expert mixture, heads, language statistics, feedback, entropy, keystroke pipeline |
| [12-scribe-dataset.md](12-scribe-dataset.md) | Scribe's data: math-only sources, selection, LaTeX normalization, tokenizer, task formats, feedback datasets, storage |
| [13-scribe-rl-and-feedback.md](13-scribe-rl-and-feedback.md) | Reinforcement learning: problem definition, safe exploration, algorithm ladder, safe deployment, the Bayesian ignore update |
| [14-scribe-free-compute.md](14-scribe-free-compute.md) | Training on free GPUs (Kaggle, Colab): budgets, week-one schedule, hyperparameters, session survival, export |
| [15-tutor-signals.md](15-tutor-signals.md) | Signals to request from the tutor LLM, channels, safety rules, eleven ways to plug them into the decoder, crude gain estimates |
| [REFERENCES.md](REFERENCES.md) | Sources |
