# 6. Evaluation protocol

## 6.1 One protocol file

Before Phase 2, write a protocol file such as `docs/research/math-input-plan/protocol-v1.md` and freeze it. It lists:

- the datasets, with the SHA-256 of every split, and the split rule
- every metric's exact definition (§6.2), with the prefix lengths and k values reported
- the behavioral model's parameters and where they came from (§6.3)
- the device, build and runtime for benchmarks (§6.4)
- the statistical tests and the smallest differences they can detect (§6.6)
- the decision gates (§6.7)

Any change creates protocol v2. Results produced under v1 and v2 never appear in the same table.

## 6.2 Offline replay metrics

These need no user model.

| Metric | Definition |
| --- | --- |
| Oracle pool recall | Share of intended words that appear in the candidate pool at some prefix shorter than the word |
| Top-k accuracy at prefix p | Share of opportunities with typed prefix length p where the intended word is among the first k displayed. Report p = 0 (next word), 1, 2 and 3, and k = 1 and 3 |
| MRR@3 | Mean reciprocal rank of the intended word within the first three |
| Keystroke savings (Trnka & McCoy 2008) | (Characters not typed − acceptance taps) ÷ characters in the text. Report two versions: an ideal user who accepts as soon as the word reaches the top k (k = 1 and k = 3, labelled as upper bounds), and the fitted user from §6.3 |
| Correction | Precision, recall and F0.5; false corrections per 1,000 words; protected-token violations, which must be 0 |
| Notation | Conversion precision and recall; ambiguous-alias errors |
| Learner-choice leaks | Displayed blocked candidates ÷ blocked opportunities, with a Clopper–Pearson upper bound |

**Checks a metric must pass before it can choose between rankers:**

1. Random ranking scores clearly below the control on rank-sensitive metrics.
2. The oracle ranker produces the ceiling.
3. Deliberately degrading a model, for example by shuffling its scores, moves the metric.

PR #1738's simulated WPM fails check 1.

## 6.3 Behavioral simulation (screening only)

1. **Fit from D2:**
   - slot examination probabilities, from the slot swaps
   - acceptance probability by characters remaining
   - attention cost, from display suppression
   - the distribution of time between keystrokes
   - recovery times
2. **Validate** by predicting a held-out week's acceptances and typing speed. If the predictions fall outside the 95% intervals of the observed values, refit.
3. **Report** results with sensitivity bands across the parameters' uncertainty.

Once real comparisons exist, simulation never decides anything alone.

## 6.4 Phone benchmarks

**Setup:**

- your Snapdragon 4 Gen 4 phone with 6 GB RAM, plus the repository's POCO M8 Power / Android 16 target if that's a different device
- a release-mode APK
- the Android System WebView version recorded

**Measure:**

| Measurement | Target |
| --- | --- |
| Keystroke-to-suggestion paint, p50 and p95 | p95 ≤ 50 ms ([specification §11.1](https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/docs/implementation/2026-11-21/mobile-math-input.md)) |
| Word-start model step, p50 and p95 | Result arrives before the next keystroke, at your typing speed, in at least 95% of word starts |
| Prefill time when a composer opens; first-use load time; asset download size | Record |
| Peak and steady memory (PSS), with the drawing recognizer and an active chat loaded | Within the budget set in protocol v1; the app survives being backgrounded |
| Battery and temperature over a 30-minute scripted typing session (injected taps replayed), compared with assistance off | Record |
| Main-thread tasks over 50 ms | None that repeat (specification §11.1) |

Run every measurement three times, in each of three states: cold, warm, and after 10 minutes of use.

## 6.5 Human trial on the phone

**Participants:** you, plus 3–5 consenting testers if you want results that generalize.

**Conditions:** Off; C0, the current engine; the best classical stack; the best neural stack. Engine names are hidden and shown as "Engine 1–3".

**Design:**

