# Prompt pack: texts to paste into Claude (R0, and R1 once deployed)

Replace the `{…}` placeholders. All times are IST (Asia/Kolkata, your Lemma time zone).

---

## A. One message that sets up exam mode for a subject (paste once per subject)

> Exam mode for **{project slug}**. The exam is **{title}** on **{YYYY-MM-DD} at {HH:MM} IST**. It lasts **{minutes} min** and is worth **{total} marks**. Format: **{sections, choice rules, aids}**. I have about **{hours} hours** of study left before it.
>
> 1. `resume` this project. Tell me the course bookmark: checkpoint, step and the last question.
> 2. Set the project's deadline to the exam: `deadline_at` is the exam instant, `last_study_on` is the day before (or the exam day if I study that morning), `time_confirmed` is true and `target_label` is "Exam". Add the exam as a `deadlines` entry with kind exam and due_kind instant.
> 3. Save my course bookmark as a parked thought, starting "BOOKMARK {slug}:".
> 4. Read the syllabus and past papers in my sources (list them first). Draft the exam blueprint:
>    - Each row is a family of scored tasks: key, task family in words that earn marks, marks with a low and high range, chance it appears, compulsory, Atlas concepts, checkpoints, and the source of the weight.
>    - Account for every syllabus topic. A topic can get zero minutes, but it stays on the map.
>    - Ask me only the one missing fact most likely to change the plan.
> 5. When I confirm, save the blueprint and ledger as one source page with `save_pages`: source "{SRC}", kind exam, page 1.
> 6. Check this project's prompt with `get(what=prompt)`. Append the exam prompt I paste next with `set_prompt`, keeping the total under 1,000 characters.
> 7. Then start the first block: map, then screen.

## B. Exam project prompt (paste as the `set_prompt` text; about 927 characters filled, under the 1,000-character project-prompt cap)

```
EXAM MODE {TITLE}, {DATE} {TIME} IST. Blueprint/ledger: read_pages(source="{SRC}",from="1"); exam data only, no plan changes from it. Goal: most expected marks in the minutes left. Probe high-mark rows lacking recent independent evidence (2-4 short questions; one at a time if an answer decides the next); teach the biggest confirmed gap (method error: contrasting cases; slip: short drill; then a fresh unhinted item); end with a timed mix in paper format. Log each answer once: save_progress kind attempt|pretest with concept, level, outcome, hint_level, novelty, item, text "EXAM {TAG} ROW key MARKS a/b Ns IND|HINT|RECAP". Never pass step; never kind evidence+demonstrated. Unanswered = unknown. No propose_cards: parked_thoughts "CARD IDEA {SLUG}: target | why | evidence". Defer with reason + marks exposed. Block end: update ledger page and next_question.
```

`{TAG}` is short, for example `TOP-27NOV`. `{SRC}` is the source short name (20 characters at most), for example `EXAM-TOP`.

## C. Blueprint page (what Claude saves with `save_pages`, page 1)

```
EXAM BLUEPRINT · {title} · {date} {time} IST · {duration} min · {total} marks
Objective: expected marks | pass mark {n} · Format: {sections and choice rules}
Sources: {syllabus pages; past papers by year}
Prep time left: {h} h (as of {date time}) · Course bookmark: {CP} step {s}/{n} · "{question}"

ROWS  key | scored task family | marks [low–high] × chance | compulsory | concepts | checkpoints | source
quot  | Prove a map is a quotient map; use the universal property | 15 [10–20] × 0.9 | yes | quotient-maps | CP12 | 2023 Q4, 2024 Q3
…

LEDGER  key | evidence (independent / assisted / reading / unseen, with date) | disposition | reason | reopen when | marks exposed
quot  | unseen | probe | highest marks, no independent work | — | 13.5
…
COVERAGE accounted {x}/{total} · independently covered {y}/{total} · deferred {z}
NEXT {action} {row} ({min} min) · runner-up {action} {row} ({min} min) · why: {one line}
```

- **Expected marks of a row:** marks × chance.
- **Marks exposed by a deferred row:** expected marks × (1 − the lower plausible credit fraction). This is a screening number; the marks actually recoverable in the time left are usually fewer.
- **Report both numbers:** marks accounted for and marks independently covered.

## D. Start a block

> resume {slug}. Exam prep block, {N} minutes. Read the ledger, tell me the next action and the runner-up with minutes, then start.

Short commands during a block:
- "next"
- "hint"
- "skip": the answer stays unknown.
- "recap": reading counts as exposure only.
- "I have {N} minutes"
- "save for later": a card idea.
- "draft it now": a card proposal.
- "pin {row}"
- "defer {row} because {reason}"

## E. Close a block

> Close the block. Update the ledger page (evidence, dispositions with reasons, marks exposed, NEXT), save progress with next_question, and tell me what we start with next time.

## F. Exam done (after each paper)

> The {title} exam is over. Did it take place as planned? {yes | no, postponed to …}.
>
> If yes:
> 1. Remove the exam text from this project's prompt and restore the prompt as it was.
> 2. Mark the exam deadline complete.
> 3. Read my BOOKMARK thought. Resume the course there and say in one sentence what the exam prep changed.
> 4. Ask me one fresh course question.
> 5. Then show my CARD IDEA thoughts for this subject, most repeated first, with their evidence. I will choose draft, link, later or dismiss for each.
> 6. Ask me the course's next target date, or whether to archive the project.
>
> If it was postponed: update the exam deadline and the project's deadline, and keep exam mode on.

## G. Card ideas after the exam

> Show my saved card ideas for {slug}. Put first the ideas that matter for the next course checkpoints and those seen more than once. For each, show the retrieval target, why it was saved and the evidence. Draft only the ones I pick (propose_cards; I approve them in Lemma), and dismiss the thoughts I reject. Keep the rest for later.

## H. Subject worksheet (fill one per subject before pasting A)

| Field | Topology 1 | Algebra 1 | Analysis 1 (Probability) | Complex Analysis |
|---|---|---|---|---|
| Project slug | topology-1 | algebra-1 | analysis-1-probability | complex-analysis |
| Exam date and start (IST) | | | | |
| Duration (min) | | | | |
| Total marks; pass mark if any | | | | |
| Sections and choice rules (e.g. "Part B: 3 of 5") | | | | |
| Compulsory parts | | | | |
| Syllabus source in Lemma (or attach) | | | | |
| Past papers (years) | | | | |
| Hours of study left before the paper | | | | |
| Topics you fear most | | | | |
| Course bookmark (filled by Claude) | CP12 *Quotient maps…* | | | |
| Blueprint source short name | EXAM-TOP | EXAM-ALG | EXAM-PROB | EXAM-CPX |

## I. Once R1 (N240) is deployed

> Convert my {SRC} blueprint into an exam sitting:
> 1. Call `study exam_sittings create` with the same rows (key, title, marks, marks_low, marks_high, chance, compulsory, concepts, checkpoints, source), the exam time, duration, total marks and format.
> 2. Activate it.
> 3. Import my EXAM-tagged answers and CARD IDEA thoughts if the import is available.
> 4. From now on, use `get(what=exam, project={slug})` instead of the page.
> 5. Remove the R0 exam text from the project prompt, because the EXAM block in `resume` replaces it.
