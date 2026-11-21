# 10. Roadmap and checklists

This roadmap assumes one implementer, plus some of your time for consent, trial sessions, ink capture and a small labelling task. All durations are estimates.

## Phase 0: Fix measurement (week 1)

- [ ] Write protocol v1 ([06 §6.1](06-evaluation.md#61-one-protocol-file)) with the metric definitions and the three sanity checks.
- [ ] Build the text replay harness ([02 §2.5](02-datasets.md#25-turning-text-into-examples-replay)) so any engine runs on identical examples.
- [ ] Reproduce C0's results on the PR's fixture and on your exported history, and run the sanity checks.
- [ ] Add impression and outcome logging, shadow autocorrect and display suppression to the test APK. Keep them behind a default-off flag, on the phone only, and covered by deletion tests.
- [ ] File issues for:
  - the autocorrect default and the parsing of older stored preferences (`preferences.ts:45`)
  - the dead six-typo path and its stale docs (`completionEngine.ts:44`, `N207.md`)

**Exit:** the harness reports C0 on your text, and rank-sensitive metrics order the engines random < C0 < oracle.
**Your part:** approve logging and export your history.

## Phase 1: Data (weeks 1–3, overlapping)

- [ ] Write the licence register and data cards for D1–D14.
- [ ] Download, filter, deduplicate and decontaminate the public corpora.
- [ ] Build the lexicon counts, the notation pairs and version 0 of the noise model.
- [ ] Freeze your chronological splits and their hashes.
- [ ] Build the D13 learner-choice set: judge pre-labels, at least 300 labels from you, and adjudication.
- [ ] Start ink capture sessions ([08 §8.2](08-handwriting.md#82-data)).

**Exit:** all test splits are frozen, and the judge agrees with your labels at κ ≥ 0.8, or you've labelled the set yourself.
**Your part:**
- about 2 hours of labelling
- 45–60 minutes of ink capture, spread over a week
- normal daily use with logging on

## Phase 2: Classical stack (weeks 3–5)

- [ ] Build T1 (lexicon), T2 (noisy channel and spatial model), L1 (n-gram) with P1 (cache), and R1 (ranker).
- [ ] Run experiments E1–E4 on the frozen splits.
- [ ] Evaluate the learner-choice filter on D13.

**Exit:** G1–G3 pass offline.

## Phase 3: Neural stack (weeks 5–9)

- [ ] Train, quantize and export L2 and L3, with parity tests.
- [ ] Adapt the L4 models: SmolLM2-135M, SmolLM2-360M, Gemma 3 270M, LFM2-350M and Qwen3-0.6B. Use MobileLLM-R1 only as a research comparison.
- [ ] Optionally, distill from L5.
- [ ] Benchmark on the phone every candidate that wins offline.
- [ ] Run experiments E5, E6 and E8.

**Exit:** a neural stack beats Phase 2 offline and passes G4 on the phone. If none does, Phase 2 ships alone.

## Phase 4: Autocorrect (weeks 4–10; needs shadow logs)

- [ ] Build the A1 classifier, calibrate it, and produce a Learn-then-Test certificate for each mode.
- [ ] Combine it with personal permission and the **Always** / **Don't** controls.
- [ ] Run experiment E7.

**Exit:** G5 passes offline. Then run a supervised live period with monitoring.

## Phase 5: Human trial (weeks 9–13)

- [ ] Preregister the hypotheses and primary metrics in the protocol.
- [ ] Run E9: blinded, randomized sessions, plus the weekly transcription set.
- [ ] Analyze the results and decide.

**Exit:** G6.

## Phase 6: Ink (parallel, weeks 2–10)

- [ ] Run the capture protocol and build writer-disjoint splits.
- [ ] Train I1–I6.
- [ ] Measure latency on the phone.

**Exit:** G7 for candidates-only improvements. Automatic insertion turns on only when the 0.1% gate passes.

## Phase 7: Personalization loop and Harden

- [ ] Set up the weekly retrain-and-certify routine, drift monitoring and automatic fallback.
- [ ] Complete the Harden review required by the repository rules before any flag defaults on.

## Turning phases into NEXT.md items

Under `AGENTS.md`, the priority run or you add the items. The repository rules also require that:

- each new feature sits behind a default-off flag in `src/flags.ts`
- each PR records its changes in `docs/current/<id>.md`
- each item names any new dependency

Suggested items, with IDs to be assigned:

| Item | Done when | New dependency |
| --- | --- | --- |
| Writing-aid replay harness and protocol v1 | Harness, sanity checks and C0 baseline report exist | Build-time scripts only |
| Writing-aid logging and shadow autocorrect | Events, export and deletion tests exist; flag off | None |
| Math lexicon and noisy-channel corrector | E1/E2 report written; G1 passes | None (TypeScript) |
| n-gram scorer and ranker assets | E3/E4 report written; G2–G3 pass | None at runtime; KenLM and LightGBM at build time |
| Small neural scorer (L2/L3) | E3 report written; G4 passes | None (`onnxruntime-web` is already a dependency) |
| Pause-time pretrained reranker | E5 report written; G4 passes | A native runtime, if chosen (llama.cpp or LiteRT-LM) |
| Certified autocorrect | E7 report written; G5 passes | None |
| Ink capture and model v2 | 08 report written; G7 passes | None (`onnxruntime-web`) |
| Human trial and decision | E9 report written; G6 passes | None |

## Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Too little of your text | Underpowered tests | Use your history plus 2–4 weeks of logs; paired offline tests need only about 2,000–4,000 opportunities |
| Licences: MathWriting (NC-SA), MobileLLM-R1 (NC), Gemma terms, LFM's revenue cap | Some weights can't ship | Keep the licence register; ship only weights trained on permissively licensed data; use NC models for research comparison only |
| Phone memory and WebView speed | L4 is unusable | Word-start caching; L3 as the main neural model; a native runtime only if needed |
| Label noise from typos the learner didn't notice | Precision estimates come out pessimistic | Conservative by design; the weekly review sample |
| Learner-choice leaks from new models | Pedagogical harm | Generation constraints, S1, the D13 gate and the stopping rule |
| Too much asked of you | Data collection stalls | Short sessions; passive logging; labelling capped at about 2 hours |
| Overfitting to one person | Poor results for other users | Global models trained on public data; personal layers kept separate |
| Asset sizes | Download and storage costs | Lazy, optional downloads; manifests; a control to remove models |
