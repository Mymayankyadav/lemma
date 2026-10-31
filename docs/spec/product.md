# Product specification

## 1. The owner and the job

One person studies mathematics from books (PDFs) with Claude and ChatGPT as tutors. Lemma remembers everything between chats so any tutor can pick up exactly where the last one stopped, turns sessions into flashcards, schedules reviews with FSRS, and shows progress. Nobody else uses the app.

The tutor's work happens in the chat apps. Lemma's work happens in the database and in a small phone-first web app. The connector between them is designed so that resuming costs a few hundred tokens.

## 2. Glossary

| Term | Meaning |
| --- | --- |
| Subject | A field, e.g. Analysis. Groups projects and Atlas ideas. |
| Project | A study goal with sources and a plan, e.g. Real Analysis from Rudin ch. 2–4. |
| Source | An uploaded PDF, stored as page text the tutor can read. |
| Checkpoint | A plan step with an objective, an observable criterion, 1–8 steps and pages. Code `CP4`. |
| Session | One study conversation about a project, numbered per project (`S7`). |
| Event | Something that happened in a session: pretest, attempt, hint (level 1–4), explanation, misconception, evidence, re-check, note. |
| Proposal | A suggested change from a tutor that the owner approves: card, card fix, plan, plan change. |
| Note / card | A note holds the content; cards are its schedulable parts (one for basic, two for reverse, one per cloze). Code `N123`. |
| Card note | A comment the owner leaves on a card for the tutor (`#12`). |
| Concept / idea | An Atlas node shared by projects of one subject. |
| Re-check | A later retrieval question for a demonstrated checkpoint (3, 10, 30, 90 days). |

## 3. Flows

### F1 Start a project
1. Projects › plus. Name, subject (or a new one with glyph and hue), goal in the owner's own words, teaching style, PDF.
2. The app reads the PDF page by page in the browser (text, printed page labels, contents) and uploads the file. Progress shows pages read.
3. The project is in **planning**. The app shows "Tell your tutor: Plan Real Analysis" with a copy button.

### F2 Plan with a tutor
1. In Claude or ChatGPT the owner says "Plan Real Analysis".
2. The tutor calls `resume` and gets the planning packet (goal, source outline pointer, planning rules).
3. The tutor reads the outline and key pages, asks at most three questions, and calls `propose_plan` (8–20 checkpoints with criteria, steps, pages, prerequisites, ideas, re-check questions).
4. Lemma shows the plan proposal on Home (proposals tile) and in Approve › Plan.

### F3 Approve the plan
1. Approve › Plan › See the whole plan: a prerequisite map and the list.
2. "Approve plan" creates checkpoints and Atlas ideas; the project becomes active.
3. "Ask for changes" rejects it and opens the chat with "Revise the plan for Real Analysis: <the owner's words>".

### F4 Study in the chat
1. Home › Resume (or say "Resume Real Analysis" in the chat).
2. The tutor calls `resume`: where the owner stopped, the open question, misconceptions, warm-up re-checks, the style and the rules.
3. The tutor calls `start_session` (or continues the open one), asks warm-up questions without hints, then teaches the current checkpoint step by step in the chosen style.
4. Every step change and about every 6 messages the tutor calls `save_progress` with what happened and the next question to ask. If the chat ends abruptly (usage limit, closed tab), the next `resume` continues from that point, in either chat app.
5. When the criterion is met by the owner's own work, the tutor records evidence and the checkpoint becomes demonstrated (it lights up in the path and the Atlas, and its first re-check is set for 3 days later).
6. Before stopping: three quick recall questions, then `end_session` with a short summary and whether the goal was met.

### F5 Mix subjects in one chat
"Let's study, mix it up" → `resume(mix)` gives the current checkpoint and warm-ups for every active project. The tutor switches project after each step and keeps a session per project. Reviews can also mix decks (F8).

### F6 Cards from sessions
1. When an idea clicks or an error gets fixed, the tutor proposes 1–3 atomic cards (`propose_cards`), linked to the session, checkpoint, idea and page.
2. The owner opens Approve: swipe right or tap check to approve, left or x to reject, pencil to edit first; "Approve all" for the lot.
3. Approved cards join the next review as new cards.
4. If the owner dictated a card ("add a card: …"), the tutor sends it with `direct` and it skips approval.
5. The owner can also write cards in the app (Cards › plus).

