# Lemma: visual audit (Part A)

**Material reviewed:** `lemma-audit-1-phone.zip` (sample account, phone Day and Night, 171 frames each) and `lemma-audit-4-busy.zip` (busy account, phone Day and Night, 190 frames each). That is about 720 screenshots in total.
**Not provided:** `lemma-audit-2-tablet.zip` and `lemma-audit-3-desktop.zip`, so tablet and desktop are **not scored** (see §6).
**Method:** I opened every phone Day frame in order (01 → 162) and wrote first impressions, then did the same for every phone Night frame, then checked the busy account for how it copes with volume. I then compared screens with each other and with the app's own component gallery (`154-component-gallery`), which states the product's design principles.

Annotated evidence is in `annotated/B01…B14`. Every finding below has an ID (**F01–F80**, praise **P01–P12**), and the boards use the same IDs.

---

## 1. Verdict

| | Score | Finished? |
|---|---|---|
| **Phone Day** | **5.8 / 10** | No. Stronger on data screens (calendar, charts). |
| **Phone Night** | **5.9 / 10** | No. More atmospheric (Today, Focus, Paths, Atlas), weaker on data colour. |
| **Busy account (volume)** | **4.5 / 10** | No |
| **Overall look and feel** | **5.9 ≈ 6 / 10** | A beautiful, well-defined idea that about 70% of the screens deliver; the rest look like a different, older product or are broken. |

*How the headline scores are built:* each is the average of the group scores in §2 (Day 6.3, Night 6.4, Busy 5.0), minus a 0.5 penalty because the worst defects (broken menus F01, unstyled forms F02, disagreeing numbers F05) are shared components that appear in almost every group. A user meets them everywhere, so they weigh more than any single screen.

**Three things that most raise it**
1. **A real identity.** The serif on warm paper, the "geometer's notebook" emblems and the Night "observatory" give it a personality that most study apps lack (P01, P03).
2. **Mathematics treated as a first-class citizen.** Typeset maths on cards, the inbox and plan diffs looks scholarly and trustworthy (P04).
3. **A written design philosophy.** `154` states six principles ("Quiet by default", "Every colour has one job", "Explain, don't block"…) that are exactly right. The app has a north star; it just doesn't follow it everywhere yet (P02).

**Three things that most hold it back**
1. **Broken shared components.** Every overflow menu renders as a run-on string ("PinPauseMark doneArchive"), and two edit forms are unstyled native HTML with a red "Save" button (F01, F02). A stranger would think the app is half-built.
2. **Two products stitched together.** Hub screens are serif, calm and modern. Detail and settings screens are bold-grotesque, box-in-box, native-control forms (F03, F15, F31).
3. **Numbers and states that don't add up.** The due count is 23, 25 or 22 depending on the screen. Charts overprint their own labels. Approve and reject swipes look identical, and the inbox-zero "illustration" is a black rectangle (F05, F06, F07, F08).

**Rating each part of the request**
- Visual identity and concept: **8.5/10**
- Typography: **6/10**
- Colour: **6/10**
- Layout, space and density: **5.5/10**
- Components and consistency: **4.5/10**
- Data visualisation: **5.5/10**
- States (empty, error, success, undo): **4.5/10**
- Delight and motion potential (judged from stills): **5/10**
- Day vs Night parity: **6.5/10**
- Volume resilience: **4.5/10**

---

## 2. Scorecard

Scored for phone only; tablet and desktop were not in the pack. "Busy" is the phone Day busy account.

| Screen group (README §4) | Phone Day | Phone Night | Busy | One-sentence reason |
|---|:-:|:-:|:-:|---|
| **Today** | 7.5 | 8 | 6 | The best first impression in the app: serif greeting, a clear hero action and glowing emblems. Pulled down by the due-count mismatch, the faint cropped emblem and the abstract day strip. |
| **Focus** (timer, finish sheet) | 6 | 7.5 | 6 | Night focus is the app's most atmospheric screen. Day digits are crossed by the emblem, there is a raw "End must follow start" error, and the finish sheet has an unlabelled stepper. |
| **Capture and Search** | 6.5 | 6.5 | 6.5 | The natural-language capture chips are clever. The type picker duplicates its own selector, the search sheet has dead space and a broken icon. |
| **Review and Practice** | 7 | 7.5 | 6 | The round is calm and focused, with interval hints on the grade buttons. The hub uses a loud numeral and a confusing chart legend, and practice uses different grade words. |
| **Calendar, Tasks, Close the day** | 5 | 4.5 | 5 | Half the screen is chrome. Logged and suggested blocks look disabled or like inputs. The task menu and edit form are broken, and the Night events disappear into the background. |
| **Paths and path detail** | 6 | 6.5 | 5 | The path cards with emblems are lovely. The detail header never collapses (about a third of the screen is left for content), the menus are broken and the Sources tab looks legacy. |
| **Checkpoint and Session** | 6 | 6.5 | 5.5 | The "To demonstrate" quote card is beautiful. Elsewhere: bold-sans H1s, warning icons for normal progress and contradictory evidence states. |
| **Atlas** | 4.5 | 6 | 2.5 | It should be the signature screen. Stars are dust-sized, the canvas is mostly empty, and at volume it becomes an unreadable hairball with clipped labels. |
| **Cards** (library, detail, editor) | 6 | 6.5 | 5 | The list is clean. Internal IDs are shown everywhere, the recall chart is squeezed, grade badges are inconsistent and the card face is not clamped. |
| **Inbox and plan proposal** | 6 | 6.5 | 4.5 | The proposal card is the best maths typesetting in the app. The swipe frames are identical and blank, inbox zero shows a black box, and in the busy account error toasts stack. |
| **Progress and Time log** | 5.5 | 5.5 | 4.5 | Every chart has "Show as table" and a summary sentence, which is excellent. Axis labels collide, Black-weight hero numerals shout, the almanac is a wall of empty boxes and the Night ramp is khaki. |
| **Settings** | 4 | 4 | 4 | The index is clean, but the sub-pages are a legacy admin form: native checkboxes, red sliders, per-section Save buttons, 12-hour time and developer copy. |
| **Sign-in and first run** | 6 | 6.5 | n/a | The right mood on sign-in. First run switches to sans H1s, shows a raw URL, an unnumbered list, a grey "Next" and leaves half of each screen empty. |
| **Component gallery** (`154`) | 7.5 | 7.5 | n/a | Credible principles and tokens with live contrast ratios, but the app does not yet use what the gallery documents. |

