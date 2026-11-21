# Tutor-context writing-aid experiment

The owner's Android trial exposed a missing `jok` completion and repetitive article suggestions. The updated trial fixes these cases and includes matched comparisons with the first APK. [Phone trial results](PHONE-TRIAL.md)

The validation-selected configuration is **tutor-wording**: the existing contextual reward ranker with tutor wording enabled and tutor term/symbol options disabled. The selection was frozen before the main held-out trajectory replay. In validation it scored 30.139 modeled WPM at 40 ms attention per new list; all-on scored 30.133, inside the preregistered 0.10-WPM tie band. The selector chose the smaller observed state. The difference is tiny and does not establish that disabling term or symbol support helps people.

The 24-candidate table ran every ranker on the same engine revision. Enabling tutor wording produced the same recorded test trajectories as disabling it in that engine. A separate replay of the actual previous app revision found a Balanced tie on these tasks and a drop on the longer proof passages. [Frozen-version comparison](VERSION-COMPARISON.md)

On 144 synthetic held-out tasks from 12 new profiles, the selected configuration scored 29.97 modeled WPM versus 29.48 for matched manual spelling recovery. The paired user bootstrap difference was 0.49 WPM (95% interval 0.20 to 0.87). At 0/40/100 ms per new list, selected-model estimates were 31.05/29.97/28.48 WPM. These values are simulated sensitivity estimates, not observed human or device speed.

## All 24 candidates

The first six are controls or earlier online rankers, the next twelve are source/option or ranking variants, and the final six are independently trained CPU scorers. They are not 24 foundation models. The table reports every candidate on the held-out set without reselecting.

| Candidate | Validation WPM | Test WPM | Test flagged unsafe | Test intent-matching drafts | Estimated state bytes | Host p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| off | 29.50 | 29.48 | 0 | 144/144 | 57 | — |
| random | 29.92 | 29.96 | 0 | 144/144 | 9675 | 0.60 |
| static | 29.87 | 29.97 | 0 | 144/144 | 9793 | 0.60 |
| frequency | 29.87 | 29.97 | 0 | 144/144 | 9812 | 0.40 |
| contextual | 29.87 | 29.97 | 0 | 144/144 | 9816 | 0.40 |
| online-rank4 | 29.83 | 29.94 | 0 | 144/144 | 14009 | 0.40 |
| tutor-none | 29.87 | 29.97 | 0 | 144/144 | 9816 | 0.30 |
| tutor-terms | 29.86 | 29.99 | 0 | 144/144 | 9731 | 0.30 |
| tutor-wording | 30.14 | 29.97 | 0 | 144/144 | 9816 | 0.30 |
| tutor-symbols | 29.87 | 29.97 | 0 | 144/144 | 9816 | 0.30 |
| tutor-terms-wording | 30.13 | 29.99 | 0 | 144/144 | 9731 | 0.40 |
| tutor-terms-symbols | 29.86 | 29.99 | 0 | 144/144 | 9731 | 0.40 |
| tutor-wording-symbols | 30.14 | 29.97 | 0 | 144/144 | 9816 | 0.40 |
| tutor-all | 30.13 | 29.99 | 0 | 144/144 | 9731 | 0.30 |
| tutor-prompt-first | 30.13 | 29.99 | 0 | 144/144 | 9731 | 0.40 |
| tutor-given-first | 30.13 | 29.99 | 0 | 144/144 | 9731 | 0.70 |
| tutor-repeat | 30.13 | 29.99 | 0 | 144/144 | 9731 | 0.40 |
| tutor-learner | 30.13 | 29.99 | 0 | 144/144 | 9731 | 0.40 |
| linear | 30.13 | 29.99 | 0 | 144/144 | 10425 | 0.40 |
| pairwise-linear | 30.13 | 29.99 | 0 | 144/144 | 10430 | 0.40 |
| mlp16 | 30.13 | 29.99 | 0 | 144/144 | 21055 | 0.40 |
| mlp64 | 30.13 | 29.99 | 0 | 144/144 | 55073 | 0.30 |
| factor4 | 30.13 | 29.99 | 0 | 144/144 | 15721 | 0.30 |
| factor8 | 30.13 | 29.99 | 0 | 144/144 | 21055 | 0.50 |

