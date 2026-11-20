# Brief for the reviewer of these screenshots

You are reviewing the **mobile (phone, 390×844) night-theme UI** of Lemma, a proof-first mathematics study app (React PWA; paths → checkpoints → cards, FSRS reviews, a tutor that only *proposes* things the learner approves in an Inbox). You have **pictures only**: no code, no live app. Everything you need to judge is in the frames; where it is not, say so instead of guessing.

## What you were given

- `INDEX.md` — sheet order, the scene map (the same screen in the empty and the populated account), every frame with its state, capture warnings.
- `sheets/*.png` — contact sheets, 4 phone frames each, captioned `F###` (populated account), `E###` (empty, brand-new account), `H###` (heavy data, if present). **Review from these.**
- `frames/*.png` — each frame at 2x (780×1688). Open one only to verify a detail you suspect from a sheet (small text, contrast, a clipped edge).
- `manifest.json` — the same data plus per-frame DOM facts and console errors.

Two accounts are shown on purpose. **Empty** must teach and invite (what is this, why is it empty, what to do next). **Populated** must stay readable and calm with a normal amount of data. Compare the two for every screen.

## How to work (two passes)

1. **Pass 1 — scan every sheet once**, in INDEX order, writing down only *patterns* (the same defect on several screens: spacing, type, button styles, empty states, toasts, sheets). Do not stop to fix wording.
2. **Pass 2 — per screen**, go back through the scene map (empty vs populated), confirm each suspected defect in the 2x frame if it is small, and only then record it. A finding you could not verify in a frame must be marked *unverified*.

Distinguish **product defects** from **capture artifacts**:
- The clock is frozen at Mon 9 Nov 2026, 13:43 IST. Timers show fixed values (the capture moves the clock where a flow needs it). Greetings, "in 1 h 17 min", and dates follow that moment.
- Fixed header and bottom tab bar repeat on every scroll frame of a long screen; scroll frames overlap by ~20%. Content "hidden under the tab bar" is only a finding if it is *unreachable* (last item cannot scroll clear of the bar).
- Names, numbers and maths are demo data. Judge how they are presented, not whether they are true.
- An orange warning under a frame, or `SCENE FAILED`, means the capture could not reach that state: report it as a capture gap and move on.
- The Atlas map is a canvas; its labels are drawn, not DOM.

## What to judge on every frame

1. **Legibility** — text size (anything under ~12px effective), contrast in the night theme (4.5:1 body, 3:1 large text and UI parts), truncated or overlapping text, clipped content, low-contrast disabled states that look like errors.
2. **Layout and rhythm** — alignment, 16px side gutters, consistent vertical spacing, orphaned headings, big dead areas, content squeezed against the tab bar or a sheet footer, anything wider than the screen.
3. **Touch** — targets look ≥ 44px (the design system's own rule: buttons 48px, small 44px); primary action is thumb-reachable; destructive actions are visually separate and confirmed or undoable.
4. **Hierarchy and consistency** — one clear primary action per screen; the same component (button, chip, tab, row, card, sheet, toast, badge, icon) looks and behaves the same everywhere; headings follow the same type roles. Look especially for **default-browser or unstyled text** (a different serif/sans than the rest) and components that look like leftovers from an older design.
5. **States and feedback** — empty, loading, error, validation, success (toast with Undo), disabled-with-reason, offline. Every empty state should explain itself and offer the next action; "0 of 0", "NaN", orphaned units, or a chart with no data are defects.
6. **Flows** — for each flow (add a task / block / card / thought, new path, review round, inbox approve, focus session, close the day, settings rows) check that each frame follows from the previous one: typed values are echoed, the footer/button label says what will happen, the result is confirmed, there is a way back, and nothing important is hidden by the keyboard-height sheet or a toast.
7. **Content** — typos, placeholder or developer wording, inconsistent terms (Path/Project, Checkpoint/Topic, Block/Session), maths rendering, dates and units, tone (the product is calm and non-shaming).
8. **Accessibility cues visible in pictures** — colour as the only signal, tiny icon-only buttons without a visible label, focus rings (where a frame shows focus), text at 130% (scenes `large-text-*`).

## Design rules of this app (so you judge against its own intent)

The UI is the "Constellation" design (v7): near-black indigo paper, one indigo action colour, eight subject colours (each subject also has a glyph), serif display titles with a sans UI face, rounded cards, bottom tab bar (Today · Paths · Review · Calendar · Progress) plus a round **+ Capture** button. The project's own lint (so these are intended rules, and a violation is a real finding): buttons are 48px tall (44px small); no native select / date / time controls visible; a status badge always carries its icon; a subject is never a bare coloured dot; indigo is for actions, never for a meter or a chart; no horizontal page scroll; text is never cut to fewer than 4 characters. Tabs are underlined (not pills). Sheets slide from the bottom; toasts sit above the tab bar.

## Output format

Write the review as Markdown, in this order, and keep it scannable:

1. **Verdict** — 5 lines: overall quality, the 3 biggest problems, what is good.
2. **Cross-cutting patterns** — each: name, rule/heuristic broken, frames that show it (`F012, F047, E009`), the fix once for all.
3. **Findings table** — `ID | Severity | Profile | Screen · frame(s) | What is wrong (what you see) | Why it matters | Suggested fix | Confidence (verified in 2x / from sheet / unverified)`. Severity: **S0** unusable or data-risking (cannot complete a flow, content unreachable, error screen), **S1** blocks comprehension or a primary action, **S2** noticeable polish / consistency, **S3** nit. One row per defect, not per frame.
4. **Empty-state review** — one line per screen: Good / Needs work, and why.
5. **Flow review** — per flow: the frames in order, where the flow breaks or confuses.
6. **Capture gaps** — states you needed but did not get (name the scene, say what extra capture would settle it).
7. **Top 10 fixes** in priority order.

Rules for the review: cite frame ids for every claim; do not invent features you cannot see; do not pad with praise; if two frames contradict, say so. If a sheet is too small to read, ask for the specific frame instead of guessing.