`annotated/B00_scorecard.jpg` shows the same table as a heat map.

---

## 3. Findings

Severity follows the brief: **Major** (embarrassing or confusing to a new user), **Moderate**, **Minor**, **Polish**. File names refer to the pack (`D` = phone-day, `N` = phone-night, `busy` = busy account).

### 3.1 Major

**F01 · Every overflow and action menu is broken**
- **Files:** `43-tasks-row-menu`, `51-paths-row-menu`, `58-path-more-menu`, `87-card-more-menu`, `128-time-log-row-menu` (D and N, busy too)
- **What I see:** The actions render as one run-on string: "ScheduleEditMove to To doCancel task", "PinPauseMark doneArchive", "Switch pathView in AtlasPause path", "Pause cardDelete card", "EditSplitVoid". Icons float above the labels without alignment. Destructive actions ("Delete task", "Archive path") wrap onto a second line in body ink.
- **Why it hurts:** It is the most visible bug in the product. It sits on the most-used secondary interaction, it looks unfinished and it is unsafe, because the targets are ambiguous.
- **Fix:** Use one `ActionSheet` component: a vertical list of 56 pt rows, each with a 24 px icon in a 40 px tile, a label and an optional one-line hint. Put a hairline divider before destructive actions and colour them red with a trash or archive icon. → **B01**

**F02 · Two edit forms are raw, unstyled HTML**
- **Files:** `44-task-edit-sheet`, `130-time-log-edit-entry` (D and N)
- **What I see:** The title is jammed into the top-left at x = 0 and the × sits under it. Native `<select>`s and date pickers are used, the single-line Title field is a resizable textarea, and the Save button is **red**. The panel is about 528 px wide, so the page bleeds through on the right. Night is worse: a black slab with a salmon Save.
- **Why it hurts:** It looks like a crash. The red Save reads as "delete".
- **Fix:** Rebuild both forms in the standard sheet anatomy (F17): a fields stack, a date chip that opens the app's own date picker (`39`), an indigo primary button and a ghost Cancel. → **B02**

**F03 · The Settings sub-pages are a different, older product**
- **Files:** `145-settings-tutor`, `146-settings-study` (all scrolls), `147-settings-planning`, `148-settings-reminders`, `149-settings-data-and-account`
- **What I see:** Cards inside cards inside cards. Small serif labels act as section heads at body size. There are native blue checkboxes, a square stepper and a red slider. Rows of numeric inputs include "Flowtime break ratio 0.2". Each section has its own Save button ("Save focus preferences", "Save order" ×3). Headings repeat ("Reminders" ×3, "Teaching style" ×2, "Delete account" ×2 in two different reds).
- **Why it hurts:** Settings is where people decide whether to trust an app. These pages read as an admin back-office.
- **Fix:** Use iOS/Material-style grouped lists. Each row has a label, the current value and a chevron, or an inline switch. Edits open small sheets and save on change with a toast. Put advanced numerics behind an "Advanced" row. → **B02**

