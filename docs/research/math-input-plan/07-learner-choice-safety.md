# 7. Learner-choice safety

## 7.1 The rule

The aid may help the learner write what they have already decided. It may never supply a mathematical proposition or choice they haven't made, however easy that next step looks. This is the enforceable rule from your [21 November specification §4.1](https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/docs/implementation/2026-11-21/mobile-math-input.md).

## 7.2 Why

- **Suggestions change content.** In a within-subjects study with 109 participants, captions written with predictive suggestions were shorter and contained fewer words the system didn't predict (Arnold et al. 2020). In a tutor, steering the content means giving away the answer.
- **Producing material yourself aids learning.** Information people generate themselves is remembered better than information they only read (the generation effect: Slamecka & Graf 1978). Effortful retrieval and production are "desirable difficulties" (Bjork 1994). A completion that writes the next step removes exactly the effort the exercise exists to create.
- **The PR has already seen the failure mode.** The research audit found possible new mathematical ideas in 9 of 73 Fast offers, and Faster mode offered `because` after `b` 48 times before a guard was added.

## 7.3 Taxonomy

| Category | Example (typed → offered) | Decision |
| --- | --- | --- |
| A1 Finish the word being typed | `prei` → preimage; `contrad` → contradiction | Allowed |
| A2 Fix a typo in the word being typed | `homomorphsim` → homomorphism | Allowed |
| A3 Notation for an alias the learner typed | `for all` → ∀; `\le` → ≤; `eps` → ε | Allowed |
| A4 Reformat a line whose content is all supplied | `let x in A` → Let x ∈ A. | Allowed |
| A5 Neutral function word at a word boundary | the, of, is | Allowed; Strict may abstain |
| A6 An identifier the learner already declared, after a typed prefix | `f_` → f_n (declared earlier in the answer) | Allowed |
| A7 A scaffold the learner selected | Let □ ∈ □. | Allowed, with slots left empty |
| B1 Proof method | `by ` → induction, contradiction | Blocked |
| B2 Operand, domain or witness | `let x` → x ∈ ℝ; `take δ =` → ε/2 | Blocked |
| B3 Change of quantifier, polarity or connective | `if` → if and only if; `suppose` → not | Blocked |
| B4 Claim or conclusion | `therefore` → f is continuous | Blocked |
| B5 Content from the tutor's proof, solution or hint roles | Any | Blocked |
| B6 Logical connective after a weak prefix | `b` → because | Blocked, unless the prefix is strongly typed (e.g. `becau`) |
| B7 Silently choosing a convention | `subset` → only ⊂ | Blocked; offer both ⊂ and ⊆ |

## 7.4 Enforcement layers

1. **Generation constraints.** Candidates come only from approved transformation classes (A1–A7). Language models score candidates; they never invent them, apart from F1's grammar-bounded wording.
2. **Deterministic rules.** Keep all the PR's guards: weak-prefix connectors, variable-slot protection, untrusted tutor roles, and limits on output length.
3. **Learner-choice classifier (S1).** It removes candidates whose predicted risk exceeds its certified threshold ([05 §5.12](05-training.md#512-learner-choice-classifier-s1)), and it can only remove.
4. **Validate before display.** A visible suggestion can already reveal a proof step (specification §4.4), so checks run before painting, not just before insertion.
5. **Audit trail.** Every impression logs its category and the rule that admitted it ([03 §3.2](03-feedback-and-logging.md#32-events)).

## 7.5 What tutor hints may do

- Supply vocabulary that helps complete a word already being typed. For example, "primality" when the learner has typed `prim`.
- Supply exact wording only from the suggested-wording role, and only after a substantial learner prefix.
- Never supply content from the proof, solution or hint roles. Role labels are untrusted: the PR already treats a mislabelled proof step as a proof step, and that stays.
- Prove any benefit on your real tutor transcripts. In the PR, every tutor-sourced event came from one repeated authored pattern, so the fixture showed nothing.

## 7.6 Test sets and metrics

| Test | Contents | Pass |
| --- | --- | --- |
| D13 test half ([02 §2.8](02-datasets.md#28-learner-choice-test-set-d13)) | At least 600 blocked items from real proofs, labelled by you and a validated judge | 0 displayed; Clopper–Pearson upper bound ≤ 0.5% |
| PR regression suites | `adversarial-safety.json`, `fresh-connectors.json`, regression probes | Unchanged pass |
| Red team | A teacher model writes prefixes designed to elicit B1–B7 for each new engine | 0 displayed on a fresh batch of at least 300 |
| Weekly sample | 50 displayed suggestions from math spans in your real use, reviewed by you | 0 blocked categories |

## 7.7 Monitoring in use

- **Track** the share of math-span characters inserted by the aid, and the share of accepted suggestions in categories A4–A7.
- **Watch for drift:** if either rises sharply after a model change, review it before continuing.
- **Stop on any leak:** a confirmed blocked-category display in real use stops that engine and returns to the previous one until it is re-certified.
