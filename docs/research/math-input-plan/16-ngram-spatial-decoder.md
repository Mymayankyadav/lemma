# 16. CPU-only n-gram and spatial decoder: detailed plan

**Status:** plan only, 21 November 2026. No GPU anywhere.

This is the next step up from Lemma's current engine: a Gboard-style literal decoder. It combines:

- a spatial model of where your taps land
- n-gram language models trained on a large English and math corpus
- fuzzy matching through an edit model
- the tutor's checkpoint signals ([15](15-tutor-signals.md))

It feeds the existing three-slot suggestion strip. Everything trains on a CPU in hours and runs in TypeScript, with no new runtime dependency.

## 16.1 Where we start (step 0)

| Engine | What it does today | Main limits |
| --- | --- | --- |
| `main`: `src/features/tutor/notation.ts` (N201) | A small fixed vocabulary (`VOCAB`, `PHRASES`), plus words from the question and draft. Hand-set typo costs on a coarse key grid: adjacent substitution, transposition, one insertion or deletion. A few automatic typo fixes. | No word frequencies, no context model; taps reduced to letters |
| PR #1738 writing aid | 41,557 SCOWL spellings, 1,500 unigrams and 750 bigrams from mathlib4 comments, rule lanes and guards | Tiny ranking data; no spatial model; pool misses many intended words ([01](01-diagnosis.md)) |

What stays:

- the three-slot strip
- the custom keyboard
- the learner-choice guards ([07](07-learner-choice-safety.md))
- stale-proposal checks
- tap-or-Tab acceptance and undo

`TutorKeyboard` already receives pointer events on each key, so tap coordinates relative to the key can be logged without changing how keys work.

## 16.2 Architecture