The source-pool and selection timing is from warm Chromium on this host, excludes rendering and Android latency, and uses a development-machine clock with coarse resolution. State bytes are the serialized JavaScript state plus portable scorer weights, not peak process memory. The no-aid control does not allocate this model in the product. The low-rank scorers are small ranking models trained on fixed features, not LoRA on a foundation model.

## Chronological replay and its limits

The fixture has 144 train, 144 calibration, 144 validation, and 144 test tasks. The partitions have different synthetic users, proof-family IDs and template wording. The calendar labels are **not strictly disjoint**: adjacent ranges overlap by two days (train 0–11, calibration 10–21, validation 20–31, test 30–41). Users and model state are separate across partitions, but this is not a calendar-held-out result. Tutor prompt/given material, suggested wording, hints, proof/solution text, variable inventories, absent metadata, incorrect labels, and malformed payloads are separate inputs. The tutor payload is normalized by the actual runtime. Candidate generation receives the current cursor, learner anchor, and bounded tutor context at every typed character; it never receives the intended future text. Accepted completions preserve the continuation anchor and are not counted as newly typed evidence.

The simulated learner recognizes which displayed choice fits their intended continuation, accepts it with a 45% per-opportunity probability, may request alternatives on a miss, and has a 3% wrong-tap draw when alternatives exist. Most wrong taps are undone. This is a strong oracle-like user assumption; matching events are reported separately from actual accepts. A refresh and every acceptance update the local reward model; other visible choices receive alternate feedback. Direct typing can produce the runtime’s delayed match/divergence and personal-use signals. Declined edits stay excluded for their occurrence. Source and selection gates, not the truth labels, decide what can be shown.

The base model is 400 ms per directly typed character and 300 ms per tap. Spelling cases have the same mistyped input and manual repair in the no-aid control. Notation cases use a best-case direct-symbol manual baseline with one keyboard-switch tap; a failed alias conversion pays backspaces and symbol entry. Symbol lookup time is not modeled. Ignored lists are counted separately from displayed-list attention. Invalid proof claims remain the learner’s intended text; truth is an audit label, not a training reward.

| Stage | Selected WPM at 40 ms | Manual control WPM | Paired difference (95% user bootstrap) |
| --- | ---: | ---: | ---: |
| cold | 33.66 | 30.00 | 3.66 (2.40 to 5.25) |
| regular | 28.75 | 29.32 | -0.57 (-0.90 to -0.23) |
| shifted | 30.15 | 29.48 | 0.67 (0.21 to 1.17) |

Stages contain different task types, so their WPM values are not a causal learning curve. The paired comparison within a stage uses the same tasks. Twelve profiles and repeated synthetic templates make the intervals illustrative rather than population estimates.

A separate matched validation diagnostic compared retained per-user reward state with a fresh state at each task, using the same tasks and deterministic behavior. Both produced 30.14 WPM at 40 ms attention, with identical recorded behavior. This fixture therefore showed **no incremental benefit from persistence**; the earlier target-informed opportunity experiment is not directly comparable. [Matched learning diagnostic](learning-curve.json)

A separate validation-only, all-manual provenance diagnostic found 105 source-backed visible ghost events across 5 of 144 tasks for wording-only; all 105 followed the same authored suggested-wording pattern and matched its simulated intent. All-on had those 105 ghost events plus five source-backed word events. These are repeated prefix opportunities, not 105 independent people or observed accepts. The sealed test trace did not record tutor provenance for each acceptance, so it cannot establish how often a tutor-sourced suggestion was actually accepted. [Provenance diagnostic](provenance.json)

## Four surfaces and safety

The following is a post-fix regression on previously exposed test cases, not an additional held-out trial.