- **N-of-1 crossover** (Kravitz & Duan 2014): randomized order within blocks of sessions, at least 8 sessions per condition, each at least 10 minutes of real study writing.
- **Weekly transcription set:** 10 real proof passages typed under each condition, giving a controlled comparison of speed and errors.
- **Composition-task framing** for realistic writing (Vertanen & Kristensson 2014).
- **Display suppression** within sessions ([03 §3.4](03-feedback-and-logging.md#34-small-randomizations-that-answer-behavior-questions)).

**Outcomes:**

- words per minute
- total error rate and keystrokes per character (Soukoreff & MacKenzie 2003)
- accepted suggestions and undos per 100 words
- automatic corrections reverted per 1,000 words
- one-item ratings per session: "helpful" and "felt in control"
- the share of math-span characters inserted by the aid, to watch for content effects (Arnold et al. 2020)

**Analysis:**

- mixed-effects regression of speed and errors on condition, with passage and day effects
- effect sizes with 95% intervals
- WPM tested for non-inferiority, with a margin of −1 WPM
- errors and keystrokes tested for superiority

**Stopping rule:** if any blocked candidate is displayed, that condition stops until it is fixed and re-certified on D13.

## 6.6 Statistics and sample sizes

- **Offline paired comparisons:** McNemar's test. A 2-point top-1 difference needs about 2,000–3,900 opportunities ([02 §2.10](02-datasets.md#210-how-much-data-is-enough)).
- **Keystroke savings and correction metrics:** paired bootstrap that resamples whole documents or sessions, never individual words.
- **Human speed:** assume the session-to-session standard deviation of differences is about 3 WPM, and measure it in week 1. Detecting 1.5 WPM at 80% power then needs about 32 paired sessions. Fewer sessions support a non-inferiority check, not a claim of superiority.
- **Certification bounds:** see [02 §2.10](02-datasets.md#210-how-much-data-is-enough) and [05 §5.10](05-training.md#510-autocorrect-decision-and-certified-thresholds-a1).
- **Multiple comparisons:** the protocol names one primary metric per phase. Everything else is secondary.

## 6.7 Decision gates

These are proposals. Finalize them in protocol v1 after measuring the control.

| Gate | Passes when |
| --- | --- |
| G1. Candidate ceiling | Oracle pool recall on your test split is at least 95% of words that aren't learner choices |
| G2. Ranking | Top-1 at prefix 2 and top-3 at prefix 1 beat the control, with 95% CIs excluding 0; ideal keystroke savings (k = 3) improve by 3 points or more |
| G3. Learner choice | No blocked candidate is displayed on D13's test half, which holds at least 600 blocked items (upper bound ≤ 0.5%); the PR's adversarial probes still pass |
| G4. Phone | p95 keystroke-to-paint ≤ 50 ms; at least 95% of word-start results arrive before the next keystroke; no long tasks that repeat; memory within the protocol's budget; no app kills over 30 minutes |
| G5. Autocorrect | A Learn-then-Test certificate per mode on at least 300 shadow events; in the human trial, at most 1 revert per 1,000 words |
| G6. Human | WPM non-inferior; errors no worse; you prefer it |
| G7. Ink | As in [08 §8.5](08-handwriting.md#85-evaluation-and-gates) |

## 6.8 Report template

Every experiment report starts with this table:

| Experiment | Protocol | Data (hash) | Engine/model (hash) | Primary metric (95% CI) | Secondary | Leaks | False corrections | Latency p95 | Memory | Not measured |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

After the table, the report says what changed since the previous report, and any deviation from the protocol.

## 6.9 Anti-patterns

Each of these happened in PR #1738:

- a winner chosen inside the tie band
- a fix "validated" on the cases that exposed the bug
- a simulated user whose acceptance couldn't depend on rank
- assumptions changed between runs, with the results compared anyway
- synthetic cohorts used to certify safety or autocorrect
- splits that share calendar days