| Component | What it is | Size on the phone (target) |
| --- | --- | --- |
| A. Keyboard geometry | Key rectangles for every layout and orientation, measured from the rendered keyboard | < 10 KB |
| B. Spatial model | A 2-D Gaussian per key (mean offset and covariance), personalized from your taps | < 10 KB |
| C. Lexicons | English words, math words, KaTeX commands, your personal words, the tutor pack (tier 1), and a protected list | 2–4 MB |
| D. Language models | Prose n-gram (English plus math prose), LaTeX-token n-gram for math mode, personal cache, tutor cache, and a case model | 8–20 MB, depending on pruning |
| E. Edit model | Probabilities of extra, missed and swapped taps, and of space errors | < 1 KB |
| F. Decoder | Beam search over the lexicon trie, combining B, D and E, plus a top-k completion index | Code |
| G. Suggestion selector | The three slots, entropy rules, diversity, stable positions, next-word suggestions | Code |
| H. Autocorrect decision | Calibrated probability, certified threshold and personal permission ([05 §5.10](05-training.md#510-autocorrect-decision-and-certified-thresholds-a1)) | Code |
| I. Logging and personalization | Events from [03](03-feedback-and-logging.md); updates to B and the personal cache | Phone storage |

Everything ships as lazily loaded, hash-pinned assets, following the Detypify pattern, and runs in a Web Worker so typing never waits on it.

## 16.3 Datasets

| Use | Dataset | Licence | Amount |
| --- | --- | --- | --- |
| English prose | FineWeb-Edu sample (educational English) | ODC-By | 0.5–1B tokens |
| English prose | English Wikipedia sample | CC BY-SA 4.0 | 0.3–0.5B tokens |
| Learner-style English and math prose | Mathematics Stack Exchange questions, answers and comments | CC BY-SA 4.0; check current dump terms | All available, upweighted |
| Math prose | OpenWebMath; FineMath 4+; ProofWiki; Stacks; mathlib4 docstrings | ODC-By; ODC-By; CC BY-SA 3.0; GFDL; Apache 2.0 | 0.5–1B tokens after selection ([12 §12.3](12-scribe-dataset.md#123-selection-keeping-only-useful-data)) |
| LaTeX tokens (math mode) | Math spans from OpenWebMath, ProofWiki and Math.SE, normalized as in [12 §12.4](12-scribe-dataset.md#124-latex-normalization) | As above | 0.1–0.3B math tokens |
| Lexicon and unigram priors | SCOWL (already in the app); AOSP LatinIME English wordlist (§16.4); wordfreq | SCOWL notices; Apache-2.0 AOSP project (check the dictionary files' notice); CC BY-SA 4.0 | Word lists |
| Edit model | GitHub Typo Corpus; Birkbeck spelling corpus; WikEd Error Corpus | Check each | Misspelling–correction pairs |
| Spatial prior | Key geometry plus published touch-behavior findings (§16.6) | — | — |
| Personal | Your Lemma export; trial-APK logs; tutor packs | Your own data | Evaluation, cache, personalization |

Keep an attribution file listing each source, its licence and its version. CC BY-SA sources carry attribution and share-alike obligations, recorded in the licence register ([02 §2.4](02-datasets.md#24-public-corpora-d3d12)).

## 16.4 Getting English right: Gboard and the alternatives

| Option | What you get | Fit |
| --- | --- | --- |
| Gboard's own models | — | Not possible. They are proprietary, ship inside the Gboard app, and have no public prediction API. |
| AOSP LatinIME English dictionary | The English wordlist with frequencies from Android's open-source keyboard, Gboard's open-source ancestor (`dictionaries/en_US_wordlist.combined.gz`) | **Use** as a mobile-tuned English unigram prior and lexicon source, after confirming its licence notice |
| Android system spell checker via `SpellCheckerSession` | Apps can request spelling suggestions from the phone's selected system spell checker (API level 14; sentence suggestions from API 16). On many phones that is Gboard's checker; check Settings on your phone. | **Optional, later.** Needs a small Capacitor native plugin. Spelling only, asynchronous and device-dependent. Its suggestions join the candidate pool and are scored by our decoder. |
| Our own English n-gram (FineWeb-Edu, Wikipedia, Math.SE) | Context-aware English prediction | **Use.** This is the core English model. |
| wordfreq | Unigram frequencies across many genres | **Use** to smooth rare-word frequencies |
| Pretrained web n-grams, such as CCNet's Wikipedia KenLM models | Very large SentencePiece 5-grams | Offline use only, for example data filtering; too large for the phone |
| CIFG-LSTM ([04 L2](04-models-and-methods.md#l2-cifg-lstm-word-model-about-14m-parameters)) | Neural English and math next-word prediction | A later extra mixture component, also trainable on CPU |

## 16.5 Training the n-gram models on CPU

### Steps

1. **Collect and clean.** Stream each source, keep English, strip boilerplate and code, deduplicate, and decontaminate against your test split. Split documents into prose spans and math spans with the LaTeX lexer ([11 §11.3](11-scribe-architecture.md#113-deterministic-front-end)).
2. **Normalize prose for the prose model:**
   - Unicode NFC.
   - Lowercase everything; the case model handles capitals.
   - Replace numbers with a `<num>` class.
   - Keep apostrophes and hyphenated words.
   - Split sentences, with sentence-start and sentence-end markers.
   - Inside prose, replace each math span with a single `<math>` token, so the prose model learns where formulas occur.
3. **Normalize math spans** for the LaTeX-token model as in 12 §12.4. Tokenize at command level: `\lim`, `_`, `{`, `n`, `\to`, `\infty`, `}`.
   - Map single-letter identifiers to classes such as `<latin>` and `<greek>`. That lets the model learn the shape of formulas without inventing variables.
   - The actual identifier is filled in later, from the learner's own declared identifiers, only after a typed prefix (07, A6).
4. **Vocabulary:**
   - prose: the 100,000–200,000 most frequent forms, plus the protected list and the AOSP and SCOWL words
   - math: every KaTeX command seen at least 20 times, plus the catalogue's TeX forms
5. **Build** with KenLM's estimator, using modified Kneser–Ney smoothing:
   - prose: order 4
   - LaTeX tokens: order 5–6, since math tokens are short
   - prune singleton counts at order 3 and above
   - give the sorter 50–60% of RAM
6. **Prune to size.**
   - Start with count thresholds.
   - If that's still too large, apply Stolcke-style entropy pruning with a small script over the ARPA file. KenLM doesn't do entropy pruning, and SRILM's licence is restrictive.
   - Targets:
     - prose: 8–15 MB
     - LaTeX tokens: 2–5 MB
7. **Quantize** probabilities and back-off weights to 8 bits.
8. **Export** to a compact binary that Lemma's TypeScript reader loads: sorted n-gram arrays with binary search, or hashed buckets.
9. **Check parity** against KenLM on 10,000 random queries, with log-probability differences no larger than the quantization error.
10. **Personal and tutor caches** aren't pretrained. They are counts built on the phone (§16.9). Their mixture weights are tuned in §16.10.

### CPU time (estimates; this container has 4 cores and 15 GB RAM)

| Step | Time |
| --- | --- |
| Download and filter | 2–6 h, mostly network |
| Prose 4-gram on about 1B tokens | 1–3 h |
| LaTeX-token model | Under 1 h |
| Pruning, quantization, export and parity | Under 1 h |

### Case model

- Capitalize at sentence starts.
- Keep stored capitalization for proper names in the lexicon (Cauchy, Lipschitz).
- Remember your own capitalization of words.
- Keep all-caps input as typed.

## 16.6 Training the spatial model on CPU

1. **Measure the geometry.** Render the keyboard at each layout (letters, symbols, each category page) and orientation with Playwright. Record each key's rectangle in CSS pixels, then express positions in key pitches.
2. **Prior.** Give each key a 2-D Gaussian centered on the key:
   - Start with a standard deviation of 0.25–0.35 of the key pitch horizontally and slightly more vertically.
   - Touch spread grows with key size plus a fixed finger-precision term (the FFitts law of Bi, Li & Zhai 2013).
   - Add a small downward mean offset. Touches land systematically offset from key centers, and the offset depends on posture (Henze, Rukzio & Boll 2012; Azenkot & Zhai 2012).
3. **Intended-key labels from logs.** The intended key comes from the final text, aligned to the edit log:
   - If a letter was typed and survived, the intended key is that letter.
   - If it was backspaced and replaced right away, the intended key is the replacement.
   - If a correction was accepted, the decoder's alignment gives the intended key.

   Use soft labels: the decoder's posterior over intended keys.
4. **Fit.** For each key, compute a Bayesian update of the mean and covariance:
   - The prior is §16.6.2 with a strength of 20–100 taps.
   - With few taps, the key stays near the prior; with many, it follows you.
   - Then run 2–3 EM rounds, re-decoding with the updated model.
5. **Variants.** Fit separate models for portrait and landscape, and for one or two thumbs. Detect the thumb mode from the spread of tap positions across the keyboard, and fall back to the shared model when data is thin.
6. **Drift.** Weight taps with a half-life of about 30 days, so the model follows changes such as a new phone case or a habit change.
7. **Edit probabilities.** From the same alignments, estimate the probability of:
   - an extra tap
   - a missed letter
   - a swapped pair
   - a space error

   Start from the typo corpora's relative rates and replace them with yours once you have at least a few hundred aligned errors.
8. **Validate.** Using held-out taps, compare the model's key accuracy (the most likely intended key against the true key) and its log-likelihood with the current grid rule.

This all takes seconds on a CPU. Synthetic taps sampled from the prior also drive decoding tests before real logs exist ([02 §2.6](02-datasets.md#26-realistic-typing-noise-for-the-correct-task)).

## 16.7 The decoder: fuzzy matching

For a candidate word *w*, given the taps typed so far *T* and the previous words *h*:

> score(*w*) = log P(*T* | *w*) + λ_lm · log P_mix(*w* | *h*, mode) + bias(*w*)

**P(*T* | *w*): the fuzzy match.** A small dynamic-programming alignment of the taps against the first letters of *w*, allowing:

| Operation | Score |
| --- | --- |
| Match or substitution | Log of the intended key's Gaussian at the tap position. Continuous: near the right key is cheap, far is expensive. |
| Extra tap | log p_ins, plus a broad background density |
| Missed letter | log p_del |
| Swapped pair | log p_swap, plus both Gaussians |

Further rules:

- **Edit limits:** at most 1 edit for words up to 4 letters, 2 for 5–8 letters, 3 for longer.
- **Completions:** letters of *w* beyond the typed taps add no spatial term. Their cost is carried by the language model.

**P_mix: the language models.** A mixture of the prose n-gram, the personal cache and the tutor cache in prose mode; in math mode, the LaTeX-token n-gram with the same caches. The weights depend on the mode (§16.10).

**bias(*w*):** the tutor-pack boost, applied only once a prefix is typed (§16.9), and the convention prior.

**The literal candidate.** Exactly what you typed always stays in the list as a candidate, scored with an unknown-word language-model probability. That is how a new word or a deliberate spelling survives.

**Space errors.** Only when no single word scores well, add:

- splits ("thereis" → "there is")
- merges ("conti nuous" → "continuous")
- space-bar misses, where a tap on b, n or v falls near the space bar

**Search:**

1. Search tier 1 exhaustively: the tutor pack, function words and your personal words.
2. Run a beam search over the main lexicon trie:
   - beam width 64
   - prune anything more than about 10 nats below the best
   - an optimistic bound from each node's best descendant guides the search
3. Get completions from a top-k completion index: each trie node stores its 8 most frequent descendants (Hsu & Ottaviano 2013). These are then re-ranked with the context language model.

**Posterior.** P(*w* | *T*, *h*) is a softmax of score/τ over the candidates plus the literal, with temperature τ calibrated on validation data. This posterior gives the entropy (§16.8) and feeds the autocorrect decision.

**LaTeX.**

- After `\`, candidates come from the command trie, scored by the LaTeX-token n-gram on the preceding math tokens and fuzzy-matched like words. `\alpah` taps decode to `\alpha`.
- Structure tokens, meaning closing braces and `\right)`, come from the parser ([11 §11.3](11-scribe-architecture.md#113-deterministic-front-end)), not the decoder.

**Latency.** Target under 10 ms per keystroke in the worker at beam 64 (to be measured), within the specification's p95 of 50 ms from keystroke to painted suggestion.

## 16.8 Producing the three suggestions

### Slot conventions

These are Lemma's existing conventions:

- **Centre:** the best choice.
- **Left:** your literal word, whenever a correction is offered, so you can keep what you typed.
- **Right:** the best alternative.

### Each keystroke

1. **Decide the situation:**
   - **Completion:** the literal is a prefix of likely words.
   - **Correction:** the decoder prefers a different spelling.
   - **Next word:** zero letters typed after a space or an acceptance.
2. **Compute the posterior.** Work out the entropy H of the candidate posterior, normalized by the log of the number of candidates, and the margin p₁ − p₂.
3. **Decide whether to show** ([03 §3.8](03-feedback-and-logging.md#38-deciding-when-to-show-anything)). Show if p₁ ≥ τ_show, or if the three best together cover at least 50% of the probability with normalized H ≤ H_max. Otherwise show nothing.
4. **Fill the slots:**
   - **Completion:** the centre is the most probable word that saves at least 2 taps. The sides are the next most probable from *different word families* ("converge" and "converges" are one family). Keep two of a family only if together they outweigh the next family.
   - **Correction:** the left slot is the literal. The centre is the best correction, shown bold if it will be applied at the separator. The right slot is the second correction, or a completion.
   - **Next word:** the most probable allowed words. In prose, only neutral words count as allowed (07, A5). In math mode, offer structure only, from the parser.
     - Offer next-word suggestions only when p₁ ≥ τ_next and H ≤ H_next.
     - Pad notes can allow more, if you decide so ([11 §11.12](11-scribe-architecture.md#1112-showing-math-content-your-decision)).
5. **Keep positions stable.** A suggestion still in the top 3 keeps its slot. The centre changes only when a new best beats the current one by a margin δ.
6. **Use entropy to shape the list:**

   | Entropy | Display |
   | --- | --- |
   | Low | A confident centre, with alternatives on the sides |
   | Medium | Three families, chosen to cover the most probability |
   | High | Nothing, or only the literal |

7. **After an untapped list:** apply the Bayesian ignore update ([13 §13.6](13-scribe-rl-and-feedback.md#136-untapped-suggestions-the-bayesian-ignore-update)) before the next keystroke. Each ignored word loses probability according to how likely it was that you saw it, so the next list moves to other families.

### At separators

**Autocorrect** applies only when all of these hold:

- the situation is a correction
- p(best) is at or above the certified threshold for the mode
- you've given permission for that pair, or the class is certified
- the literal isn't protected

Otherwise the literal stays.

### After you accept a suggestion

The next-word list appears immediately from the cached distribution. If you accepted a LaTeX command that takes arguments, a template with □ slots is offered instead.

### Examples

| Typed | Situation | Left | Centre | Right |
| --- | --- | --- | --- | --- |
| `contin` | Completion | continued | continuous | continuity |
| `contimuous` + space | Correction | contimuous | **continuous** (applied) | continuity |
| `\vare` | Completion (LaTeX) | `\varphi` | `\varepsilon` | `\vartheta` |
| `Let ε` + space | Next word | — | `>` (structure only if the parser expects it), or nothing | — |

## 16.9 Using the tutor signals

These are the hooks for [15](15-tutor-signals.md):

1. **Tier 1 lexicon:** the pack's terms, multi-word terms, names and commands are searched first (§16.7).
2. **Boost:** bias(*w*) = λ_c(*p*) for pack words. λ_c(*p*) is 0 at *p* = 0 and rises to its full value by *p*₀ letters; *p*₀ is tuned between 1 and 3.
   - Question-sourced and book-sourced words get separate strengths, β_q and β_b.
3. **Tutor cache model:** the question text, visible tutor replies and the book's checkpoint pages are counted into a cache n-gram that joins the mixture.
4. **Protection:** pack names and identifiers are never autocorrected.
5. **Misspelling pairs** from the pack become extra entries in the edit model, for example "Lipshitz" → "Lipschitz".
6. **Convention prior:** the book's variants (`\varepsilon`, `⊆`) set the starting convention counts.
7. **Command prior:** the pack's commands rank first after `\`.
8. **Topic:** selects mixture weights, if separate topic statistics exist.

## 16.10 Hyperparameters and tuning (CPU only)

| Parameter | Range | Start | How it's set |
| --- | --- | --- | --- |
| Prose n-gram order | 3–5 | 4 | Held-out perplexity versus size |
| LaTeX-token n-gram order | 4–6 | 5 | Same |
| Pruning thresholds | — | Size targets in §16.5 | Size versus perplexity curve |
| Mixture weights per mode (prose, math) | Simplex | Uniform | EM on validation text (closed-form iterations) |
| Language-model weight λ_lm | 0.5–1.5 | 1.0 | Decoder tuning |
| Spatial spread scale | 0.2–0.5 key pitch | 0.3 | Prior, then fitted |
| Prior strength per key | 20–100 taps | 50 | Decoder tuning |
| p_ins, p_del, p_swap | 0.002–0.05 | From typo corpora | Fitted from your logs |
| Maximum edits by length | 1 / 2 / 3 | As in §16.7 | Fixed |
| Beam width | 16–128 | 64 | Accuracy versus latency |
| Prune margin | 6–14 nats | 10 | Same |
| Posterior temperature τ | 0.5–2 | 1 | Calibration (negative log-likelihood) |
| τ_show, H_max | 0.1–0.4; 0.6–0.95 | 0.2; 0.85 | Suggestion tuning |
| Minimum taps saved | 1–3 | 2 | Suggestion tuning |
| τ_next, H_next | — | Conservative | Suggestion tuning |
| Hysteresis δ | 0–0.15 | 0.05 | Suggestion tuning |
| Tutor boost β_q, β_b; gating *p*₀ | 1–10; 1–3 | 3, 2; 2 | Suggestion tuning |
| Cache half-life | Session; 30 days | — | Validation |
| Autocorrect threshold | — | — | Certified by Learn-then-Test on shadow logs, never tuned for speed |
| Ignore-update parameters | — | Priors | Fitted from slot-swap logs |

### Tuning procedure

1. Freeze the splits: your data chronologically, public data by document ([02 §2.9](02-datasets.md#29-splits-and-leakage)).
2. Build the n-gram components (§16.5).
3. **Mixture weights:** run EM on validation text separately for prose and math mode. This takes seconds.
4. **Spatial model:** fit from the prior, or from logs once they exist (§16.6).
5. **Decoder parameters** (λ_lm, edit probabilities, spread scale, beam):
   - Use random search, about 100–200 configurations (Bergstra & Bengio 2012), or a tree-structured Parzen estimator (Bergstra et al. 2011; Optuna as a build-time tool).
   - The objective is word accuracy after decoding noisy taps, with a latency limit.
6. **Suggestion parameters** (thresholds, diversity, hysteresis, tutor boost, gating):
   - Same search method.
   - The objective is tap savings on replay of your answers, using the fitted acceptance model (06 §6.3).
   - Constraints: false corrections at or below the bound, and zero learner-choice leaks.
7. **Calibrate** τ on validation.
8. **Certify** the autocorrect threshold separately, on shadow logs (05 §5.10).
9. **Evaluate once** on the test split and write the report (06 §6.8).

### Time on a CPU (estimates)

- One replay of about 10,000 words, roughly 60,000 keystrokes, at 0.2–1 ms per keystroke in Node takes about 12–60 seconds.
- On 4 cores, 200 configurations take about 15–50 minutes per tuning stage.
- The whole first tuning pass takes about half a day.

### When to re-tune

| Cadence | What |
| --- | --- |
| Weekly, after an export | Mixture weights, spatial model and suggestion thresholds |
| Monthly | Rebuild the n-gram assets with new public data |
| After any keyboard layout change | Re-measure the geometry and refit the spatial model |
| Never | Tune on the test split |

## 16.11 Evaluation

The evaluation reuses [06](06-evaluation.md).

**Baselines:**

- the current `main` engine
- PR #1738's engine
- an oracle ranker

**Metrics:**

- oracle pool recall
- top-1 and top-3 accuracy at prefix lengths 0–3
- tap savings
- decoding word accuracy on noisy taps
- false corrections per 1,000 words, with protected tokens at 0
- learner-choice leaks (0)
- latency p95 on the phone
- memory

**Ablations, one component removed at a time:**

- the spatial model, replaced by the current grid
- the n-gram context, replaced by unigrams
- the English corpus
- the math corpus
- the tutor signals
- entropy display
- the ignore update

## 16.12 Rollout: each step is shippable on its own

Each step ships behind a default-off flag and must pass its replay gate before the next. The gains are crude guesses to be replaced by measurement.

| Step | Change | Crude expected gain |
| --- | --- | --- |
| 1 | Lexicon plus unigram frequencies (English, math, AOSP and SCOWL words) replace the small vocabulary | Fixes most of the missing-word problem: much higher pool recall |
| 2 | Bigram to 4-gram context for ranking, and neutral next-word suggestions | Top-1 up a few to about 10 points over unigram ranking |
| 3 | The spatial model replaces the grid typo cost | Better correction of sloppy taps, including non-adjacent misses |
| 4 | Full decoder: edit lattice, beam search, completion index, space errors | Combines steps 2 and 3; fewer wrong corrections |
| 5 | Tutor signals (§16.9) | About 3–9% fewer taps; near-zero name false corrections ([15 §15.6](15-tutor-signals.md#156-crude-estimates)) |
| 6 | Entropy display, diversity, stable slots, ignore update | Fewer wasted lists, so less attention cost, more than extra taps |
| 7 | Personalization: spatial offsets, personal cache, re-tuned weights | Modest further gains; personalization reduced touchscreen errors in Fowler et al. (2015) |

## 16.13 CPU budget summary

| Item | Time |
| --- | --- |
| Data preparation | 2–6 h |
| n-gram builds and export | 2–4 h |
| Spatial fit | Seconds |
| Tuning | About half a day |
| Weekly refresh | Minutes |
| GPU | None |

## 16.14 Risks

| Risk | Mitigation |
| --- | --- |
| Assets too large for comfortable download | Prune harder; lazy optional download; the tutor tier 1 covers many needs |
| Decoder too slow in the WebView | Smaller beam, tier-1-first search, worker thread |
| Over-correction from strong language-model weight | Tune λ_lm; certified threshold; literal always kept on the left |
| English model steering math prose | Mode-dependent mixture weights; math corpus share; your cache |
| Licence obligations (CC BY-SA counts) | Attribution file and licence register |
| No real taps yet | Geometry prior plus research offsets; personalization only after enough taps |
