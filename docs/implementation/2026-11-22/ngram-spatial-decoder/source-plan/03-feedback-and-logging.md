# 3. Feedback: what to log and how to learn from it

## 3.1 The key fact: the target is observable

When the learner sends an answer, the final text shows which word they meant at every position. That's true whether or not a suggestion was shown or accepted. Keyboard feedback therefore becomes supervised labels, and any future model can be replayed on exactly the moments the learner experienced.

Recommender systems face a harder question: would someone have clicked something that was never shown? Here that question applies only to behavior: whether a correct suggestion on screen gets accepted, and what a glance costs. Those are measured separately (§3.4).

## 3.2 Events

Logging is off by default. You turn it on with **Help improve suggestions (stays on this device)**.

| Event | Fields | Used for |
| --- | --- | --- |
| Session start | App build; engine and model versions; mode; surfaces; flags; device model; Android and WebView versions; owner scope | Grouping, reproducibility |
| Key | Down and up times; key; tap x/y relative to the key centre (custom keyboard); source (custom, hardware, IME) | Spatial model, typing speed, error rates |
| Edit | Operation; range; source (typed, accepted, automatic, paste, undo, restore); revision | Provenance, alignment |
| Impression | Opportunity id; surface; slot; display time; randomization propensity, if any. Per candidate: text, category, generator, scorer outputs, ranker score, policy rule, learner-choice risk | Ranker training, position bias, audits |
| Outcome | Accept (slot, latency); refresh; dismiss; keep typed; undo (latency); edit after accept; Backspace after an automatic change; retained at send | Acceptance and attention models |
| Shadow autocorrect | Separator time; typed token; best correction; calibrated probability; each mode's threshold; would-apply | Certifying autocorrect (§3.5) |
| Automatic correction | The applied correction; reverted or kept; time to revert | Live monitoring |
| Send | Final text, or alignment pointers into the edit log | Labels |
| Explicit | "Don't suggest this"; "Always correct this"; wrong-category flag; session rating; free-text note | High-weight labels, permissions |

Logs are stored in owner-scoped IndexedDB:

- They have a size cap and 90-day rolling retention unless you export them.
- Forget and account deletion remove them, tested like the existing deletion boundary.
- Export is a file you create explicitly.
- Nothing is sent over the network.

## 3.3 Turning logs into labels

1. **Provenance per character.** Every character in the draft carries the id of the event that inserted it: typed, accepted, automatic or pasted. The PR already distinguishes these sources.
2. **Alignment at send.** Match each final word to the edits that produced it:
   - A word typed by hand gets one opportunity per keystroke at which a list was shown.
   - A word inserted by acceptance gets its acceptance event.
3. **Completion labels.** At each opportunity the intended word is the final word. The candidate equal to it is positive and the others are negative. Each opportunity is one ranking group.
4. **Correction labels.** If the learner typed *t* and the final text has *c* ≠ *t* at that position, the correction *t*→*c* was wanted. That holds whether they fixed it by hand or accepted a suggested correction. If *t* survives to send, the correction wasn't wanted. An unnoticed typo is then labelled "not wanted", which understates precision; for certification that bias is in the safe direction.
5. **Notation labels.** If the final text has the symbol, the conversion was wanted. If the alias was left as a word, it wasn't.
6. **Explicit feedback outranks implicit feedback.** "Always correct" is a positive label and grants permission. "Don't suggest" is a negative label and suppresses that candidate in that context.
7. **Automatic changes never label themselves.** Only manual acceptance or a manual fix counts as positive, as in the PR. An automatic correction that survives is weak evidence at best.

## 3.4 Small randomizations that answer behavior questions

- **Display suppression.** At 10% of word starts, show no list. The difference in typing time between words with and without a list is the causal effect of showing suggestions, attention cost included. This is a micro-randomized design (Klasnja et al. 2015). Thousands of word starts a week give enough statistical power even with a single user.
- **Slot swaps.** With probability 0.1, swap two candidates that both passed every filter (rank 1↔2 or 2↔3) and log the swap probability. This estimates how much attention each slot gets, which a ranker needs to know. It is the position-bias problem described by Joachims et al. (2017) and Agarwal et al. (2019).
- **Never randomize** whether an autocorrection is applied, or whether the learner-choice filter runs.
- Randomization is visible in Settings as **Research mode** and can be turned off.

## 3.5 Shadow mode for autocorrect

At each separator, the engine records four things without applying anything beyond what the current policy already does:

- the best correction
- its calibrated probability
- each mode's threshold
- whether the correction would apply

After a few weeks, these shadow events, labelled as in §3.3, give real precision at every threshold. The learner never sees a single new wrong correction along the way. The thresholds are then certified as in [05 §5.10](05-training.md#510-autocorrect-decision-and-certified-thresholds-a1).

## 3.6 Explicit feedback the learner can give

- **Long-press a suggestion:** Don't suggest this · Always correct this (corrections only) · Wrong type.
- **Weekly two-minute review:**
  - the week's automatic corrections, with their undo counts, each marked right or wrong
  - the most-dismissed suggestions
- **Optional one-tap session rating:** helpful, neutral or distracting.
- **Trial note:** free text, tied to the session id.

These keep your personal-permission rule (two explicit acceptances) and add an explicit **Always** route.

## 3.7 From feedback to model updates

| Layer | Where | When | Updates | Gate |
| --- | --- | --- | --- | --- |
| Immediate | Phone | Every event | Personal vocabulary and cache counts, kept spellings, per-occurrence suppression, permission grants and revocations, spatial-model offsets | Unit tests; bounded sizes |
| Weekly | Your computer, after export | When you trigger it | Ranker, calibrators, autocorrect thresholds | Frozen-test gates ([06 §6.7](06-evaluation.md#67-decision-gates)), plus the newest week as an extra test |
| Monthly | Your computer or a rented GPU | When you trigger it | Language-model fine-tune or personal adapter | Same gates, plus a latency re-check |
| Never | — | — | Training on frozen test periods; counting automatic outcomes as positives | — |

The PR's on-device reward learner can stay as one ranker feature. Its ten hand-set reward values should be replaced by coefficients fitted to the weekly data.

## 3.8 Deciding when to show anything

The expected value of showing a list is:

> P(accept) × time saved − attention cost − P(wrong accept) × recovery time

Each term is estimated from the logs:

| Term | Estimated from |
| --- | --- |
| P(accept) | Outcomes, by slot and by characters remaining |
| Time saved | Your measured time between keystrokes |
| Attention cost | Display suppression (§3.4) |
| Recovery time | Undo latencies |

Show the list only when the expected value is positive. Quinn and Zhai (2016) measured exactly this trade-off and found that suggestions can slow typing even when they save keystrokes.

## 3.9 Privacy

- Logging is opt-in, stays on the phone, and leaves it only through an explicit export.
- If other people use the app, each person's personal models stay with them.
- Tutor text is kept only in the roles needed (prompt, given, suggested wording) and is never reused as learner evidence.
- Deletion is covered by tests.
