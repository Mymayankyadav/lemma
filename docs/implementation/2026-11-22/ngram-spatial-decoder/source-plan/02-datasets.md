# 2. Datasets: what to collect and how to build it

Only the learner's own math writing can decide between models. Public corpora are for training and pretraining. Synthetic text is for augmentation and regression tests.

## 2.1 Tasks the data has to support

| Task | Input | Output | Used by |
| --- | --- | --- | --- |
| Complete | Preceding text + typed prefix of the current word | The intended word | Lexicon, language models, ranker |
| Next | Preceding text at a word boundary | The next word; neutral words only (see 07) | Language models, ranker |
| Correct | Preceding text + typed, possibly misspelled token + tap positions | The intended token, or "keep as typed" | Noisy channel, autocorrect decision |
| Notation | Text + an explicit alias inside a math span | Symbol or TeX, or "leave as a word" | Notation lane |
| Scaffold | Text + the scaffold the learner selected | Scaffold with empty slots | Scaffold grammar |
| Boundary | Text + one candidate | Allowed, or the blocked category | Learner-choice classifier |
| Ink | Strokes | Symbol, unknown, or incomplete | Ink models (see 08) |

## 2.2 Inventory

| ID | Source | Contribution | Size | Licence | Use |
| --- | --- | --- | --- | --- | --- |
| D1 | Your Lemma history, via the owner export | Real answers, Pad notes, cards, transcribed handwriting; tutor questions as context | Measure | Your own data | Chronological test; some training |
| D2 | Logs from the instrumented test APK | Keystrokes, tap coordinates, impressions, outcomes, final text | Grows with use | Your own data | Training, calibration, test |
| D3 | [FineMath](https://huggingface.co/datasets/HuggingFaceTB/finemath) 3+ / 4+ | Math web prose filtered for reasoning | 34B / about 10B tokens | ODC-By 1.0, plus Common Crawl terms | Language-model pretraining |
| D4 | OpenWebMath (Paster et al. 2023) | Math web pages | 14.7B tokens | ODC-By 1.0 | Pretraining; deduplicate against D3 |
| D5 | ProofWiki | Definitions and proofs | — | CC BY-SA 3.0 | Proof-style prose |
| D6 | The Stacks Project | Formal proofs | — | GFDL | Proof-style prose |
| D7 | Mathematics Stack Exchange dump | Questions and answers written by learners | — | CC BY-SA 4.0; check current dump-access terms | Learner-style prose |
| D8 | arXiv math metadata (titles, abstracts) | Terminology | — | Metadata is CC0 1.0 | Lexicon, language model |
| D9 | Open textbooks, e.g. OpenStax Calculus | Course vocabulary | — | Per book; keep explicit open licences only | Language model, lexicon |
| D10 | mathlib4 docstrings and comments | Formal-math English | — | Apache 2.0 | Already used for ranks; keep |
| D11 | GitHub Typo Corpus (Hagiwara & Mita 2020); Birkbeck spelling error corpus; WikEd Error Corpus | Real misspelling–correction pairs | — | Check each | Error model |
| D12 | Lemma's 153-symbol catalogue + a TeX command table | Notation aliases | — | Lemma | Notation lane |
| D13 | Learner-choice set (new) | Prefix + candidate, labelled allowed or blocked | At least 2,000 pairs | Lemma | Safety test |
| D14 | Ink sets (see 08) | Strokes | — | Varies | Recognition |

## 2.3 Your data (D1, D2): the only data that decides

### D1. Existing Lemma history

1. Use Lemma's owner export. Keep only text the learner wrote: tutor answers, Pad notes, card fronts and backs, and transcriptions of the learner's handwritten pages. Store tutor questions and replies separately, as context only, never as learner text.
2. For each item, record:
   - timestamp, project and checkpoint
   - source type
   - whether it was typed in the composer
3. Normalize to Unicode NFC. Don't use NFKC: it folds math letters such as ℝ into plain R. Keep explicit TeX spans exactly as written.
4. Split each item into prose spans and math spans. Math spans are explicit `$…$` delimiters, TeX commands and runs of math symbols. Tag identifiers the learner declared, such as "Let f be…" or `x_n`.
5. Count the words. Final text no longer contains typos, so D1 measures completion and notation. Correction needs D2 or simulated noise (§2.6).

### D2. Trial logs

The instrumented test APK (see 03) records:

- keystrokes with tap coordinates
- every suggestion impression and its outcome
- the final sent text

At 20 minutes of tutor writing a day at 30 WPM, that's about 600 words a day, roughly 4,000 a week. Measure the real volume in week 1.

## 2.4 Public corpora (D3–D12)

1. **Keep a licence register.** One row per source: licence, version or dump date, URL, attribution text, and obligations such as share-alike or non-commercial terms.
2. **Prefer clear licences:** ODC-By, CC BY, CC BY-SA, Apache-2.0 and CC0. Exclude anything without an explicit licence.
3. **Filter to prose that contains mathematics.** FineMath's 3+ and 4+ subsets are already filtered. For the other sources, keep pages that contain both math spans and prose.
4. **Remove boilerplate:** navigation, reference lists and code blocks.
5. **Deduplicate across all sources.** Remove exact duplicates (hash of the normalized text) and near-duplicates (MinHash over 5-word shingles, Jaccard similarity of 0.8 or more).
6. **Decontaminate.** Remove any training document that shares a 13-gram with the D1 or D2 test splits. FineMath used the same 13-gram rule against public benchmarks.
7. **Mix by tokens.** Start with this mix and revisit it after the first validation run:

   | Source | Share |
   | --- | ---: |
   | FineMath | 40% |
   | OpenWebMath | 20% |
   | ProofWiki, Stacks and open textbooks | 15% |
   | Mathematics Stack Exchange | 15% |
   | General English (keeps ordinary prose fluent) | 10% |

Mathematics Stack Exchange matters most of the public sources because its questions are written by learners. Its content is CC BY-SA 4.0. Stack Exchange changed how dumps are distributed in 2024, so check the current access terms before downloading.

## 2.5 Turning text into examples (replay)

For every held-out word *w* with preceding context *c*:

1. Take up to 256 tokens of the learner's own text before *w* as the context. Attach the tutor's latest question separately; it's for features only.
2. For each prefix length *p* from 0 to |*w*| − 1, the example is (*c*, first *p* characters of *w*) → *w*.
3. Record the word's category: prose word, math term, function word, identifier, notation alias or protected token. Also record whether it lies inside a math span.
4. Mark learner-choice positions, where *w* is itself a mathematical choice: an operand, a method word after "by", a quantifier. These positions get no completion credit; they feed the tests in 07. The aid earns nothing for predicting the learner's mathematics.
5. Store each record with its source, split, timestamp and hash.

Every engine and model then runs on identical examples, so all comparisons are paired.

## 2.6 Realistic typing noise (for the Correct task)

1. **Error model from real pairs.** Estimate substring-edit probabilities from D11 using the Brill and Moore (2000) method. Keep insertions, deletions, substitutions and transpositions separate, and condition on position within the word.
2. **Spatial model.** Fit a two-dimensional Gaussian to each key's tap offsets from D2's tap coordinates (Bi & Zhai 2013). Until D2 exists, start with one shared Gaussian scaled to the key size.
3. **Generate typed text.** For each intended word:
   1. sample one tap per character from the spatial model
   2. decode each tap to its nearest key to get the typed string
   3. add sampled spelling mistakes at the rate D2 shows, starting from D11's relative frequencies
4. **Validate against D2** once it exists. The simulated distribution of error types and edit distances must match the real one (chi-square test, or report the divergence). If it doesn't match, refit before using it.
5. **Include tokens that must stay unchanged** (the do-not-correct set). False corrections on these are the most damaging errors in math text.
   - abbreviations: iff, wlog, s.t., resp., cf., i.e., e.g.
   - surnames: Cauchy, Lipschitz, Weierstrass, Bolzano, Riemann
   - Greek transliterations: eps, delta
   - TeX commands and declared identifiers
   - deliberate misspellings inside quotes

## 2.7 Notation data (D12)

1. From the TeX in D3–D10, extract command occurrences with their context. Map each command to Unicode through the catalogue, giving (alias, context) → symbol pairs.
2. Add ambiguous words together with their non-math uses ([specification §4.2](https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/docs/implementation/2026-11-21/mobile-math-input.md)):
   - "in": ∈, or the preposition
   - "subset": ⊂ or ⊆
   - "contains"
   - "less than" when "or equal to" may follow
   - "there exists" when "a unique" may follow
3. Label each pair: convert, leave as a word, or offer both.

## 2.8 Learner-choice test set (D13)

1. **Sample prefixes** from real proofs (D1, ProofWiki, Math.SE answers) just before mathematical content: after "by", "let x", "take δ =" or "therefore", and at quantifiers and relations.
2. **Collect candidates** for each prefix:
   - what the current engine and each new engine would display
   - adversarial candidates from a teacher model asked to complete the proof
3. **Label** each (prefix, candidate) pair with the categories in [07 §7.3](07-learner-choice-safety.md#73-taxonomy).
   1. An LLM judge pre-labels every pair, using that table as its rubric.
   2. You label a stratified sample of at least 300 pairs. The judge is used for the rest only if its agreement with you reaches Cohen's κ ≥ 0.8.
   3. You adjudicate every item the judge marks uncertain.
4. **Size:** at least 2,000 pairs, including at least 600 blocked items (§2.10 explains the 600). Freeze and hash the set, and never train on its test half.

## 2.9 Splits and leakage

- **Your data:** split chronologically. The first 60% of days are training, the next 20% validation and the last 20% test, with no day shared between splits. Also hold out one later topic, such as a new chapter, to test vocabulary the model hasn't seen.
- **Public data:** split by document and by site, and deduplicate across splits.
- **Pretraining overlap:** pretrained models have probably seen ProofWiki, Stack Exchange and web math, so public text never serves as the deciding test.
- **Frozen tests:** record each test set's SHA-256 in the protocol file ([06 §6.1](06-evaluation.md#61-one-protocol-file)). Use each test set only for the final comparison of a phase.

## 2.10 How much data is enough

- **Ranking.** Two engines on the same prefixes are compared with McNemar's test. Detecting a 2-percentage-point difference in top-1 accuracy at 5% significance and 80% power needs:
  - about 2,000 word opportunities, if exactly one engine is right on 10% of them
  - about 3,900, if that happens on 20%

  This uses Connor's (1987) formula. It's one to two weeks of your writing, or the existing history.
- **Autocorrect.** To certify a false-correction rate of at most 1% with 95% confidence, you need:
  - at least 299 would-correct events with no errors (the rule of three: the bound is about 3/n)
  - about 474 events with one error
  - about 630 events with two errors
- **Learner-choice filter.** Certifying a leak rate of at most 0.5% needs at least 598 blocked items with none displayed.
- **Ink.** The specification's 0.1% false-insertion gate needs about 3,000 automatic insertions with no error.

## 2.11 Synthetic data: allowed uses

- **Allowed:**
  - training augmentation: learner-style proofs from a teacher model for your courses, and noisy typing from §2.6
  - regression suites; the PR's corpora stay useful here
- **Not allowed:** synthetic data is never the deciding test, and it never certifies safety or autocorrect.
- **Avoid generator artifacts.** Randomize template order and vary length and topic. Run a check that results don't depend on example index: in PR #1738, the cold-start autocorrect errors repeated at the same indices.
- **Label every synthetic record** as synthetic, with its generator version and seed.

## 2.12 Data cards and governance

- Each dataset gets a data card (Gebru et al. 2018) recording:
  - source, licence and collection method
  - size and splits
  - intended uses
  - known gaps, such as mathlib4's formal register or FineMath's web register
  - whether it contains personal data
- Your data stays on the phone or your own computer.
- Sending any of it to a cloud model, for example for labelling, needs your explicit approval each time and should include only the text needed.
