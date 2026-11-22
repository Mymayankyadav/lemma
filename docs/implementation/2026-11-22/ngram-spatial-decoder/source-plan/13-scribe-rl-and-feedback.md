# 13. Reinforcement learning and feedback

## 13.1 Where RL fits

RL is the right tool for decisions whose value shows up only in your behavior:

- whether to show a list, and at what point in the word
- which three candidates to show, and in which slots
- how long a continuation to offer
- when to offer a keyboard-page chip

RL never controls three things, which stay hard constraints:

- the learner-choice filter
- LaTeX validity
- whether an automatic correction is applied, which is certified separately ([05 §5.10](05-training.md#510-autocorrect-decision-and-certified-thresholds-a1))

## 13.2 The decision problem

- **Episode:** one word or command, from its first keystroke until it is completed or a suggestion is accepted. That's at most about 15 steps.
- **State:**
  - the language statistics and feedback state ([11 §11.8](11-scribe-architecture.md#118-language-statistics-the-model-uses))
  - a 32-dimensional summary of the backbone state
  - features of the candidate pool
  - your personal posteriors
- **Action:**
  - show or hide
  - an ordered slate of up to three candidates from the safe pool
  - a continuation length of 0–3 tokens
- **Reward,** measured in milliseconds saved:
  - **plus** taps saved × your measured time per tap (page switches included) when a suggestion is accepted
  - **minus** an attention cost each time a new list appears. It's estimated causally from display suppression ([03 §3.4](03-feedback-and-logging.md#34-small-randomizations-that-answer-behavior-questions)).
  - **minus** the recovery time after an undo, or an edit after accepting
  - **minus** a cost for each refresh
  - **plus** a small bonus when an accepted suggestion survives until send
- **Constraints:** tracked as costs, never traded against reward:
  - learner-choice leaks, masked to zero
  - invalid LaTeX, masked
  - false automatic corrections, certified
- **Longer-term state** such as trust and attention enters through feedback features, like the acceptance moving average and the ignore streak, rather than through a long horizon.
- **Never in the reward:** whether the mathematics is correct.

## 13.3 Safe exploration and logging

- **Slates are sampled** from a Plackett–Luce distribution over safe candidates, using H8's scores at temperature τ. Each impression logs the probability of the slate shown, which makes off-policy learning and evaluation possible.
- **Display suppression** happens at 10% of word starts ([03 §3.4](03-feedback-and-logging.md#34-small-randomizations-that-answer-behavior-questions)).
- **Exploration budget:** exploration adds at most about 5% extra ignored lists (tune this), and less in Strict mode.
- **No exploration** on whether to apply an automatic correction, or on the learner-choice filter.

## 13.4 Algorithms, in the order to try them

| Level | Method | Where it runs | Data needed | Notes |
| --- | --- | --- | --- | --- |
| 0 | The expected-value rule ([03 §3.8](03-feedback-and-logging.md#38-deciding-when-to-show-anything)) or today's heuristic | Phone | — | Baseline, and the first behavior policy |
| 1 | Neural-linear Thompson sampling (Riquelme et al. 2018) with a position-based click model (Chapelle & Li 2011; cascading bandits, Kveton et al. 2015) | Phone, after every impression | Hundreds of impressions | Bayesian logistic regression on frozen Scribe features, with an entropy floor on the slate distribution |
| 2 | Counterfactual risk minimization (Swaminathan & Joachims 2015) with a Plackett–Luce policy gradient (Oosterhuis 2021) and an entropy bonus | Your computer or a Kaggle CPU notebook, weekly | About 5,000–20,000 impressions | Learns H8 from logged propensities |
| 3 | Offline RL on within-word episodes: fitted Q-iteration with gradient-boosted trees (Ernst et al. 2005), then implicit Q-learning (Kostrikov et al. 2021) | CPU, then a short GPU run | Weeks of logs | Learns when to show; conservative by construction |
| 4 | Aligning the generator to feedback: unlikelihood on ignored candidates (Welleck et al. 2019), KTO on binary feedback (Ethayarajh et al. 2024), DPO on accepted-versus-ignored pairs (Rafailov et al. 2023) | Kaggle GPU, up to 1 hour | Thousands of events | Changes Scribe's language model itself, with a KL anchor to the pretrained Scribe |
| 5 | RL fine-tuning of the generator against the reward model: GRPO (Shao et al. 2024) or RLOO (Ahmadian et al. 2024), with a KL penalty and an entropy bonus | Kaggle GPU, 1–2 hours | Only once level 4 works | Watch for reward hacking; evaluate only on real logs |
| 6 | Warm-starting with a simulator: PPO (Schulman et al. 2017) in a user simulator fitted to your logs | Kaggle GPU or CPU | A calibrated simulator | Initialization only, never the deciding evidence |

## 13.5 Deploying a new policy safely

1. **Estimate** the new policy's value on held-out logs with doubly robust off-policy evaluation (Dudík et al. 2011). For slates, use the pseudoinverse estimator (Swaminathan et al. 2017).
2. **Deploy only if both hold:**
   - a high-confidence lower bound on its value beats the current policy's estimate (high-confidence off-policy evaluation: Thomas et al. 2015)
   - every constraint holds with high probability (the Seldonian approach: Thomas et al. 2019)
3. **Stay close to the current policy where data is thin,** keeping its choices there (safe policy improvement with baseline bootstrapping: Laroche et al. 2019).
4. **Roll back automatically** if live reward falls below the baseline's lower bound for two days in a row.

## 13.6 Untapped suggestions: the Bayesian ignore update

Suppose candidate *c* was shown in slot *s* for *d* milliseconds and you kept typing. By Bayes' rule, its probability becomes:

> P(*c* | ignored) ∝ P(*c*) × (1 − *e*ₛ(*d*) × *a*꜀)

where:

- *e*ₛ(*d*) is the probability that you looked at slot *s* within *d* milliseconds. It's fitted from the slot swaps.
- *a*꜀ is the probability that you'd tap *c* if you saw it and meant it.

Candidates that weren't shown keep their probability, and everything is then renormalized.

The effect:

- A suggestion you probably saw and didn't take drops sharply.
- One shown for 80 ms in slot 3 barely moves.
- Repeated ignores compound. The entropy over the remaining candidates rises, and the next slate naturally covers other word families.

This is what untapped words should do: count as evidence, weighted by how likely you were to have seen them.

## 13.7 The user simulator (warm starts only)

The simulator is fitted from your logs:

- slot examination by exposure time
- acceptance by characters remaining
- attention cost
- timing between keystrokes
- undo behavior

It is validated by predicting a held-out week ([06 §6.3](06-evaluation.md#63-behavioral-simulation-screening-only)). PR #1738 shows what happens when a simulator's assumptions decide the results. Here the simulator only initializes policies, which must then pass §13.5 on real logs.

## 13.8 How much data one learner produces

At about 4,000 words a week ([02 §2.3](02-datasets.md#23-your-data-d1-d2-the-only-data-that-decides)), with a list on most keystrokes, expect several thousand impressions a week:

| Level | Data needed before it's useful |
| --- | --- |
| 1 | Days |
| 2 | A few weeks |
| 3–5 | A month or more |

That's why the ladder starts with the bandit.

## 13.9 What RL may not do

- Choose actions outside the safe pool.
- Explore automatic corrections.
- Optimize for answer correctness, or for longer accepted insertions inside math spans.
- Change thresholds certified by Learn-then-Test.
