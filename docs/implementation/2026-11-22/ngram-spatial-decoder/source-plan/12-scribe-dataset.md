# 12. Scribe training data: preparation

## 12.1 Principles

- **Math-only and LaTeX-rich, close to how a learner writes.** Narrow-domain data lets small models do well. TinyStories showed that models of 1–30M parameters become fluent when trained on a narrow corpus (Eldan & Li 2023). At small scale, data quality outweighs quantity (Gunasekar et al. 2023).
- **Your writing is the target distribution.** Public data is selected for its similarity to it.
- **Repetition is cheap.** Repeating high-quality data for up to about four epochs costs almost nothing compared with fresh data (Muennighoff et al. 2023), so 2–3B well-chosen tokens are enough.
- **No GPU time on preparation.** Every step here runs on a CPU, on your own machine or in a Kaggle CPU notebook, so the GPU quota goes only to training.

## 12.2 Sources

| Source | Why | Licence | Planned share after selection |
| --- | --- | --- | --- |
| OpenWebMath (`open-web-math/open-web-math`) | Math web pages with LaTeX extracted from MathJax and KaTeX | ODC-By 1.0 | ~40% |
| FineMath 4+ (`HuggingFaceTB/finemath`) | Reasoning-heavy math web text. Check how each sample encodes formulas, and keep pages that carry LaTeX | ODC-By 1.0, plus Common Crawl terms | ~25% |
| Proof-Pile v1 (`hoskinson-center/proof-pile`): ProofWiki, Stacks, Math.SE, open textbooks, Wikipedia math | Proof-style and learner-style text with `$…$` LaTeX | Per subset: ProofWiki CC BY-SA 3.0, Stacks GFDL, Math.SE CC BY-SA 4.0. Skip the arXiv subset | ~25% |
| mathlib4 docstrings | Formal-math English with `$…$` | Apache 2.0 | ~2% |
| General English (optional), e.g. a FineWeb-Edu sample | Fluent everyday prose | ODC-By | 0–5%, decided by an ablation |
| Your Lemma export (D1) | The target | Your own data | Fine-tuning stage, upweighted |
| Trial logs (D2) | Feedback, taps, corrections | Your own data | Heads and policy |
| KaTeX 0.16.47 function and macro tables, plus Lemma's macros | Command vocabulary and arity | MIT / Lemma | Tokenizer, grammar |
| Lemma's 153-symbol catalogue | Glyph↔TeX pairs, aliases, categories | Lemma | Tokenizer, dual forms, labels for H5 |

## 12.3 Selection: keeping only useful data

1. **Language:** keep English, using fastText language identification.
2. **Math density:** keep documents with at least 3 math spans per 1,000 words and at least 30% prose characters. Learner text mixes both.
3. **Similarity to your writing:** use the Moore–Lewis cross-entropy difference (Moore & Lewis 2010).
   1. Train two small n-gram models: a "target" model on your text plus Math.SE and ProofWiki, and a "general" model on a random sample of the pool.
   2. Score each document by the general model's cross-entropy minus the target model's, per token.
   3. Keep the top-scoring documents until the token budget is filled.

   DSIR's hashed-n-gram importance resampling (Xie et al. 2023) is a faster alternative at this scale.
4. **Topic weighting:** tag documents with a small taxonomy (Math.SE tags, ProofWiki categories, the top level of MSC2020) and upweight the topics in your Lemma projects, such as real analysis.
5. **Remove:** code blocks, tables, reference lists, navigation, and formulas longer than 512 characters.
6. **Deduplicate:**
   - documents with MinHash over 5-word shingles, at Jaccard similarity 0.8 or more
   - identical formulas, capped at 50 copies so the model doesn't memorize boilerplate
7. **Decontaminate:** drop any document that shares a 13-gram with your validation or test splits.

Stream each source and filter it on the fly. Never store a full raw corpus.

## 12.4 LaTeX normalization

1. **Delimiters:** convert `\(…\)` to `$…$` and `\[…\]` to `$$…$$`, which are what Lemma's renderer uses. Keep `\begin{…}` environments as they are.
2. **Macros:** expand `\newcommand`, `\renewcommand`, `\def` and `\DeclareMathOperator` the way `render.js` treats document macros. Drop documents whose macros can't be expanded.
3. **Validation:**
   - Run a fast validator on every span: balanced braces, known commands, correct arity.
   - Run a full KaTeX parse in Node, with Lemma's options, on your own data, every evaluation set, and a 5% sample of everything else. The sample measures the error rate that remains.
   - Put invalid spans into a separate pool that is used for correction training.
4. **Variants stay as written.** `\le` and `\leq` both survive. Each one gets a variant-group id for the convention tracker.
5. **Whitespace:** collapse it inside math, but keep spacing commands such as `\,` and `\quad`.
6. **Unicode in prose:** keep it. Each glyph also gets its TeX twin, for dual-form training (§12.6).

## 12.5 The Scribe tokenizer

**Pre-tokenization**, done deterministically before any pieces are learned:

- **Inside math:**
  - Every command (`\varepsilon`), control symbol (`\,`, `\{`, `\\`), brace, `^`, `_`, `&`, operator and bracket is one token.
  - Digits are split, one per token.
  - Single letters are single tokens, since they're usually variables.
  - A run of letters such as `sin` is split into separate letters, so that the correction to `\sin` can be learned.
- **In prose:** words first, then SentencePiece unigram pieces (Kudo & Richardson 2018) that prefer whole words.

**Vocabulary**, 16,384 entries in total:

