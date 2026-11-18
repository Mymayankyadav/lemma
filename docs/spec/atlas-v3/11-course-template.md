# 11 Course template (every tutor plans with it)

One schema for all subjects. The learning profile (prove, solve, compute, recall, explain, read, construct) tunes the defaults; the structure never changes. `propose_plan` validates against it (04).

## 1. Project header
- Goal (no dates, I2).
- `deadline_at` and `last_study_on`; capacity (asked, never guessed).
- Sources with page labels.
- Approved learning profile.
- Exam format: proof | mixed | computational.
- Mastery threshold (default 0.85).

## 2. Stages
- One stage per 1–2 weeks or per chapter, with 3–8 CPs in each.
- No CPs of kind `cards` ("Cards K…"): cards are drafted in every CP's close step, and reviews happen in the daily queue.

## 3. CP template (one teachable unit, 45–120 min)
| Field | Rule |
|---|---|
| kind / tier / estimate | learn \| milestone; core \| standard \| venture; minutes |
| KCs | 1–6, each with a kind (definition, result, example, technique…) and a home topic |
| prepare (optional) | 10–20 min problem before teaching. Only for conceptual core CPs that prior knowledge can attack (PS-I meta-analysis, Sinha & Kapur 2021) |
| teach | definitions → examples and non-examples → results. Proofs are read by self-explanation: name the key idea, justify each line from earlier ones (Hodds, Alcock & Inglis 2014) |
| practice | 3–6 item specs in the practice band. From stage 2 on, ≥ 30% target earlier CPs |
| criterion | 1 uncued, novel item at the threshold (item_kind holdout); never shown before the attempt |
| stretch (optional) | 1 item in band 0.30–0.60; core CPs only, once prerequisites are secure |
| close | 3 recall questions + card drafting + stage logging (≤ 10 min) |
| steps | ≤ 8 strings of ≤ 80 chars (existing limits), derived from the fields above |
| certification check | automatic (10 §6); not written by the tutor |

## 4. Cards: few, structural, budgeted
**Principle.** Cards hold what must be retrieved verbatim or recognised fast: statements, hypotheses, key ideas, proof skeletons, cue → technique.
- Proofs are never split into line cards. A proof is understood through its high-level idea and modular structure (Mejía-Ramos et al. 2012); line cards test neither.
- Retrieval benefits may shrink for material whose elements all depend on each other (van Gog & Sweller 2015). The reply: those null results came from retrieving isolated fragments or from immediate, massed tests (Karpicke & Aue 2015), and delayed tests still show the effect (Rawson 2015).
- So the whole proof is retrieved, spaced and delayed, as a reconstruction recheck. Cards carry only its idea and skeleton.

| KC kind | Core | Standard | Card content |
|---|---|---|---|
| definition | 1 (+1 if confusable) | 1 | Cloze on the defining condition; the extra card is example vs non-example |
| result | 2 | 1 | Statement with every hypothesis; "why is H needed?" → counterexample |
| proof of a core result | 2 | 0 | Key idea (1 line); skeleton of 3–5 numbered moves. Full proof goes to a reconstruction recheck |
| example / counterexample | 1 if canonical | 0 | Property → example |
| technique | 1 | 0 | Cue → technique (selection) |
| notation | 0 | 0 | Only after an error |
| venture | 0 | 0 | — |

**Writing rules**
- One retrieval target per card; a skeleton card has at most 5 moves.
- Answer ≤ 3 lines, in LaTeX.
- No "list all …" cards and no verbatim proof lines.
- Reverse cards only for name ↔ statement.
- Tag every card with its KC and facet.

**Daily quota** (Owner prefers fewer)
- Unit = one short card (≈ 0.5 min per review); a skeleton = 3 units (≈ 1.5 min).
- Load on Lemma's FSRS engine (retention 0.91): 1 new card/day → 2.6 reviews/day in month 1, 4.4 in month 2, 5.7 in months 3–4 (09).
- Card budget B = ½ × review_share × capacity (min/day), capped by `review_budget.minutes`.
- Quota = 0.5 × B ÷ (0.5 × 5.7) units/day: half the steady-state sustainable rate.
- Example: 120 min/day → B = 15 → 2.6 units/day, e.g. 2 short cards a day plus a skeleton every 5 days.
- The quota is a rolling 7-day sum, so a skeleton fits on any day.
- Shown as `new_cards_quota` in TIME.

**Adaptive card rules**
1. Draft a card only if the KC-facet is needed after ≥ 7 days (deadline or a dependent CP).
2. Propose suspending a card when its facet is certified and FSRS stability exceeds the days to the exam.
3. A card with ≥ 3 lapses is proposed as an understand probe or a split; repeated lapses mean the card holds too much.
4. The Owner may raise the quota to 100% of the sustainable rate. We found no evidence that more cards raise engagement, so the default stays at 50%.
   - The end-to-end simulation agrees: capping card minutes at 12.5% of a block scored higher than no cap (+0.004 ± 0.001 exam score; 09).
5. Card kinds: definition, theorem, why, example, counterexample, proof (key idea), skeleton, technique (02).

## 5. Validation (deterministic, on propose_plan)
- Every CP has ≥ 1 KC, a criterion item, a tier and an estimate.
- Prerequisites are acyclic; card counts are within the table; no dates in free text (I2).
- Steps respect the existing limits.
- Fail → the proposal is rejected with a list of reasons; no partial save.
