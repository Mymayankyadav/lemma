# R0: Exam mode in Claude today (no deploy)

This runbook uses only tools your Lemma connector already exposes. On 25 Nov `get(what=resources)` listed `deadlines`, `parked_thoughts`, `calendar_blocks`, `day_plans`, `session_progress` and the rest. `set_prompt`, `save_pages`, `read_pages`, `save_progress`, `edit` and the tutor questionnaires are also available. Nothing here changes Lemma's code.

**What R0 gives you:**
- The tutor prepares you for a dated paper by marks.
- Every answer lands in your normal study history: concept, level, outcome, hints and novelty. When the course resumes, that evidence counts.
- Card ideas are captured and written after the exam.
- Your place in the course (the bookmark) is kept.

**What R0 lacks** (R1 adds it):
- a server-side planner and coverage ledger. In R0, Claude keeps the ledger on one source page.
- de-duplication of exam attempts by response;
- per-row version binding;
- one-tap Save for later in the app.

---

## 1. Set up each exam subject (about 20 minutes)

Do this once per subject, in a Claude chat where the Lemma connector is enabled. The exact texts are in `02-prompt-pack.md`.

| Step | You say | Claude does (tools) | Why |
|---|---|---|---|
| 1. Resume | "resume topology-1" | `resume(project)` | Loads the course bookmark (NOW, CRIT, LAST … ask). |
| 2. Clear the deadline hold | "Set this project's deadline to the exam: 27 Nov 09:30 IST, last study day 26 Nov, label Exam" | `edit(target=<slug>, set={deadline_at:'2026-11-27T09:30:00+05:30', last_study_on:'2026-11-26', time_confirmed:true, target_date:'2026-11-27', target_label:'Exam'})` | The project is in post-deadline mode, so the queue says Hold. Lemma's time model reads `deadline_at` and `last_study_on` first and uses `target_date` only as a fallback, so set all of them. Use `last_study_on:'2026-11-27'` if you will study on the morning of the exam. |
| 3. Register the exam | "Add the exam as a deadline: 27 Nov 09:30 IST" | `study {resource:'deadlines', operation:'create', patch:{title:'Topology 1 exam', kind:'exam', due_kind:'instant', due_at:'2026-11-27T09:30:00+05:30'}}`. Add `project_id` only if Claude already has the project's UUID; the title is enough for Today and Calendar. | Shows on Today and in Calendar (N74 overlay). Marks the paper's time for everyone. |
| 4. Record the course bookmark | "Save my course bookmark before exam prep" | `study {resource:'parked_thoughts', operation:'create', patch:{text:'BOOKMARK topology-1: CP12 step 2/4 · next question: <exact LAST ask>'}}` | Return to study restores this exact place. |
| 5. Build the blueprint | Paste **C** (blueprint request) and attach or point to the syllabus and past papers. | `get(what=sources)` and `read_pages` on the syllabus and papers. Claude drafts rows (key, scored task family, marks, range, chance, compulsory, concepts, checkpoints, source). You confirm. Then `save_pages(project, source:'EXAM-TOP', title:'Topology 1 exam blueprint', kind:'exam', pages:[{page:1, text:<blueprint + ledger>}])` | The plan lives in Lemma and survives new chats. `read_pages(source='EXAM-TOP', from='1')` reads it back. |
| 6. Turn exam mode on | Paste **B** with the values filled in. | Calls `get(what=prompt, project)` first. Then `set_prompt(scope:<slug>, mode:'append', text:<B>)`. The project prompt is capped at 1,000 characters in total. | Every `resume` of this project now starts with your exam rules under OWNER, which Lemma's tutor follows first. |
| 7. Book the time (optional) | "Block 19:00–21:30 tonight and 07:00–12:00 tomorrow for Topology exam prep" | Reads `get(what=calendar_overlaps, start, end)`, then `study calendar_blocks create` | Makes the minutes real and visible on Today and in Calendar. |
| 8. Say what you have | "I have about 6 hours of study left before the paper" | Writes it into the blueprint page's header (`save_pages … replace:true`) | Keeps the selector honest about time. |

**Do not approve the "pruning proposed" suggestions during exam week.** The course plan stays intact. Exam prep is a layer on top of it, and pruning decisions belong after the exams.

## 2. Each study block (the loop)

Start with: "resume topology-1, exam prep block, 50 minutes". Claude reads the blueprint page and works the passes from the research report:

1. **Map.** Every row has a disposition: probe, teach, practice, skip, defer or pin. If one missing fact would change the plan (for example, are proofs compulsory?), Claude asks you for it.
2. **Screen.**
   - On high-mark rows with no recent independent evidence, Claude asks 2–4 short questions.
   - It asks one at a time when the first answer decides whether the second is needed.
   - It skips a check when recent independent work already answers it, and names that evidence.
   - In the Lemma app's tutor chat, Claude can attach a quick questionnaire (purpose `diagnose`) for these checks.