| Part | Entries |
| --- | ---: |
| KaTeX commands seen in the corpus, all forced to be single tokens | about 1,200 |
| Glyphs and structural tokens | about 300 |
| Digits, letters and punctuation | about 200 |
| Prose pieces, mostly whole words | about 14,500 |

Byte fallback covers anything else.

**Special tokens:**

- document separator
- fill-in-the-middle markers
- `$` and `$$`
- the slot glyph `□`
- task markers for completion, correction and conversion
- topic tokens
- tutor-role markers: prompt, given, suggested wording

**Check:** measure tokens per character on your own text, for prose and math separately. Commands must be single tokens. If math fertility on your text is above about 0.6 tokens per character, adjust the tokenizer.

## 12.6 Side streams and task formats

Each token carries one packed byte of side information:

| Field | Bits |
| --- | ---: |
| Span type | 3 |
| Depth bucket | 3 |
| Provenance, or a synthetic-noise flag | 2 |

The parser recomputes structure roles at load time.

The data loader builds the training formats on the fly from the same shards, so they need no extra storage:

| Format | Share of steps | What it teaches |
| --- | ---: | --- |
| Plain language modelling | 65% | Prose and LaTeX prediction |
| Fill-in-the-middle, biased to math spans | 15% | Completing inside `\frac{…}{…}`; closing structures when the caret sits inside a draft |
| Noisy context → clean target | 10% | Typos in words and commands: a missing backslash, transpositions, `x^10` for `x^{10}`, `sin` for `\sin`, `<=` for `\le`, an unbalanced `\left(` |
| Shorthand → LaTeX | 5% | Conversion. Pairs come from a rule-based "de-LaTeX" pass that writes formulas the way a learner might type them: `\frac{a}{b}` → `a/b`, `\le` → `<=`, `x_{n}` → `x_n`, Greek letters → their names |
| Dual form | 5% | The same sentence written with glyphs and with TeX |

**Auxiliary labels** all come from the parser and the catalogue:

- whether the next token is math or prose
- the next keyboard page
- the next closer and the argument index
- template boundaries

**Learner-choice weak labels:** each math token is labelled as structure, convention, reuse of a declared identifier, or new content.

**Completion and tap-decoder examples** come from replay ([02 §2.5](02-datasets.md#25-turning-text-into-examples-replay)), with synthetic taps from the spatial model ([02 §2.6](02-datasets.md#26-realistic-typing-noise-for-the-correct-task)). Your real taps replace them once logs exist.

## 12.7 Feedback datasets (once the trial APK is logging)

| Dataset | Rows | Used for |
| --- | --- | --- |
| Bandit tuples | State features, slate shown, propensities, outcomes, reward | H7, H8, off-policy learning |
| Within-word trajectories | The sequence of (state, action, reward) for each word | H9, offline RL |
| Binary feedback | Context, candidate, desirable or undesirable, weighted by examination probability | KTO |
| Pairs | Context, accepted candidate, ignored candidate | DPO |
| Negatives | Context, and an ignored candidate that wasn't the final word | Unlikelihood |
| Simulator calibration | Slot examination, acceptance by characters remaining, attention cost, recovery time | The user simulator ([13 §13.7](13-scribe-rl-and-feedback.md#137-the-user-simulator-warm-starts-only)) |

All of these come from the event log in [03](03-feedback-and-logging.md). Weights and propensities are logged at display time.

## 12.8 Splits, storage and versioning

**Splits** follow [02 §2.9](02-datasets.md#29-splits-and-leakage):

- your data is split chronologically
- public data is split by document
- Math.SE is also split by post date, with the newest posts held out

**Storage**, about 3 bytes per token (3B tokens ≈ 9 GB):

| File | Contents |
| --- | --- |
| `tokens/shard_NNNN.bin` | Token ids, uint16 |
| `side/shard_NNNN.bin` | Side stream, uint8 |
| `index.json` | Document offsets |
| Tokenizer model and vocabulary | — |
| `manifest.json` | Source versions, filters, hashes |

**Versioning:**

- Publish the data as a private Kaggle Dataset version, and record the version id in every experiment.
- Keep checkpoints in a private Hugging Face model repository, or as Kaggle Dataset versions, never in git.
- Only the final int8 asset goes into the app, following the pattern in [05 §5.13](05-training.md#513-packaging).

## 12.9 Quality checks before any GPU time

- Read 200 random documents per source.
- Measure the KaTeX-valid rate per source (on the sample), the command frequency table, and the distribution of formula lengths.
- Compare the distributions of math density and prose share against your own text.
- Measure tokenizer fertility on your text.
- Confirm no 13-gram is shared between training data and your test split.
- Confirm each source's size after selection matches its planned share.

## 12.10 Token budget

| Pool | Tokens after selection |
| --- | --- |
| OpenWebMath | 0.8–1.2B |
| FineMath 4+ | 0.5–0.8B |
| Proof-Pile v1, without arXiv | 0.5–0.8B |
| mathlib4 docstrings | about 0.03B |
| General English (optional) | 0–0.15B |
| **Total** | **2–3B** |

Scribe-M sees the total about once; the learner-style part, up to four times.

## 12.11 CPU time (estimates)

| Step | Time |
| --- | --- |
| Filtering and selection over the streamed sources | Hours, on 4 cores |
| Tokenizing 3B tokens | 1–4 hours |
| KaTeX validation of the samples in Node | Under an hour |

This fits in Kaggle CPU sessions, which last up to 12 hours, or on your own machine.
