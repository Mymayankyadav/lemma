# 1. Diagnosis: why PR #1738 couldn't pick a winner

Evidence comes from PR #1738 at head `05f297d3` unless noted. Links point to that commit.

## 1.1 Three writing-aid runs, three answers

| Run | Commit | Simulated user | Reported speed |
| --- | --- | --- | --- |
| Fixed row | [`9a84cf4`](https://github.com/Mymayankyadav/lemma/commit/9a84cf4fd7cac502fee14b0712fb38a1c6372235) | 75% nominal acceptance; Fitts' law tap cost; 75 ms inspection per accept; 16 synthetic proof continuations | Balanced 33.65 WPM, Faster 37.94, Strict 30.26, from a 30 WPM baseline. Balanced falls to 32.75 at 40 ms per glance. |
| Adaptive | [`86552b5`](https://github.com/Mymayankyadav/lemma/commit/86552b5276aeec6a5cf80fd7efaf349a88eef13d) | 45% acceptance at one target-informed opportunity per draft; 300 ms tap; 80 ms per list | Every scorer about 30.29 WPM in Balanced. The intended word came first at different rates: static 36.7%, frequency 46.9%, contextual 47.6%. |
| Tutor | [`894fa52`](https://github.com/Mymayankyadav/lemma/commit/894fa52d049101b822ec043fbc58b7285d891356) | 45% acceptance; 300 ms tap; 40 ms per new list; 144 test tasks | Selected 29.97 vs manual 29.48, a gain of 0.49 WPM (95% CI 0.20–0.87). Random ranking scored 29.96. |

The benefit fell roughly tenfold between the first run and the last. Over the same span the user model, the tap cost and the data all changed, and no report reconciles them.

Faster mode, the first run's largest gain, was never measured for speed again. The bundled research audit had already found possible new mathematical ideas in 9 of 73 Fast offers ([ENGINE.md](https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/docs/implementation/2026-11-21/writing-aid/ENGINE.md)). Before a guard was added, the tutor run also found 48 weak `because` offers in Faster.

## 1.2 Root causes

### a. The candidate pool was the ceiling

- The runtime lexicon is 41,557 SCOWL spellings. Its ranking data is 1,500 unigrams and 750 bigrams from English comments in mathlib4.
- In run 2's held-out Faster phase, only 728 of 1,440 intended words were in the permitted pool at the chosen opportunity. The other 712 were unreachable by any ranker ([adaptive README](https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/docs/implementation/2026-11-21/writing-aid-adaptive/README.md)).
- Strict produced at most one eligible suggestion, so ordering never mattered there.
- A better ranker can't fix a pool that lacks the word. Candidate recall has to be measured and raised first ([04 §4.3](04-models-and-methods.md#43-candidate-generation-and-correction)).

### b. The data wasn't math writing

- The tutor run's [dataset](https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/docs/implementation/2026-11-21/writing-aid-tutor/dataset.json) has 576 tasks, 144 per split. They contain only **104 distinct intended texts** from 96 templates and 32 families, averaging **33 characters**. Typical targets: "I read the question.", "Let eps denote the tolerance.", "My labels are X and Y. I choose Y."
- The whole test split is 4,581 target characters. The selected engine left 4,163 of them to type by hand, about 9% fewer than typing everything.
- Real learner proofs contain things this data has none of:
  - long-tail terms such as equicontinuous and homeomorphism
  - mixed Unicode and TeX
  - identifiers the learner declared earlier
  - abbreviations such as `iff` and `wlog`

### c. The metric couldn't see ranking

- In the tutor run's test replay, the target was in the eligible pool at 377 steps and was visible at the same 377 steps. Whenever the target existed it was on screen, so its rank never changed what the simulated user could accept.
- The simulated user accepted any visible match with the same probability whichever slot it occupied. Real users look at slots unequally; the centre-slot design depends on that.
- The result: random ranking scored 29.96 and the selected model 29.97, while the six trained scorers all landed on 29.99. Run 2 had reported the one rank-sensitive signal, the top-1 rate, and the tutor run dropped it.

### d. The user model was assumed, not measured

These were all modelling choices:

- acceptance probability: 75%, later 45%
- tap cost: a Fitts' law model, later a flat 300 ms
- glance cost: 75 ms, then 80 ms, then 40 ms

Quinn and Zhai (2016) showed that the attention suggestions demand can cancel the keystrokes they save, so these constants decide whether the simulated result is positive or negative. They must be estimated from your own logs ([03 §3.4](03-feedback-and-logging.md#34-small-randomizations-that-answer-behavior-questions)).

### e. The winner was chosen by tie-break

"Tutor-wording" won validation by 0.006 WPM, inside the preregistered 0.10 WPM tie band. On test it produced trajectories identical to the plain contextual ranker, and the tutor-terms variants scored higher (29.99) than the winner (29.97). These differences are noise.

### f. The autocorrect evidence came from the generator

- **Cold start.** Each of the four pairs had 268 eligible cases: 246 right, 22 wrong. In every pair the errors fall at the same template indices (002, 025–027, 052, 075–077, 102, 126–127, 152 …) ([autocorrect.json](https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/docs/implementation/2026-11-21/writing-aid-tutor/autocorrect.json)). The error rate is set by the generator's template cycle, not by the typo.
- **Conditional rule.** The expanded cohort's users were generated with family-dependent intentions that stay consistent after two acceptances. The two-acceptance rule therefore passes largely by construction.
- Neither result measures how often a real learner writes `teh` on purpose.

### g. Held-out discipline

- Fixes were checked on the tasks that exposed their bugs. The PR correctly labels these as regressions, but they can't support a safety claim.
- The split calendars overlap by two days: train days 0–11, calibration 10–21, validation 20–31, test 30–41.

### h. The ink results are synthetic

- Detypify 0.3.0 has no exact class for `<`, `>`, `=` or `≠`. These four caused all 32 complete-symbol misses in the stress set, where the geometry fallback recovered 4 of 36.
- **Could become** showed the intended longer symbol on 53 of 100 partial traces in the first corpus and 22 of 66 in the stress corpus.
- The combined identity-and-completion gate accepted nothing on the stress set, so automatic insertion has no supporting evidence yet. No real writers and no phone have been measured.

### i. Code and document inconsistencies

File these as issues. Fixing them is outside this plan's scope.

- [`preferences.ts:45`](https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/src/features/tutor/writingAid/preferences.ts#L45) defaults the personal-autocorrect switch to on. A preference stored before the switch existed, such as `balanced:15`, also parses as on because its third field is missing. Anyone who had enabled a mode earlier gets automatic corrections without choosing them.
- [`completionEngine.ts:44`](https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/src/features/tutor/input/completionEngine.ts#L44) keeps a six-typo list with unconditional correction (`automaticSpelling`). Its only caller, `typedNotation`, is used only by tests, yet `docs/current/N207.md` and `keyboard-research.md` still describe that behavior as live.

## 1.3 What to keep

- **The interaction contract:** revision and selection checks, IME suspension, owner and checkpoint scoping, rejection of stale results.
- **The learner-choice guards and the PR's adversarial probes,** kept as a regression suite.
- **The ten feedback channels,** kept as logged events and ranker features, with fitted weights instead of hand-set ones.
- **The pinned-asset pattern:** manifest, SHA-256, licence notice, preprocessing version.
- **Three candidates per group.** Five gave no recall gain in either ink corpus.
- **The ink method:** identity kept separate from completion, and the ROC and precision–coverage analysis.
- **The side-by-side demo APK,** which becomes the vehicle for collecting real data.