### F7 Improve cards through notes
1. During review or in Card detail, the owner leaves a note: "Too wordy. Make the hypotheses a cloze."
2. Later in any chat: "Update my cards". The tutor calls `get(feedback)`, sees open notes with the card text, and calls `propose_card_edits` with fixes that resolve those notes.
3. The owner approves the fixes in Approve (before/after view). The notes become "addressed by Claude in S9"; the card keeps its schedule unless its cloze parts changed.

### F8 Review
1. Review: due count, estimated minutes, decks tree (project › checkpoint) with checkboxes, sessions with new cards, "Mix decks" (on by default: interleaving across decks).
2. Card review: optional confidence before reveal (Sure / Unsure / Guess: one tap rates and reveals), then Again / Hard / Good / Easy with FSRS intervals. Undo, note for tutor, pause card.
3. Summary: count, recall, time, lapses, calibration ("When sure, right 19 of 20"), due tomorrow.
4. Queue rules: learning and relearning cards first when due; otherwise reviews and new cards interleaved (one new after every `ceil(reviews / (new + 1))` reviews); siblings (cloze parts of one note) never in the same session; with Mix decks on, avoid two cards from the same checkpoint in a row when possible; daily limits from settings.

### F9 Spaced checkpoints and the Atlas
1. Demonstrated checkpoints come back as warm-up questions at 3, 10, 30 and 90 days. Success moves to the next interval; failure marks the checkpoint "Re-check due" and the idea "Revisit".
2. The Atlas shows every idea across subjects as a constellation: lit stars are demonstrated, pulsing rings need revisiting, hollow dots are not started. Filters: All, Revisit, Demonstrated. Tapping an idea shows its checkpoints and cards.

### F10 Insights
Range 7/30/90 days: time studied, sessions, reviews, recall against the target, reviews by day by grade, calibration by confidence, time by subject, checkpoints demonstrated and re-checked per week, typical session length, most revisited idea.

### F11 Settings and connector
Connector address (masked, copy, rotate), app setup steps for Claude and ChatGPT, prompts to copy, default teaching style and editable tutor rules, target recall, new cards per day, FSRS tuning from the owner's history, math shortcuts (KaTeX macros), backup download, sign out.

### F12 Demo mode
`?demo=1` loads a fixed dataset in memory (no sign-in, no network writes). Used for building screens in parallel and for every automated test. A small "Demo" chip shows it is active.

## 4. Learning principles behind the features

| Principle | Evidence (see the research doc linked in `plan.md`) | Where it lives |
| --- | --- | --- |
| Retrieval practice | Rated high utility (Dunlosky et al.) | Cards; warm-up questions; recall questions at the end of a session |
| Spacing with FSRS | High utility; FSRS-6 beats SM-2 on 99.6 % of collections | FSRS engine; checkpoint re-check ladder |
| Interleaving | 72 % vs 38 % after two weeks in a 7th-grade math study | "Mix decks" on by default; `mix` sessions |
| Guarded tutoring | Unrestricted chat help lowered exam scores 17 %; a hint-only tutor did not | Tutor rules: hint ladder, no full solutions before an attempt |
| Structured, sourced tutoring | A structured AI tutor beat active learning by 0.73–1.3 SD | Checkpoints with steps; pages read by tool; strong-model planning |
| Mastery and prerequisites | Math Academy's knowledge graph | Prerequisites gate checkpoints; demonstrated means criterion met by the owner |
| Pretesting | Trying before being taught improves learning | Pretest question at a new checkpoint |
| Worked examples, then fading | Strong for novices | "Examples first" style |
| Self-explanation | Explaining steps improves transfer | Explanation events; "why" cards |
| Confidence and hypercorrection | Confident errors are corrected well when caught | Confidence before reveal; calibration insight |
| Misconceptions | Naming errors helps fix them | Misconception log in packets and session records |

## 5. Not in v1

Offline review and sync, native apps, push notifications, OCR for scanned PDFs, sharing, more than one user, calling AI models from the app, Anki import, audio. Ideas for later are listed in `plan.md` §11.