**F04 · Floating layers collide with the tab bar and sticky bars**
- **Files:** `71b-atlas-concept-open` (the sheet's buttons are hidden under the tab bar), `busy/69-atlas-star-sheet`, `86-card-detail-chart-tap` (the selected-point readout is hidden under the sticky Edit/Pause bar and tab bar), `36-calendar-planner` ("NOT PLACED" cut by the footer), `64-checkpoint` (prerequisite chips under the sticky bar), `106-inbox-undo-toast` (toast covers "Approve all…")
- **Why it hurts:** Key actions are physically unreachable, and the screen looks mis-stacked.
- **Fix:** Use one z-order and safe-area contract. Sheets sit above the tab bar, which hides while a sheet is open. Content gets `padding-bottom = tab bar + sticky bar + 16`. Toasts dock above the topmost bar and never cover a primary action. Tooltips and readouts flip upward when they would collide.

**F05 · Numbers disagree with each other**
- **Files:** `01-today` (23 due, badge 23), `20-review-home` ("25 cards today"), badge **22** on `30`, `50`, `80`, `85`, …; `120-progress-overview` "Reviews 413" vs `20-review-home~scroll1` "412"; `80-cards-library` "50+ cards" vs "49 cards" on the path tab, and 4,900+ cards in the busy account
- **Why it hurts:** In a study tracker, the numbers are the product. Three values for one quantity make every chart suspect.
- **Fix:** Use one source of truth per metric. If the round includes new cards, say so ("23 due + 2 new"). Never cap a total with "50+". Show exact counts with thin-space grouping ("4 951"). → **B10**

**F06 · Chart labels overprint**
- **Files:** `121-progress-range-90` (x-axis mush "12 Aug Aug 26 Sep…"), `124-progress-learning` ("Goal 90%" on top of "86%" → "Ga8l%90%"), `124-progress-learning~scroll1` and `125-progress-time` (30-day axes), `20-review-home` ("21 22" collision), `85-card-detail` ("target 90%" over the line)
- **Why it hurts:** Unreadable text in a data screen is the fastest way to look amateur.
- **Fix:** Thin tick labels by available width (minimum 8 px gap; ticks at week or month starts). Put reference-line labels at the plot edge, outside the data, with collision avoidance. Never print a value label when bars are thinner than the label. → **B07**

**F07 · Swipe feedback in the inbox looks broken**
- **Files:** `101-inbox-mid-swipe-approve`, `102-inbox-mid-swipe-reject`
- **What I see:** Both frames are the same: a pale pink blob clipped at the top-left, and a blank card below. There is no green vs red, no stamp, no label and no next card.
- **Fix:** As the card tilts, show a directional wash (approve = success tint from the right edge, reject = danger tint from the left) with a stamped label ("Approve ✓" / "Reject ×") that fades in with drag distance. Show the next proposal underneath at 96% scale. See motion spec M-INB-01 to M-INB-04. → **B06**

**F08 · Missing glyphs render as black rectangles**
- **Files:** `112-inbox-zero` (the empty-state mark), `10-search-empty` ("Close the day" icon) (D and N)
- **Why it hurts:** A broken icon at a reward moment (inbox zero) undercuts the whole celebration.
- **Fix:** Draw the missing icons (see the icon list in `03_MOTION_AND_ASSETS.md`, I-14 and L-12) and add a build-time check that every icon key resolves. → **B06, B14**

**F09 · Raw validation error on the focus timer**
- **File:** `05-focus-menu-or-paused`
- **What I see:** A pink bar reading "End must follow start" appears under "Park a thought", with no icon, no title and no dismiss. The layout jumps up.
- **Fix:** Errors on an immersive screen should be an inline banner with an icon, a human sentence ("This session's end time is before its start, so we couldn't save it") and an action ("Fix times"). Better still, prevent the state.

**F10 · Calendar Day: about half the screen is chrome**
- **Files:** `30-calendar-day`, `31-calendar-week`, `33-calendar-agenda`, `38`, `39`
- **What I see:** Six layers stack up before the first hour of the grid: title, Schedule/Tasks tabs, month navigation, a week strip with glyphs, the Day/Week/Month/Agenda control, the overdue pill and the suggested-blocks bar. The grid starts at about y = 600 of 1266.
- **Fix:** Use a compact header: "Mon 9 Nov ▾" (tap for month) plus a view switch icon. The week strip appears on scroll-up only. Overdue and suggestions merge into one dismissible inline row. Tasks becomes a sibling in the header menu, not a full tab row. → **B04**

**F11 · Path detail: the header and two bottom bars leave a third of the screen for content**
- **Files:** `56-path-map`, `59-path-sessions`, `60-path-sources`, `61-path-cards`, `63-path-linear-algebra` (and busy)
- **What I see:** Title, goal, progress, target and tabs take about 400 px and never collapse. The "Continue with tutor | Review 13" bar sits on the floating tab bar, adding about 200 px.
- **Fix:** Collapse the header into a 56 pt bar with a thumbnail emblem and a progress ring after 24 px of scroll, with sticky tabs underneath. Replace the sticky bar with one floating "Continue" pill above the tab bar, and move "Review 13" to the header actions. → **B05**

**F12 · Atlas collapses at volume**
- **Files:** `busy/68-atlas-map`, `busy/69-atlas-star-sheet`
- **What I see:** 600 concepts and 1,500 links become a grey ellipse of edges. Subject labels are clipped by the screen edge ("UBJECT 14") and overprint ("SUBJECT 10SUBJECT 8").
- **Fix:** Use semantic zoom. Zoomed out, each subject is one glowing constellation with a label and count. Zooming in reveals stars. Edges show only for the selection and its first-degree neighbours. Labels avoid collisions and never clip. → **B08**

**F13 · Error toasts stack and follow you between tabs**
- **Files:** `busy/107-inbox-list`, `busy/110-plan-proposal`, `busy/120-progress-overview` (+ `~scroll1`)
- **What I see:** The same "Could not confirm the decision. Refresh to check whether it was saved." appears three times in pink text with no icon, covering charts on a different tab.
- **Fix:** Show at most one toast. Deduplicate identical messages. Give errors an icon, a title and a "Retry" action. A sync failure that persists becomes a single inline status banner ("2 decisions not yet saved · Retry"). → **B12**

**F14 · Unlabelled steppers, in three different styles**
- **Files:** `06-focus-finish-sheet` ("− 1 +", with no label), `153-first-run-3` ("− 2 +", with no label), `146-settings-study` (a square-cornered stepper)
- **Why it hurts:** The user cannot tell what the number means (hours? a rating? blocks?).
- **Fix:** Every stepper gets a label and a unit ("Blocks completed · 1", "Study blocks a day · 2"). Use one stepper style: a pill with 44 pt hit areas, a tabular numeral and equal end caps.

### 3.2 Moderate

**F15 · Two typographic voices**
- **Serif:** hub titles, sheet titles, path names, sign-in, Close the day, review cards.
- **Bold grotesque:** checkpoint (`64`), session (`67`), plan proposal (`110`), all Settings H1s (`141`–`149`), first-run H1s (`151`–`153`), section heads "Memory", "Goals", "Steps", "Evidence", "History".
- **Fix:** Rule: titles and section heads are serif; UI, labels, data and buttons are sans. → **B13**

**F16 · Black-weight hero numerals**
- **Files:** `20` "25", `120` "3 h 55 min", `03` "00:00", `45` "140", `160` "25", "100%"
- **Why it hurts:** These are the loudest objects in a "quiet by default" system and match neither typeface's voice.
- **Fix:** Use serif lining figures, or Inter Display Medium with tabular numerals, and set units at 50–60% size in the secondary colour.

**F17 · Sheet anatomy varies from sheet to sheet**
- **Headers:** an overline plus a serif title plus × (`02`, `07`, `21`); a serif title with no overline (`42`, `54`, `81`–`83`); no header at all (`10`, `11`); a title above a misplaced × (`44`, `130`).
- **Footers:** a full-width primary (`02`, `21`, `42`); a right-aligned primary with a text left action (`06`, `07`); "Cancel" grey plus a primary (`35`, `36`, `105`); a primary in the *middle* of the sheet with more content below (`27b`).
- **Fix:** Define two sheet templates (Pick and Form) and one footer rule (§2 of `02_ROADMAP_TO_10.md`).

**F18 · Titles duplicated in nav and H1, and the header never shrinks**
- **Files:** `56` ("Real Analysis" twice), `141`–`149` ("Appearance", "Planning"…), `148` ("Reminders" ×3)
- **Fix:** The README promises a large title that shrinks to a small one on scroll. Ship that, and hide the small nav title until the large one scrolls away.

**F19 · Wrapping breaks alignment**
- **Examples:** "Thu 10 / Dec" (`85`), "Typical / answer" (`20~s1`), "Maximum continuous / minutes" (`147`), "Auto / Follows your / device" (`141`), "Due / tomorrow" and "Due Thu 19 / Nov" (`33`), wrapping checkpoint names in `busy/21`, "Linear / Algebra" in `70`.
- **Fix:** Use short formats in tight cells ("10 Dec", "Median answer"), reserve two lines for every tile label so tiles in a row align, and use `text-wrap: balance` on short labels.

**F20 · Red is used for things that aren't dangerous**
- **Examples:** "Save changes" (`44`, `130`), the target-recall slider (`146`), "Undo" (`106`, `112`), source ordinals "1 / 3 / 4" (`60`), the cloze highlight on "compact" (`105`, `107`).
- **Why it hurts:** It breaks the app's own rule, "Every colour has one job". → **B09**

**F21 · Status icons have the wrong meaning**
- **INFO icon** on a date ("Target 1 Feb", `56`), on "In 1 day" (`26`), on "In progress" (`64`), on "Next" (`64`), on "Added" (`110`), and on "Easy" (`85`).
- **WARNING triangle** on "Partial" evidence (`64~s1`), "Hard" (`85`), "Changed" (`110`) and "Recheck due" (`66`).
- **Fix:** Use status icons only for status (success / warning / danger / info). Dates use a calendar or flag. Progress uses a ring glyph. Diffs use + and Δ. Grades use grade glyphs (F22). → **B09**

**F22 · The grade system has no single visual language**
- **Review round (`23`):** grey tiles with coloured top borders.
- **History badges (`85`):** green ✓ Good, amber ⚠ Hard, red ✕ Again, *grey ⓘ Easy*.
- **Round complete (`160`):** a bar coloured brown / green / indigo.
- **Practice (`27`):** different words entirely ("Couldn't recall / Hard / Good / Easy").
- **Fix:** Define each of the four grades once (name, colour, glyph, short label) and use that everywhere.

**F23 · The success state is announced in one colour and drawn in another**
- **Files:** `01~s1` and `162~s1` (green "✓ Done" over a navy bar), `45` (Focus 140 of 20, bar navy)
- **Fix:** A completed meter fills with the success tint, or shows a full bar plus a ✓ end cap.

**F24 · The Night data palette was never designed**
- **Files:** `N/32-calendar-month` (the heat ramp turns khaki, gold and cream; "today" becomes a glaring cream tile), `N/120~s1` (the almanac legend is khaki)
- **Fix:** Build a Night ramp from the indigo or lavender family with four luminance steps and at least 3:1 contrast between neighbours. "Today" becomes a ring, not a fill. → **B11**

**F25 · Night calendar events sink into the background**
- **Files:** `N/30-calendar-day`, `N/31-calendar-week`
- **What I see:** Event fills are within about 5% luminance of the page, so subject colour survives only as a 3 px rule.
- **Fix:** Use an elevated navy surface with a 12–16% subject tint and a 1 px subject-tinted border. → **B04**

**F26 · Logged and suggested blocks are drawn as the wrong things**
- **Files:** `30`, `31`, `38`
- **What I see:** Logged time is a flat grey slab (it reads as disabled). Suggested blocks are outlined capsules with an "ⓘ Suggested" chip, which look like text inputs, are not proportional to their duration and are not dashed, although the README says they should be.
- **Fix:** Logged = subject tint with a soft diagonal hatch and a ✓ badge. Suggested = a dashed outline at true duration, a ghost fill and one tap to accept (M-CAL-03). → **B04**

**F27 · The emblem system is the brand, but it isn't controlled**
- **Quality varies:** the Fourier wave is exquisite; the linear-algebra lattice is a scribble; the topology knot is good.
- **Opacity:** emblems used as watermarks at about 8% opacity look like smudges (`01`, `56`, `59`).
- **Sameness:** every unassigned path gets the identical grey flower (`busy/50`).
- **Two glyph systems:** `143-settings-subjects` shows wave, spiral and hash icons but lists "glyph ∫ / τ / λ".
- **Fix:** See the emblem specification in `03_MOTION_AND_ASSETS.md` §4.

**F28 · The Capture button looks secondary**
- **Files:** every tab screen
- **What I see:** An outlined rounded *square* with an indigo "+" beside the tab bar. It reads as disabled or secondary, although it is the main creation action (the README calls it round). It also disappears on some scrolled frames (`01~scroll1`, `50~scroll1`, `33~scroll1`).
- **Fix:** A filled indigo 56 pt circle with an elevation shadow, behaving the same on every tab.

**F29 · Tab bar and badges**
- **What I see:** The floating bar has no blur or scrim, so content collides behind it (`01`, `59`). Busy shows two "99+" badges (Review and Inbox) that compete. The badge on Review counts due cards, while the badge on the Inbox icon counts proposals; there is no visual difference between "things to do" and "things to decide".
- **Fix:** Add a backdrop blur (or a solid surface with a top hairline). Review gets a numeric badge; the Inbox gets a dot plus the count in the header. Cap the display at "99+" only for the Inbox.

**F30 · Alignment drift**
- **Examples:**
  - "Customise this round" is indented 24 px (`20`).
  - "Needs you" rows start text at three different x positions (`01~s1`).
  - Change-list icons touch the card border (`110`).
  - The goal "Edit" link floats mid-row (`125~s1`).
  - "Plan these" is alone on its own row, right-aligned (`40`).
- **Fix:** Use a 4 pt grid with 20 px card padding, and put every row's leading element in a 40 px column.

**F31 · Box-in-box nesting**
- **Examples:** task groups with one item still get their own card (`40`), each path-card row is its own card (`61`), evidence cards (`64~s1`), settings (`146`), Tutor ("Teaching style" card › fieldset › radio cards, `145`).
- **Fix:** One level of surface per region. Use lists with dividers inside a card, never cards inside cards.

**F32 · Filter chips have no selected state**
- **Files:** `40` (All paths / Overdue / High priority), `50` (Active 4 / Paused / Done / Archived), `42`, `81`–`83` (path, state and sort pickers)
- **Fix:** A selected chip = indigo tint fill + ✓ glyph + bolder label. Sort should be a single-choice list with a ✓, not chips.

**F33 · Disabled controls neither look disabled nor explain why**
- **Files:** `54` and `55` (Create path), `152` (Create path), `09` ("Unavailable · Type something to add."), `161` (two outlined disabled buttons)
- **Why it hurts:** It breaks the app's own principle #6, "Explain, don't block".
- **Fix:** Disabled = 40% opacity of the *primary* style, plus a one-line reason directly under it in plain words ("Name your path to create it").

**F34 · Focus rings show on open**
- **Files:** `36`, `37`, `90` (an indigo ring around the close ×), `02` (double ring on Intention), `71-atlas-search` (nested ring: rounded outer, square inner)
- **Fix:** Use `:focus-visible` only. One ring style: 2 px indigo, 2 px offset, following the control's radius.

**F35 · Textarea resize grips**
- **Files:** `06`, `27`, `44` (on a single-line title), `85~s2`, `89`, `104`
- **Fix:** Use auto-growing text areas with no grip.

**F36 · Empty states are a sentence, not a moment**
- **Files:** `52`, `53`, `84`, `126`, `161`, `busy/126`
- **What I see:** One grey line; sometimes a large outlined CTA that doesn't fit the context ("Start a new path" on the Archived filter).
- **Fix:** Use a mark (an illustration from §5 of `03`), one sentence, and one context-correct action. → **B14**

**F37 · The same control appears in three styles**
- **Examples:** "Enable reminders" is a checkbox in `148` and a switch in `153`; `147` and `149` use native blue checkboxes; tasks use warm-grey checkboxes that look disabled (`40`).
- **Fix:** Switches for settings, round checkboxes for tasks, square checkboxes for multi-select.

**F38 · The Day focus timer is muddled**
- **Files:** `03`, `04`
- **What I see:** The Fourier emblem runs *through* the digits and the intention text. Break, Pause and Finish are three equal circles, so Finish is not primary. There is a 400 px dead zone above the clock. (Night, `N/03`, solves most of this by dimming the wave.)
- **Fix:** Put the emblem behind the clock as a slowly drawn orbit (L-04) at under 12% contrast. The clock becomes a ring progress (for Pomodoro) or an orbit (for Open). Pause is the primary; Finish is a long-press or a secondary.

**F39 · Focus finish sheet**
- **File:** `06`
- **What I see:** Five bare radio circles from Rough to Great, an "Optional" label placed like helper text, a grip on the textarea, red "Discard" text and a right-aligned Save.
- **Fix:** Use five tappable glyphs (for example ◔ … ●, the same family as the grade glyphs), a large "What did you learn?" field, and a full-width Save with "Discard" moved to the header.

**F40 · Toasts look like system dialogs**
- **Files:** `106`, `112`, busy
- **What I see:** A white box, no icon, no 6-second countdown, and "Undo" in red.
- **Fix:** An ink-coloured (Day) or raised (Night) pill, with an icon, a message, a bold indigo "Undo" and a thin countdown hairline along the bottom edge (M-SYS-04).

**F41 · Link and overflow styles are inconsistent**
- **Examples:**
  - Links: underlined ("Adjust", "Add", "Open export settings") vs plain.
  - Overflow: a "More ⌄" grey pill (`56`) vs a "•••" icon.
  - The same action as a button or a link: "Manage" (`26`), "Triage", "Reschedule".
- **Fix:** Links are never underlined except inside running prose. Overflow is always "•••" in a 44 pt icon button.

**F42 · Capture has rough edges**
- **Files:** `07`, `08`, `09`
- **What I see:** The recognised tokens are not highlighted *in the text*, so it's hard to see what was parsed (`07`). The raw "::" stays in the card text, with no front/back preview (`08`). The type picker shows the same four choices twice, as tiles and as a segmented control (`09`).
- **Fix:** Underline or tint the parsed spans in the field. Show a mini card preview for "front :: back". Use one selector.

**F43 · Template grammar leaks**
- **Examples:** "You studied 413 in this range", "You studied 12 in this range" (`124`), "You studied 16650 in this range" (busy), "Focus (min) 140 of 20" (`45`).
- **Fix:** Write per-metric sentence templates.

**F44 · The study almanac is a wall of empty boxes**
- **File:** `120~s1`
- **What I see:** 26 weeks × 7 outlined squares, about 180 empty, for 4 active days. Month labels clip ("Au"). The helper copy explains scrolling.
- **Fix:** Start at the first active week. Draw zero as a 2 px dot, not an outlined box. Fade the scroll edge.

**F45 · Legends that misdescribe their marks**
- **Examples:** line swatches for stacked columns (`120~s2`, `124`); leader lines from one column to legend labels on the right that look like three line series (`20`).
- **Fix:** Swatch shape matches the mark. Label stacked series once, at the right edge of the last bar.

**F46 · The card-detail recall chart is squeezed**
- **File:** `85`
- **What I see:** About 60 px tall, dots overlap, the target label collides with the line, and the selected readout is hidden (`86`, F04).
- **Fix:** 160 px tall, a target line labelled outside the plot, and the readout pinned above the chart.

**F47 · Mixed units and misleading labels in Progress**
- **Examples:**
  - "3 h 55 min" in the hero and "3.9 h" in the sentence below.
  - "Focus by day" draws weekly bars, and the table header says "Day" for weeks (`122`).
  - Y-ticks at 1.7 h and 3.3 h; "0 min" labels printed on empty bars.
  - The delta chip "3 h 55 min more than the 30 days before" equals the total.
  - In busy: duplicate "0 min / 0 min" ticks.
- **Fix:** Use one unit format per screen and round ticks (1 h, 2 h, 3 h). The chart title follows its bucket. Hide zero labels. Phrase a first period without history as "Your first 30 days".

**F48 · Chart colour carries no meaning**
- **What I see:** Focus bars are dark slate in Day and lavender-grey in Night; goal meters are slate (`125~s1`), although each goal belongs to a subject.
- **Fix:** Use subject colours where the data is per-subject and indigo for "you" totals. Neutrals are only for "no subject".

**F49 · Internal IDs used as user-facing labels**
- **Examples:** "CP4" as a page title (`64`), "Card N1" (`85`), "N49 · CP9 · due today" (`80`), "Real Analysis · CP4" chips, "Same gap in S6 and S7" (`109`), stage names "CP1–8 · 3 OF 8" (busy), and "Conjecture · not started" used for *topics* like "Analysis" (`70`).
- **Fix:** Show names, not codes. Codes can live in a "Details" disclosure for power users. → **B05, B07, B13**

**F50 · Developer copy reaches users**
- **Examples:**
  - "This uses the same export as the original Settings screen." (`149`)
  - "Delivery also depends on an enabled device and the server schedule." (`148`)
  - "Changes save to your existing owner preferences." (`148`)
  - "Scroll horizontally on narrow screens. Today has an outlined cell." (`120~s1`)
  - "bars are scaled to highest (2 h 20 min)" (`125`)
  - "Nothing selected for this round" (`161`, when nothing is due)
- **Fix:** A copy pass with a "would a learner say this?" test.

**F51 · Date and time formats conflict**
- **What I see:** "11/07/2026, 05:30 PM" (`44`), "11/09/2026", "11:00 AM" (`130`) and "08:00 AM" (`147`), directly under "Time display: 24-hour". "Nov 1" (`60`) vs "1 Feb" / "9 Nov" elsewhere.
- **Fix:** One formatter everywhere: "Mon 9 Nov", "17:30" (or the user's choice).

**F52 · Review round details**
- **Files:** `22`–`24`
- **What I see:**
  - The answer body is mid-grey serif, the lowest-contrast text on the screen, although it is the most important.
  - The "DEFINITION" overline sits on a "Why…?" question.
  - The grade tiles are grey with coloured top borders, which looks like folder tabs.
  - The undo button has a circular border on `22`/`23` but not `24`.
  - Large empty regions sit above and below the card.
- **Fix:** Answer in primary ink. The kind label matches the card. Grade tiles carry their grade colour as a tint, not a top border. One undo style. Centre the card in the available space.

**F53 · Today hero details**
- **File:** `01` → see **B03**
- **What I see:** The emblem is cropped behind "Details" at about 8% opacity. "Quick focus" is an orphan link with about 70 px of dead space. The day strip is too abstract (a black line and an unlabelled teal square).
- **Fix:** Give the emblem its own corner. Merge "Quick focus" into the Start button (long-press or a split button). Label the strip: show the block with its glyph and time, and mark "now".

**F54 · "Needs you" mixes four affordances in one card**
- **File:** `01~scroll1`
- **What I see:** A grey button ("Review"), a checkbox ("Prove continuity"), a chevron row ("6 proposals") and a "Triage" link, with three different text starts.
- **Fix:** Make every row a list row (40 px leading icon, title, meta, trailing action) with the same trailing action style.

**F55 · Endings have no ceremony**
- **Files:** `160-review-round-complete`, `161-review-home-after-round`, `47-close-the-day-3`, `112-inbox-zero`, `153-first-run-3`
- **What I see:** The most rewarding moments in the app end on half a blank screen. `160` shows "Time –" (it looks like a bug). `161` shows "0 cards today" with two disabled buttons and a contradictory message.
- **Fix:** See the Lottie list (L-10 to L-13) and the empty-state redesigns. → **B14**

**F56 · The path "map" is a list, not a map**
- **Files:** `56`, `56~s1`, `56~s2`, `63`
- **What I see:** A vertical line of rows. Locked checkpoints have no node at all (just a dotted line). At volume, 36 rows show no overview.
- **Fix:** Make it a true map: a metro-line or constellation layout per stage, with node shapes from the README's node-state list, a mini-map scrubber, and a "you are here" halo (M-PTH-02).

**F57 · Atlas in Day and Night: dust, not stars**
- **Files:** `68`, `69`, `N/68`
- **What I see:** Nodes are 4–6 px hollow circles. The top 40% of the canvas is empty. Constellation labels collide. `69` (star selected) looks identical to `68`.
- **Fix:** A magnitude scale for node states, fit-to-content, label collision avoidance, a selected-star ring with a connection highlight, and a 44 pt hit area. → **B08**

**F58 · Atlas list is a flat 82-row (or 600-row) alphabet**
- **File:** `70` (+ scrolls), busy
- **What I see:** No grouping, no subject colour, no index scrubber. "Conjecture · not started" repeated 70 times. The header turns into an inset white panel in List mode, unlike the full-bleed header in Map mode.
- **Fix:** Group by subject (with subject colour), add an A–Z scrubber, and show the state as a glyph with no repeated words.

**F59 · The Sources tab looks legacy**
- **File:** `60` (+ scrolls)
- **What I see:** Near-square cards, red ordinals, five grey status lines including a duplicate "1 of 342 pages transcribed", scattered download links, a US date "Nov 1", and a square grey "Add, edit or remove sources" bar.
- **Fix:** A source card with a book cover or emblem, a title, a progress ring for transcription, one status chip and an overflow menu.

**F60 · Checkpoint states contradict each other**
- **Files:** `64`–`66`
- **What I see:** Evidence entries are all "⚠ Partial" (alarmist). A *demonstrated* checkpoint says "No evidence yet" (`66~s1`). "What counts" is a label with no content. The actions sheet (`65`) has three equal grey buttons and no primary.
- **Fix:** Show evidence as a timeline with neutral partial glyphs and one primary action ("Demonstrate now").

**F61 · "Goal met" on every session**
- **File:** `59` (and 300× in busy)
- **Fix:** Flag only the exceptions ("Open", "Goal missed"). → **B05**

**F62 · Session detail is heavy**
- **File:** `67`
- **What I see:** A three-line bold sans H1, a "Resolved" grey button that reads as either status or action, and a cryptic "N1" tag.
- **Fix:** A serif title clamped to two lines, a status chip vs an action button that can't be confused, and no codes.

**F63 · Card library inconsistencies**
- **File:** `80`
- **What I see:** Questions in sans here but serif in the path Cards tab and in Review. "Due first" (a sort) is styled as a filter chip and touches the right edge. "50+ cards".
- **Fix:** Card questions are always serif. Sort goes in a trailing "Sort ▾" control. Show the true count.

**F64 · Card editor**
- **Files:** `89`–`91`
- **What I see:** Raw LaTeX is typed into a *serif* textarea. The shortcut bar leads with `\newcommand` and `\DeclareMathOperator` (the rarest commands) and is clipped with no fade. The preview overline reads "OTHER".
- **Fix:** A monospace editor field with live preview underneath, the shortcut bar ordered by frequency (ℝ, ∀, ∃, ∈, →, ≤, ε, δ, ∑, ∫, x², xₙ, frac), and an edge fade. Never show "Other" on a card face.

**F65 · Inbox card details**
- **Files:** `100`, `103`, `105`, `107`
- **What I see:**
  - A line break leaves ")." orphaned at the start of a line in inline maths.
  - The card has a fixed height, leaving blank space at the bottom.
  - "Why this card?" doesn't look tappable, and `103` shows no expanded state.
  - The cloze highlight is red-pink.
- **Fix:** Keep the trailing punctuation with the maths (no-break joiner). The card hugs its content. "Why this card?" gets a chevron and an expanding panel. The cloze highlight is an indigo tint.

**F66 · Calendar Month is dense**
- **File:** `32`
- **What I see:** 42 bordered boxes, heat fills, flags, glyphs and a today ring, plus a two-line legend.
- **Fix:** Drop the per-day borders. Use fills plus small dots for planned subjects. Put the legend in a "?" popover. → **B11**

**F67 · Agenda noise**
- **File:** `33` (+ scrolls)
- **What I see:** "Nothing planned · Add" (underlined) repeats on every empty day. The time column wraps ("Due / tomorrow"). "Problem set 5 on" is truncated without an ellipsis (the parser removed the date).
- **Fix:** Collapse runs of empty days (this already works for ranges; use it for single days too). A fixed-width time column with short labels. A title clean-up after parsing.

**F68 · The Tasks screen is busy for five tasks**
- **File:** `40` (+ `~scroll1`)
- **What I see:**
  - A muddled meta row: "⚠ 1 overdue | Tasks, deadlines and practice · Triage".
  - The To do / Doing / Done segmented control plus three chips with no selected state.
  - "Plan these" floating on its own row.
  - A separate card per group.
  - Titles end in a dangling "by".
  - Two trailing controls (⋮⋮ and •••) on some rows.
- **Fix:** One header row (segmented control plus a filter icon), one list grouped by section headers, swipe actions, and the drag handle shown only in edit mode.

**F69 · New block and Planner forms**
- **Files:** `35`, `36`
- **What I see:** Four ways to set a duration (start/end, chips, a "Custom" chip on its own line, a slider). "Change time" is repeated under every planner row.
- **Fix:** Start time plus duration chips, with Custom revealing a wheel. Tap a planner row to change its time.

**F70 · Close the day is a ritual without ritual**
- **Files:** `45`–`47`
- **What I see:** "Focus (min) 140 of 20". A right-aligned "Next" (other screens use full-width primaries). Repetitive grey-button-plus-link cards. Step 3 ends on an empty half-screen.
- **Fix:** Make it a guided three-card sequence with progress dots that draw. The final step collapses the day into a "page of the notebook" summary with a seal animation (L-11).

**F71 · Plan proposal button order is reversed**
- **Files:** `109` (Reject | Approve) vs `110` (Approve | Reject); the inbox list uses Reject | Approve
- **What I see:** A search icon sits on a detail page, and the change-list icons touch the border.
- **Fix:** Always put the negative action on the left and the primary on the right.

**F72 · Appearance and Subjects pickers**
- **Files:** `141`–`144`
- **What I see:** The theme cards are generic grey-bar schematics. The colour picker shows names and glyphs but *no colour swatches*. The glyph is a raw text input. Only eight colour slots exist, so the ninth subject gets "Other" (busy).
- **Fix:** Theme cards show a real miniature of Today in each theme. Subject colour = swatch circles. Glyph = a picker from the glyph set (I-30). Generate more hues (§4 of `03`).

**F73 · Sign-in and first run**
- **Files:** `150`–`153`
- **What I see:**
  - The sign-in emblem lines cross the button and link text.
  - The bottom 35% of the screen is empty.
  - First-run H1s are sans.
  - The connector URL is raw monospace.
  - Instruction steps are not numbered.
  - "Next" is grey (no primary on the screen).
  - Each step leaves about half the screen empty.
  - There is no completion moment.
- **Fix:** See §3 of the roadmap and L-01 and L-02.

**F74 · Search sheet**
- **Files:** `10`, `11`
- **What I see:** About 140 px of dead space at the top with no title. The first action is pre-highlighted. The icon set is inconsistent (a sun for "Today's calendar", a broken rectangle). Result rows wrap to three lines with the subject in a competing right column. There are duplicate results. The sparkle "AI" icon is used for concepts.
- **Fix:** The search field sits at the top of the sheet with "Cancel". Results use two-line rows with the subject as a leading glyph. Concepts use the star glyph.

**F75 · The busy Paths list has no density or variety**
- **Files:** `busy/50` (+ scrolls)
- **What I see:** Fifteen 210 px cards; twelve identical grey flowers; titles wrapping to two lines.
- **Fix:** Seeded emblems (no repeats), a compact density toggle and "Sort: Recent / Due / A–Z". → **B12**

**F76 · Chip pickers don't scale**
- **Files:** `busy/02` (15 subject chips push "Start focus" off-screen), `busy/42` (15 single-chip rows), `busy/21` (endless toggles)
- **Fix:** Above about 8 options, switch to a searchable list with a ✓, "Recent" at the top and "Select all / none". → **B12**

**F77 · Long content isn't clamped**
- **Files:** `busy/85` (the card face runs across several screens), `busy/20~s2` (an endless decks list), `80` ("50+ cards")
- **Fix:** Clamp to 8 lines with "Show full card". Show the top 5 decks plus "All 15 decks". Show true counts. → **B12**

**F78 · The busy Today screen doesn't triage**
- **File:** `busy/01`
- **What I see:** "600 cards due · about 240 min" and "150 proposals from your tutor" with no advice. The progress bar for "0 of 600" is an empty wall, and there are two 99+ badges.
- **Fix:** When the load exceeds the daily budget, the hero becomes "Today's slice: 60 cards · 25 min" with "Why?" (this matches the product's "smaller next step, without shame" voice). The bar shows the slice, not the backlog.

**F79 · Practice uses its own visual language**
- **Files:** `26`, `27`, `27b`
- **What I see:** The info icon is used for "In 1 day". "Couldn't recall" replaces "Again". The timer row ("0:00 | Start timer | Minutes Optional") is cramped and misaligned. In the manage sheet, the primary button sits mid-sheet with History and a red "Archive topic" below it.
- **Fix:** Reuse the grade components, a timer chip and the sheet template.

**F80 · The Time log carries no colour**
- **Files:** `126`, `127`
- **What I see:** The entries have a neutral dark left bar (no subject colour), there is a big empty area, and the helper reads "· 24-hour time".
- **Fix:** Subject-colour bars, a day total on each day header, and a gentle illustration for empty weeks.

### 3.3 Praise (protect these)

- **P01 · Serif on warm paper.** "Good afternoon" (`01`), hub titles, sheet titles and path names. The Day navy heat ramp (`32`) belongs to the ink palette.
- **P02 · The principles page (`154`).** "Quiet by default · Every colour has one job · Shape before hue · One system, two lights · Mathematics is the ornament · Explain, don't block." Make it the review checklist for every PR.
- **P03 · Night "observatory".** The emblems glow on deep tiles (`N/01`, `N/50`), the focus timer is genuinely atmospheric (`N/03`) and the Atlas sky has the right mood (`N/68`).
- **P04 · Typeset mathematics.** Inline U_y, V_y, K, ℝⁿ on the inbox (`100`), review (`23`), session (`67`) and approve-all list (`105`).
- **P05 · Subject colour theming.** The Linear Algebra path turns its stars, line and progress orange (`63`). The emblem tiles on path cards (`50`) are the most distinctive element in the app.
- **P06 · Clever input.** Capture recognises "Monday 10am 45 min #real" as chips (`07`). The ghost "New block · 14:00" preview in the grid (`34`).
- **P07 · Safety and reversibility.** Undo on approvals, "Keep card" / "Delete card" with its consequences spelled out (`88`), type-to-confirm on account deletion.
- **P08 · The review round.** Segmented progress, "How sure are you?" Sure / Unsure / Guess, intervals printed on each grade ("Good · 31 days") and swipe hints.
- **P09 · Accessible charts.** "Show as table" on every chart, plus a summary sentence.
- **P10 · The calibration chart.** "When you said: Sure 94 of 100 / Unsure 71 / Guess 38 · Close to ideal" (`124~s1`) is original and genuinely useful.
- **P11 · Kind copy.** "What will you understand?", "a rest day counts too" (`busy/45`), "Next: 18 cards tomorrow".
- **P12 · Today adapts to a running focus session** (`162`): the hero card becomes "Return to focus", and the session row persists across tabs.

---

## 4. Consistency map

**Feels like one product (the "Constellation" family)**
- Today `01`/`162`, Review hub and round `20`–`24`, Paths list `50`, path map `56`/`63`, Close the day `45`–`47`, Capture `07`/`08`, the start-focus sheet `02`, Customise `21`, Inbox stack `100`/`109`, approve-all `105`, delete confirm `88`, Progress hubs `120`–`125` (structure), the Settings index `140`, Appearance `141`, sign-in `150`, the gallery `154`.

**Same family, but drifted** (bold-sans titles, info or warning icons used wrongly, box-in-box)
- Checkpoint `64`–`66`, Session `67`, Plan proposal `110`, card detail `85`, Tasks `40`, Calendar Day/Week `30`/`31`, Agenda `33`, Sources `60`, path Cards tab `61`, Atlas list `70`, first run `151`–`153`, Practice `26`–`27b`, Time log `126`.

**Outliers (look like a different, older product or are broken)**
- `43`, `51`, `58`, `87`, `128`: the broken action-sheet component.
- `44`, `130`: unstyled native forms.
- `145`–`149`: Settings sub-pages (admin forms).
- `35`, `36`: older-style calendar forms (redundant controls, Cancel/Create footers).
- `101`, `102`, `112`: swipe and empty states that look broken.
- `busy/68`: the Atlas hairball.

**Night-only outliers:** `N/32` and `N/120` (khaki heat ramp, cream "today"), `N/30` and `N/31` (events sink into the background), `N/44` (a black unpadded slab with a salmon Save), `N/149` (two different reds).

---

## 5. Top 10 fixes (in order) and top 5 to protect

**Top 10 fixes**
1. **Rebuild the ActionSheet component** (F01). One component fixes five screens.
2. **Replace the two native edit forms and the Settings sub-pages** with the standard sheet and grouped-list patterns (F02, F03, F37, F51).
3. **Use one source of truth for counts** and audit every number on Today, Review, Cards and Progress (F05, F43, F47).
4. **Chart hygiene:** tick thinning, label collision avoidance, legends that match their marks, round ticks (F06, F45, F46).
5. **One typographic system:** serif titles everywhere, and hero numerals that aren't Black-weight (F15, F16, F18).
6. **Colour semantics clean-up:** no red outside danger, status icons only for status, and one grade language (F20, F21, F22, F23).
7. **Layout economy:** collapsing headers on path detail and Calendar, one bottom action layer, and z-order rules (F04, F10, F11).
8. **States:** swipe feedback, toasts, empty states with marks, disabled-with-reason, and endings with ceremony (F07, F08, F13, F33, F36, F40, F55).
9. **Atlas and path map as signature visuals:** magnitude stars, semantic zoom and a true map (F12, F56, F57).
10. **Volume patterns:** searchable pickers, clamping, density modes, seeded emblems and triaged Today (F75–F78).

**Top 5 things to protect**
1. Serif plus warm paper, and the Night observatory: the two-light identity (P01, P03).
2. The emblems and subject-colour theming, which are the soul of the brand (P05).
3. Typeset maths everywhere a card appears (P04).
4. The written principles and the "Show as table" accessibility (P02, P09).
5. The kind, reversible, explain-don't-block tone: Undo, consequences spelled out and "a rest day counts too" (P07, P11).

---

## 6. What I could not judge

- **Tablet (768) and desktop (1280):** the zips were not supplied. I can't say whether those layouts are designed or stretched. Please send `lemma-audit-2-tablet.zip` and `lemma-audit-3-desktop.zip` for a follow-up pass.
- **Motion:** the capture had reduced motion on, so the emblem drawing, glows, sheet physics, toast timing and the shrinking header were not visible. `03_MOTION_AND_ASSETS.md` specifies what *should* happen.
- **Gestures:** swipe was shown only as two still frames; I judged the frames, not the feel.
- **Real devices:** font rendering (hinting of the serif at 13–15 px on Android), OLED behaviour of the Night navy, true contrast under sunlight, and safe areas on notched phones.
- **Performance:** whether the busy Atlas, long lists and charts stay at 60 fps.
- **Screen readers and keyboard:** out of scope for this visual audit.
- **Capture behaviour:** in a few scrolled frames the Capture button is missing (`01~scroll1`, `50~scroll1`). It may hide on scroll by design; from stills, I can't tell.