| Surface | Displayed | Accepts | Manual characters before accepts | Typed word-like units before accepts | Net added characters | Acceptance taps | Refreshes | Ignored surface lists | Recovery seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| word | 3037 | 143 | 2165 | 538 | 428 | 143 | 128 | 1260 | 1.0 |
| ghost | 42 | 6 | 28 | 12 | 44 | 6 | 3 | 32 | 0.0 |
| correction | 12 | 4 | 60 | 12 | 0 | 4 | 0 | 8 | 19.2 |
| replace | 95 | 8 | 56 | 16 | 0 | 8 | 5 | 54 | 7.6 |

The selected test replay had 135 refreshes, 1597 shown lists, 1322 ignored lists, and 27.80 modeled recovery seconds overall. A simultaneous refresh or ignored list can count for more than one visible surface, so the surface totals need not equal these global counts. Net added characters can be zero for a shortening replacement; word-like units are whitespace units, not LLM tokens. The whole eligible pool contained a target-matching offer at 377 observed steps; 377 visible steps matched. Those counts are not acceptance rates. [Surface-detail regression](surface-detail.json)

All 24 deliberately incorrect proof drafts matched their intended text in this run. There were 1 wrong accepts, 0 retained wrong accepts, 0 flagged source/logic/variable exposures, and 0 wrong accepted logic candidates. The audit covers annotated sources, X/Y/Z and a bounded set of branch/method patterns; it is not a proof verifier and zero observed failures is not a safety guarantee.

The same selected configuration in Strict recorded 0 flagged exposures. In Faster typing it recorded 48: sampled cases offered `because` after only `b` while the intended word was `believe`. None was accepted as a wrong logic candidate in this seed. The Faster result is a concrete weak-prefix risk; it is not evidence that a full proof was generated.

A targeted connector guard was then added. A post-fix **regression on the previously exposed test tasks**, not a new held-out trial, reduced Faster flagged exposures from 48 to 0; all 24 Balanced aggregate behavior results stayed identical. The original validation selection was not changed. A separate fresh synthetic prefix stress corpus had 546 steps per mode and found 0 weak connectors, 0 untyped X/Y/Z suggestions, and 0 solution-role leaks in Faster; Balanced and Strict were also zero. `I becaus` still produced `because` in Balanced and Faster, while Strict abstained. This small targeted check does not establish universal safety. [Pre-fix engine](tested-engine-pre-fix.ts) · [Regression](regression.json) · [Fresh stress](fresh-connectors.json)

In separate **development** hard-negative probes, raw prefix copying would have exposed 15/15 validation and 18/18 other adversarial continuations. The actual runtime exposed 0 and 0, respectively, with no measured output-budget violation. These direct probes were inspected before model selection and are not sealed test evidence. [Details](adversarial-safety.json)

## Conditional autocorrection

The strict global cold-start probe failed every class: each had 246 intended corrections and 22 unintended ones among 268 eligible synthetic calibration examples, giving a 95% Wilson lower bound of 87.9%. The smaller history-development cohort also failed the 98% lower-bound rule. Its point estimates and wider intervals can be consistent with the larger cohort; neither represents real users.

A separate preregistered expanded cohort used 1,200 fresh synthetic profiles per class in each calibration and test split, with 40 context families and modeled preference shifts. It fixed k=2 same-pair explicit manual accepts with no intervening undo, dismissal, or partial edit. All four classes passed the synthetic calibration rule. The implementation uses this conditional policy for the owner-requested experimental trial; global cold autocorrection remains closed. Any negative feedback revokes trust, and automatic outcomes do not earn it. Synthetic qualification is not evidence of human precision or authorization for a production release.

