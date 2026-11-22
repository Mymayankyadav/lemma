# 11. Scribe: a custom, LaTeX-native prediction model

**Status:** candidate architecture, 21 November 2026.

You set the direction: train our own small model from scratch on math-only data, use reinforcement learning and every feedback signal the app produces, and fit within free compute (Kaggle, Colab). Scribe follows that. It replaces L3 in [04](04-models-and-methods.md). The pretrained models (L4) and pruning become a later comparison track ([14 §14.7](14-scribe-free-compute.md#147-pruning-a-pretrained-model-later-comparison)). This document is a specification, not code.

Companion files:
- [12](12-scribe-dataset.md): training data
- [13](13-scribe-rl-and-feedback.md): reinforcement learning and feedback
- [14](14-scribe-free-compute.md): training on free GPUs

## 11.1 What Scribe has to do

| Job | Example | Learner-choice category (07) |
| --- | --- | --- |
| Finish a prose word | `contrad` → contradiction | A1 |
| Finish or fix a LaTeX command | `\vare` → `\varepsilon`; `\alpah` → `\alpha` | A1, A2 |
| Close an open structure | `\left(` … → `\right)`; `\begin{align}` … → `\end{align}`; a missing `}` | Structure only, allowed |
| Insert a template with empty slots | `\frac` → `\frac{□}{□}` | A7 |
| Convert typed shorthand | `x_n -> 0` → `x_n \to 0` | A4 |
| Reuse the learner's own identifiers and conventions | `\varep` → `\varepsilon` rather than `\epsilon` because that's what the learner writes; `f_` → `f_n` | A6 |
| Decode taps | A tap between `a` and `s` resolved by context | A2 |
| Predict the keyboard page | About to type a Greek letter → offer the Greek page | Interface only |
| Decide what to show and when | Slate, show or hide, continuation length | Policy, learned by RL (13) |
| Decide automatic correction | Apply, suggest or leave | Certified, never explored |
| Predict math content (capability) | `\lim_{n \to` → `\infty` | B1–B7: trained and measured, but not displayed in tutor answers (§11.12) |

## 11.2 Eight layers

1. **Deterministic front end:** a lexer and parser for the KaTeX dialect, identifier and convention trackers, and the keyboard's geometry.
2. **Inputs:** the token stream with side streams, typed-prefix characters with tap offsets, language statistics, feedback state, and topic.
3. **Backbone:** a hybrid short-convolution and attention network trained from scratch.
4. **Expert mixture:** the backbone's language-model head plus basic language models, combined by a learned gate. The basic models are an n-gram model, an ∞-gram over your own writing, a character model, a cache, a copy model and a grammar.
5. **Heads:** completion, tap decoding, structure, keyboard page, learner-choice risk, reward, policy, value, uncertainty and autocorrect.
6. **Safety wrapper:** rules and the risk head remove candidates before the policy chooses.
7. **Policy:** reinforcement learning chooses the slate, whether to show it, and how long a continuation to offer.
8. **Personal state:** posteriors, counts and adapters learned from your use.

## 11.3 Deterministic front end

Lemma renders math with KaTeX 0.16.47 through `src/lib/render/render.js`, and the front end speaks exactly that dialect:

- `$…$` inline and `$$…$$` display math
- `\begin{…}…\end{…}` environments
- document macros from `\newcommand` and `\DeclareMathOperator`
- `strict: 'ignore'`

It has these parts:

- **Lexer.** It updates on every keystroke and tracks these states:
  - prose, inline math, display math, and `\text{…}` inside math
  - a command name being typed, and argument *k* of command *c*
  - an environment name, a subscript or superscript, and a `\left` … `\right` pair
- **Pushdown stack** of open braces, delimiters and environments, each with its expected closer.
- **Arity table** built from the installed KaTeX function and macro definitions (required and optional arguments), plus Lemma's own macros.
- **Valid-next-token mask:** the grammar expert in §11.6.
- **Validation.** A fast validator checks every suggestion: balanced braces, known commands and correct arity. Anything structural also gets a full KaTeX parse with `throwOnError: true` and the same options and macros as `render.js`, before it is displayed.
- **Identifier tracker.** It records the names the learner introduced in this answer, such as `Let $x$…`, `$f_n$` or `$\varepsilon > 0$`, with their positions.
- **Convention tracker.** For each variant group, it counts what the learner actually writes:
  - `\le` / `\leq` and `\ge` / `\geq`
  - `\epsilon` / `\varepsilon` and `\phi` / `\varphi`
  - `\to` / `\rightarrow`
  - `\mathbb{R}` / `ℝ`
  - `\colon` / `:`

  `\subset` and `\subseteq` mean different things, so they are a choice, not a convention (07, B7).
- **Keyboard model.** The custom keyboard's key geometry and pages: letters, digits, and the catalogue categories Logic, Sets, Relations, Maps, Analysis, Number sets and Greek. It gives the tap cost of every character, page switches included, so savings are counted in real taps. On a phone, `\`, `{`, `}`, `^` and `_` usually cost more than a letter.

## 11.4 Inputs

Each token's backbone input is the sum of these embeddings:

| Embedding | Values | Why |
| --- | --- | --- |
| Token | A 16,384-entry vocabulary ([12 §12.5](12-scribe-dataset.md#125-the-scribe-tokenizer)), tied with the output layer | Standard |
| Dual form | A glyph token (∈) and its command token (`\in`) share a base vector, plus a form vector | Lemma uses Unicode in prose and TeX in math; knowledge transfers between the two |
| Spelling hash | Sum of hashed character 3–5-gram vectors in 4,096 buckets (fastText style: Bojanowski et al. 2017) | `\alpah` lands near `\alpha`; robust to typos and rare words |
| Span type | Prose, inline math, display math, text in math, command name, argument, environment name, subscript or superscript | The same token means different things in different modes |
| Depth | Brace and delimiter depth, bucketed 0–7 | The model doesn't have to learn structure from scratch |
| Structure role | Opener, closer, argument start, separator (`&`, `\\`), none | Same |
| Provenance | Typed, accepted, automatic, pasted, tutor context | Accepted text is weaker evidence (the PR's rule); the model learns the difference |
| Topic | One prefix token from a small taxonomy, such as the top level of MSC2020, derived from the Lemma project and checkpoint | Course vocabulary; the app already knows it, and it reveals no answer |

These inputs stay outside the backbone:

- **Typed-prefix encoder.** A tiny character model, a 1-D convolution or GRU of about 50,000 parameters. It reads the characters typed so far in the current token, with each tap's offset from the key centre and its distance to neighboring keys. Its output, the prefix vector, feeds the completion and tap-decoding heads.
- **Language-statistics vector** (§11.8) and **feedback-state vector** (§11.9). These feed the gate, the heads and the policy, not the backbone. The backbone therefore trains on plain text, while decisions can use everything.

## 11.5 Backbone

The backbone is deep and thin, mixes gated short-convolution blocks with grouped-query attention blocks, and is trained from scratch.

- **Convolution block:** RMSNorm → input projection to a gate and a value → causal depthwise convolution (kernel 4–7) → gate × value → output projection → SwiGLU MLP.
- **Attention block:** RMSNorm → grouped-query attention with rotary positions and QK-norm → SwiGLU MLP. QK-norm stabilizes attention logits (Dehghani et al. 2023), which helps with T4's fp16 training.
- **Pattern:** three convolution blocks, then one attention block, repeated.

**Why this design:**

- LFM2's hardware-in-the-loop search found that gated short convolutions, with a small minority of attention layers, are enough under edge latency and memory limits (Liquid AI 2025).
- Convolution blocks keep a fixed-size state while streaming, with no growing cache, which is cheap on a phone CPU.
- The few attention blocks keep long-range lookups, such as a variable declared three lines earlier or the `\end` that matches a `\begin`.
- For sub-billion models, deeper-and-thinner networks, embedding sharing and grouped-query attention do more per parameter (MobileLLM: Liu et al. 2024).

| Size | Blocks (conv + attention) | Width | Heads / KV heads | MLP hidden | Parameters | int8 file | Multiply-adds per token |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Scribe-S | 12 (9 + 3) | 256 | 4 / 2 | 683 | ≈ 13M | ≈ 13 MB | ≈ 13M |
| Scribe-M | 16 (12 + 4) | 384 | 6 / 2 | 1,024 | ≈ 32M | ≈ 32 MB | ≈ 32M |
| Scribe-L | 20 (15 + 5) | 512 | 8 / 2 | 1,365 | ≈ 65M | ≈ 65 MB | ≈ 65M |

Notes:

- Parameter counts include the tied 16,384 × width embedding.
- Training uses a 512-token context; inference uses 256.
- **Scribe-S option:** share weights between adjacent blocks (MobileLLM's block-wise sharing) to double the depth with no extra memory.
- **Ablation baseline:** a plain transformer with the same parameter count.

## 11.6 Expert mixture: basic language models inside the architecture

| Expert | What it is | Strength |
| --- | --- | --- |
| E1 Scribe language model | The backbone's next-token distribution | General fluency, structure, long context |
| E2 n-gram | A 4-gram over Scribe tokens, built with KenLM on the same corpus | Exact local statistics, instant |
| E3 ∞-gram of your writing | A suffix array over everything you've typed, giving continuation counts for the longest match. This is the infini-gram idea (Liu et al. 2024) at personal scale. | Your repeated phrasing and notation |
| E4 Character model | Built from the typed-prefix encoder | Partial tokens and unseen words |
| E5 Cache | Decayed unigram and bigram counts of your text | Terms that recur within an answer |
| E6 Copy | A pointer over tokens in the current answer and the declared identifiers, gated by a sentinel (Merity et al. 2017) | Reusing `x_n`, `f` or `\varepsilon` exactly |
| E7 Grammar | The parser's valid-next-token mask and structural prior | Never suggests invalid LaTeX |
| E8 Tutor wording | Lexical matches from the allowed tutor roles only ([07 §7.5](07-learner-choice-safety.md#75-what-tutor-hints-may-do)) | Course vocabulary |

How they combine:

- **E7 is a hard mask.** Tokens it rules out are never offered.
- **A gate mixes the rest per token.** It is a small network of about 50,000 parameters that reads the language statistics (§11.8):
  - each expert's entropy
  - the ∞-gram match length
  - cache hits
  - span type, depth and provenance

  It outputs mixture weights. This follows the mixture-of-distributions language model of Neubig and Dyer (2016) and the pointer-sentinel gating of Merity et al. (2017).
- **The gate trains offline** on held-out data, with the experts frozen.
- **On the phone, the gate adapts to you** with the fixed-share algorithm for tracking the best expert (Herbster & Warmuth 1998):
  1. After each word, multiply every expert's weight by the probability it gave the true word.
  2. Redistribute a small share of the total weight evenly.

  This needs no gradients and no tuning, and it keeps tracking the best expert even when the best one changes.

## 11.7 Heads

| Head | Input | Output | Trained on |
| --- | --- | --- | --- |
| H1 Next token | The mixture | Distribution over the vocabulary | Language-model data |
| H2 Completion | Context vector, prefix vector and candidate embedding (two towers) | A score for each candidate word or command from the lexicon, the command trie and the identifiers | Replay examples ([12 §12.6](12-scribe-dataset.md#126-side-streams-and-task-formats)) |
| H3 Tap decoder | Typed characters, tap offsets and context | Posterior over intended tokens: a neural spatial model fused with H1 | Synthetic taps first, then your real taps |
| H4 Structure | Parser state and context | The next closer, next argument, or a template with □ slots | Labels derived by the parser |
| H5 Keyboard page | Context | P(next token is math); the next page: letters, digits, Logic, Sets, Relations, Maps, Analysis, Number sets, Greek | Labels derived from text and catalogue categories |
| H6 Learner-choice risk | Context and candidate | P(blocked category B1–B7) | D13, plus weak labels from the parser |
| H7 Reward model | State, candidate and slot | P(accept), expected taps saved, P(undo) | Logs (13) |
| H8 Policy | State and candidate set | Slate scores, show or hide, continuation length | Logs, via off-policy RL (13) |
| H9 Value | State | Expected remaining reward within the word | Logs, via offline RL (13) |
| H10 Uncertainty | A 4-member ensemble of heads on H2 and H7 | Disagreement between members | The same data, with different seeds and subsets |
| H11 Autocorrect | Correction features ([04 A1](04-models-and-methods.md#46-automatic-correction-decision)) | Calibrated P(correction wanted) | Shadow logs, with a certified threshold ([05 §5.10](05-training.md#510-autocorrect-decision-and-certified-thresholds-a1)) |

Together the heads add roughly 0.5–1.5M parameters.

## 11.8 Language statistics the model uses

| Statistic | Definition | Used by |
| --- | --- | --- |
| Predictive entropy | Entropy of H1, and of each expert, at this position | Gate, policy, continuation stop |
| Top-2 margin | p₁ − p₂ | Policy, autocorrect |
| Expert disagreement | Jensen–Shannon divergence between experts | Gate, abstention |
| Prefix surprisal | −log P(typed prefix) under the character model | Typo detection |
| Match length | Longest suffix match in the ∞-gram and the n-gram | Gate |
| Frequency | Zipf frequency in the math corpus and in your text | Ranking |
| Burstiness | Recency-weighted count within this answer | Ranking |
| Structure | Depth, open structures, current argument, length of the current math run | Grammar, structure head, policy |
| Identifier inventory | Count and recency of declared identifiers | Copy expert, risk head |
| Convention posterior | Dirichlet counts for each variant group | Ranking |
| Typing rhythm | Inter-key interval as a z-score against your own distribution; pauses above your 80th percentile; backspace bursts | Policy: a hesitation can mean "I might want help" |
| Feedback state | Acceptance rate (moving average), ignore streak, refreshes, undos, time since the last accept | Policy, reward model |
| Context | Surface (tutor answer or Pad), mode (Strict, Balanced, Faster), keyboard page, orientation, topic | Policy |

## 11.9 Every feedback signal, and what it teaches

| Signal | Meaning | Trains |
| --- | --- | --- |
| Tap to accept (slot, latency) | Strong positive | H7, H8, KTO and DPO positives, Thompson posterior |
| Shown but not tapped | Weak negative, scaled by how likely you were to have looked | Bayesian ignore update ([13 §13.6](13-scribe-rl-and-feedback.md#136-untapped-suggestions-the-bayesian-ignore-update)), unlikelihood negatives, H7 |
| Refresh | The displayed set was rejected | H7, H8, ignore update with high examination probability |
| Dismiss (X) | Explicit rejection | Same, with more weight |
| Keep what I typed | A correction was rejected | H11; the pair's permission is revoked |
| Undo after accept (latency) | Strong negative | H7, H8, negatives |
| Edit after accept | Partial negative | H7 |
| Kept until send | Weak positive confirming the accept | H7 |
| Backspace right after an automatic change | Strong negative | H11, certification |
| Final text | The intended token at every position | Labels for H1–H6; offline replay |
| Hesitation pauses | Need for help, or uncertainty | Policy features |
| Keyboard page switches | Where the math/prose boundaries really fall | H5 |
| Symbol catalogue searches and drawing-pad use | Typing failed to deliver a symbol | H2 and H5, as missed opportunities |
| Long-press "Don't suggest" or "Always correct" | Explicit labels | H6, H7 and H11; permissions |
| Weekly review answers | Labelled automatic corrections | H11 certification |
| Session rating | Satisfaction | Reported, not optimized directly |

**Never used:** whether the tutor judged the answer correct. Rewarding correctness would teach the model to steer the mathematics. The PR kept truth as an audit label for the same reason.

## 11.10 Seven ways entropy is used

1. **Confidence signal.** Low entropy and a wide margin allow showing a suggestion earlier. High entropy means wait, or show alternatives.
2. **Continuation stop rule.** A ghost continuation extends only through low-entropy tokens, such as closing braces, `\right)` or `\end{align}`, and stops at the first high-entropy token. In math, high-entropy positions are usually genuine choices, so this lines up with the learner-choice rule. The risk head and rules still check every token.
3. **Diversity after untapped suggestions.** The Bayesian ignore update lowers what was ignored and raises the entropy over what's left, so the next slate naturally covers other word families ([13 §13.6](13-scribe-rl-and-feedback.md#136-untapped-suggestions-the-bayesian-ignore-update)).
4. **Slate coverage.** Pick three candidates that cover the most probability mass across distinct families. A determinantal point process is the principled way to trade quality against diversity (Kulesza & Taskar 2012).
5. **Maximum-entropy RL.** The policy's objective adds an entropy bonus, with its temperature tuned automatically towards a target entropy (Haarnoja et al. 2018). The policy keeps exploring instead of collapsing onto the same rejected suggestions.
6. **Information-directed exploration.** When two families are close, show one of each, so your tap tells the model which you meant (Russo & Van Roy 2014).
7. **Calibration.** A confidence penalty during training keeps the entropies honest, so thresholds mean what they say (Pereyra et al. 2017).

## 11.11 What happens on each keystroke

1. **Every key event.** The lexer, trackers and prefix encoder update, in under 1 ms.
2. **At token boundaries only.** Run one backbone step from the cached state, update the experts, and cache the mixture. In the gap before the next key, about 400 ms at 30 WPM, precompute the lists for the two or three most likely next characters.
3. **Every keystroke.**
   - Filter the cached distribution by the typed prefix, both exactly and through the tap decoder.
   - Score up to 50 candidates with H2.
   - Apply the ignore update.
4. **Safety wrapper.** Apply the rules, then H6, then the fast validator. Structural templates also get a full KaTeX parse.
5. **Policy.** H8 chooses show or hide, the slate and the continuation length, using a Thompson sample with an entropy floor.
6. **Render and log** the impression with its propensities.

**At separators:** H11 decides on a correction, against the certified threshold and your permission for that pair.
**On pauses:** an optional constrained continuation ([04 F1](04-models-and-methods.md#47-phrase-and-scaffold-completion)).

## 11.12 Showing math content: your decision

Scribe will be trained to predict LaTeX content well, because that is what makes it good at LaTeX at all. Whether its content predictions are ever displayed (categories B1–B7, such as `\infty` after `\lim_{n \to`) is a product rule, not a property of the model.

Your 21 November specification says no in tutor answers. **Recommendation:** keep that. If you want content prediction somewhere, allow it only on a surface that isn't assessed, such as Pad notes or card drafting. Put it behind its own switch, label it "prediction", and log it the same way.

## 11.13 The Scribe family

- **Scribe-Core:** the backbone plus H1, which together are the language model.
- **Scribe-Mix:** Scribe-Core plus the experts and the gate.
- **Scribe-Policy:** H7–H10 plus the bandit and RL layer.
- **Scribe-Ink (optional):** a stroke encoder trained contrastively so that drawn symbols land next to Scribe's own symbol and command embeddings. A new catalogue symbol then needs only a few examples. It reads ink only, never the math context (specification §7.3).
- **Scribe-Teacher (optional):** a larger custom model of about 100–150M parameters, trained on the same math-only data if TPU time is available. It is used only to distill into Scribe-M ([14 §14.6](14-scribe-free-compute.md#146-optional-tpu-for-a-teacher)).
- **Scribe-Personal:** low-rank adapters trained weekly on your own text ([14](14-scribe-free-compute.md)).

## 11.14 More ideas

1. **Templates with □ slots for structure:** `\frac{□}{□}`, `\sum_{□}^{□}`, `\lim_{□ \to □}`, `\begin{cases} … \end{cases}`. They use the composer's existing slot navigation, and the slots stay empty.
2. **Keyboard-page chip.** When H5 predicts Greek with high probability, a one-tap chip jumps to that page. Switching the page automatically is a later RL experiment.
3. **Shortcut discovery.** Find LaTeX sequences you type often, such as `\mathbb{R}` or `\varepsilon > 0`, and offer to make a personal alias like `RR`. Once you approve one, typing it is an explicit request (07, A3).
4. **Convention memory.** If you always write `\varepsilon`, then `\vare` and `eps` resolve to it, with the alternative kept in slot 3.
5. **Rendered chips.** Show the KaTeX-rendered glyph inside the suggestion, so recognizing it takes less attention.
6. **Hesitation-aware help.** A long pause in the middle of a command opens more alternatives; fast typing gets fewer interruptions.
7. **Tap-cost ranking.** Savings are counted in taps on Lemma's keyboard, so a LaTeX command that needs page switches ranks higher than its character count suggests.
8. **Typo pre-emption.** A surprisal spike in the character model prepares the correction before the separator arrives.
9. **Speculative lists** computed during the gap between keys (§11.11).
10. **Utility-weighted training loss.** Weight each token by the taps a correct prediction would save. This is an ablation in 14.
11. **Personal ∞-gram.** Your own phrasing comes back exactly, subject to the same filters as everything else.
12. **Uncertainty-aware abstention.** When the ensemble disagrees, lists are suppressed.
13. **Unicode ↔ LaTeX dual training,** so prose and math forms share knowledge.
14. **Course-aware topic token** taken from the Lemma checkpoint.
15. **Missed-opportunity mining.** Every catalogue search or drawing-pad use after typing failed is a labelled example of what completion should have offered.

## 11.15 Out of bounds

- Ink identity never uses the math context.
- Answer correctness is never a reward.
- No exploration on automatic corrections or on the learner-choice filter.
- Tutor proof, solution and hint content is never a source.
- Nothing leaves the phone except your explicit exports.