3. **Teach the most valuable gap.**
   - A method-choice error gets contrasting cases.
   - A correct setup with a slip gets a short drill.
   - An ambiguous answer gets one discriminating follow-up.
   - After any help, a fresh question without hints.
4. **Verify.** Near the end of your last block: a fresh, timed mix in the paper's format, including a whole proof if the paper rewards one.
5. **Close the block.**
   - Claude updates the ledger section of the blueprint page: dispositions, marks exposed by deferred rows, and the next question.
   - It saves progress with `next_question`.
   - It tells you the one thing it will start with next time.

### Logging conventions (keep them exact so R1 can import them)

Every answer is logged **once** with `save_progress` (session from `start_session(project, goal:'Exam prep: <title>', checkpoint:<bookmark CP>)`):

- `events:[{kind:'attempt'` (or `'pretest'` for a screening probe), `concept:<Atlas slug>, level:'recall'|'use'|'understand'|'transfer', outcome:'demonstrated'|'partial'|'failed', hint_level:0..4, novelty:'novel'|'familiar'|'seen_solution', item:<the question>,`
- `text:'EXAM TOP-27NOV ROW <key> MARKS <a>/<b> <seconds>s IND'}]`

`IND` is replaced by `HINT` after help, or by `RECAP` after reading a recap.

Rules:

- **Never pass `step`** during exam prep. The course step is your bookmark.
- **Never use `kind:'evidence'` with `outcome:'demonstrated'`** for an exam probe. It would mark the course checkpoint as demonstrated. Certification keeps its own criterion.
- **Unanswered, skipped or timed-out is unknown, not wrong.** Log nothing, or log `outcome:'partial'` only for a real partial answer.
- **Reading a recap is exposure, not ability.** Log it as `kind:'explanation'` without an outcome, or skip logging it.

### Card ideas (cards later)

When an error recurs or a reusable distinction appears, Claude **does not propose a card**. It saves the reason instead:

`study {resource:'parked_thoughts', operation:'create', patch:{text:'CARD IDEA topology-1 · <concept>/<level>: <retrieval target> | why: <short reason> | evidence: S<n> <row key>'}}`

- If the same idea appears again, Claude edits that thought (`operation:'edit'`) and adds "seen again in S<n>" instead of creating a second one.
- Say "draft it now" when you want a card immediately. Claude then uses `propose_cards` as usual, and the card waits for your approval in Lemma.

### In-app tutor chat during R0

The Lemma tutor chat relays your messages to this same Claude. Claude reads them with `get(what=tutor_turn)`. Quick questionnaires (short, one choice, several choices) are ideal breadth checks:

- Claude keeps the question-to-row mapping in its own reply.
- After you submit, it logs one event per answered question, as above.
- Unanswered questions stay unknown.

## 3. After each paper ("Exam done", script F)

1. Claude asks: **"Did the exam take place?"** Only you can confirm it. If it was postponed, Claude updates the deadline and keeps exam mode on with the new date.
2. Claude removes the exam text from the project prompt with `set_prompt(scope, mode:'replace', text:<the prompt as it was before step 6>)`, or `mode:'clear'` if it was empty.
3. Claude marks the exam deadline done with `study deadlines complete`.
4. **Return to study:**
   - Claude reads your BOOKMARK thought and resumes the course at that checkpoint and step.
   - It says in one sentence what the exam prep changed. For example: "You identified the eigenspace condition unaided; start with basis construction."
   - It asks one fresh question.
5. **Card ideas:**
   - Claude lists the open `CARD IDEA` thoughts for the subject, most repeated first, and shows each one's evidence.
   - For each idea you pick **draft** (Claude proposes the card for approval), **link** (an existing card already teaches it), **later**, or **dismiss**.
   - A drafted or dismissed idea's thought is dismissed (`parked_thoughts dismiss`).
6. **Course date:** set the project's real next target, or archive the project if the course has ended.
7. **Optional:** a short due-card round sized to your capacity. Explicit ratings only. A quiz, a recap or a mode switch never rates a card.

## 4. How R1 picks this up

When N240 is live:

- Claude creates an `exam_sittings` record from your blueprint page. Key, title, marks, range, chance, compulsory, concepts and checkpoints carry over one to one.
- It activates the sitting. The server captures the bookmark.
- An optional one-time import (described in `04-data-contracts.md` §8) turns `EXAM … ROW … MARKS …` events into `exam_attempts` and `CARD IDEA` thoughts into `card_ideas`.
- From then on, `resume` shows the EXAM block, and `get(what=exam)` replaces the blueprint page.