| Pair | Calibration correct / eligible | Calibration Wilson lower | Held-out correct / eligible | Held-out Wilson lower | Held-out coverage | Whole-population harm |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| teh->the | 727/730 | 98.80% | 754/755 | 99.25% | 62.9% | 1/1200 |
| recieve->receive | 745/745 | 99.49% | 724/725 | 99.22% | 60.4% | 1/1200 |
| recieved->received | 730/732 | 99.01% | 755/758 | 98.84% | 63.2% | 3/1200 |
| seperate->separate | 762/764 | 99.05% | 756/757 | 99.26% | 63.1% | 1/1200 |

The [family-cluster bootstrap intervals, shift counts, and full-population baselines](personal-results.json) are reported alongside Wilson bounds. The [three-occurrence cost sensitivity](personal-cost.json) charges the two required cold manual accepts and assumes a one-second undo for each later mistake; it is not a complete session or observed user behavior.

## Larger models and reproducibility

Six independent fixed-feature models were trained on CPU: pointwise linear, pairwise linear, two MLP sizes, and rank-4/rank-8 factor scorers. Training used only the training partition; validation chose among the 24 configurations. Their actual weights and training sizes are in [models.json](models.json) and [models.pt](models.pt). No future test vocabulary was used to allocate their fixed features.

The local Qwen 0.5B and 1.5B Q4 GGUFs were also run on six exploratory prompts each, separately from the main ranking trial. Raw 0.5B output repeated answer/proof content and completed an untyped logic claim; 1.5B also repeated a proof step. These are ungated outputs from a tiny non-blind probe, not an accuracy comparison or a candidate for automatic insertion. [Raw outputs and native token counts](large-model-probe.json)

The current runtime admits at most 12 tutor fragments of 240 characters each, up to 16 variables/symbols per fragment, and up to six words / 64 characters for a tutor-derived continuation. The validation-only budget sensitivity replayed 806 all-manual prefixes per configuration. With a 1024-character learner window, zero tutor fragments yielded 31 ghost events and 157 target-matching pool events; up to four yielded 43 and 168; allowing up to twelve gave the same counts in this small fixture. The latter had only 3.72 fragments on average, so it is not a full twelve-fragment stress test. Inputs averaged about 4.15 word-like units, so the 8/16/32-unit comparison cannot establish long-context behavior. Truncating already-eligible ghost text to two versus six word-like units is an offline output-volume probe, not an exposed runtime setting. Character and word-like-unit counts are not model tokens. [Budget sensitivity](budgets.json)

A further 144-task cohort with new synthetic user/family IDs and days 100–111 was drafted after reviewing the earlier results. Its replay was stopped before completion, so it supplies **no outcome evidence**. [Unevaluated dataset](fresh-dataset.json) · [Recorded inputs](fresh-protocol.json)

Artifacts: [dataset](dataset.json) · [manifest and selection rule](manifest.json) · [training features](train-features.json) · [pre-fix validation](validation-pre-fix.json) · [pre-fix test](evaluation-pre-fix.json) · [paired summary](summary.json) · [autocorrection calibration](autocorrect.json). Dataset, manifest, evaluator, trained scorer and pre-fix engine source hashes are embedded in the results; regression records both engine hashes. The original selection and test require the saved pre-fix source; the current engine can run the labeled regression and fresh connector stress. The supplied GGUF weights remain outside the application bundle.

To reproduce the original model study in a separate checkout with the [pre-fix engine](tested-engine-pre-fix.ts), install the project Node dependencies and CPU PyTorch, then run `python scripts/tutor-writing-dataset.py`, `python scripts/tutor-writing-manifest.py`, `node scripts/tutor-writing-extract.mjs`, `python scripts/tutor-writing-fit.py`, `node scripts/tutor-writing-safety.mjs`, `TUTOR_WRITING_PHASE=validation node scripts/tutor-writing-evaluate.mjs`, and only then `TUTOR_WRITING_PHASE=test node scripts/tutor-writing-evaluate.mjs`. The extraction and replay use a local Vite/Chromium session; set `CHROMIUM_PATH` if needed. The tested Python/PyTorch versions are recorded in [models.json](models.json). Avoid overwriting the preserved artifacts when reproducing.
