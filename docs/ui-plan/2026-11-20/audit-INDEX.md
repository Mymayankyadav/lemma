# Lemma UI audit — phone, night theme

Source commit `6b42826` · viewport 390×844 @2x · night (graph-night) · clock frozen at Mon 9 Nov 2026, 13:43 IST (timers do not tick on their own; the capture moves the clock where a flow needs time to pass).

Read `REVIEW_BRIEF.md` first (what to judge, the design rules, the output format), then this file, then the sheets.

## How to read the pictures

- **Sheets** (`sheets/*.png`, 1568px wide) put up to 4 phone frames side by side, in walkthrough order. Each frame is captioned with its id (`F###` populated, `E###` empty, `H###` heavy), the screen and the state. Open `frames/<file>` (2x, full resolution) when a detail is too small.
- Frames of one flow are adjacent and in the order a person would see them (open sheet → typed → saved → result). `1/3`, `2/3`… are scroll positions of one long screen (each step scrolls about 80% of a screen, so content overlaps a little). The bottom tab bar and top header are fixed, so they repeat on every scroll frame.
- Profiles: **E = empty** (a brand-new account: no paths, cards, tasks, blocks, sessions) and **F = populated** (a typical amount of data: 3 paths, ~90 cards, 23 reviews due, 6 proposals, a few tasks and blocks). **H = heavy** (stress data) exists only when captured with `--profiles heavy`.
- A red `ERROR SCREEN` / `H-SCROLL` on a caption is automatic: the app showed its error page, or the page scrolls sideways. An orange line is a capture warning: a step could not be performed, so the frame may not show the intended state (treat that as a capture gap, not a product bug, unless the control really is missing).
- `manifest.json` carries the same data for tools, with DOM facts per frame (`targetsUnder40px`: visible controls smaller than 40px in either direction; `clippedOffscreen`: elements cut by the screen edge) and console errors per scene.

## Scene map (same screen, different profiles)

| Scene | What | F frames | E frames |
|---|---|---|---|
| `sign-in` | Sign in — first screen a signed-out person sees | F001 | E001 |
| `welcome` | Welcome: three skippable first-run steps — connect tutor, then the next steps | F002–F003 | E002–E003 |
| `not-found` | Not found (unknown address) — the 404 page and its way home | F004 | E004 |
| `today` | Today — hero card, plan card, ruler, needs-you, continue, path cards | F005–F007 | E005–E006 |
| `today-search` | Search sheet | F008–F015 | E007–E012 |
| `today-weekday-minutes` | Set weekday study minutes | F016 | E013 |
| `today-quick-focus` | Quick focus sheet | F017–F019 | E014–E015 |
| `today-decision` | Plan card: decision details | F020–F022 | E016–E017 |
| `today-complete-task` | Complete a task from Today | F023–F024 | — |
| `capture-sheet` | Capture sheet: empty, type picker | F025 | E018 |
| `capture-task` | Add a task by typing a sentence — recognised tokens, footer says what will be created, toast, task appears | F026–F030 | E019–E022 |
| `capture-task-plain` | Add a task: plain sentence with a due day | F031–F032 | E023–E024 |
| `capture-task-more` | Capture → More options (full task form) | F033–F034 | E025–E026 |
| `capture-block` | Add a time block | F035–F038 | E027–E030 |
| `capture-card` | Add a card (front :: back) — empty account goes through the first-card form | F039–F040 | E031–E035 |
| `capture-card-invalid` | Card without a back: disabled reason | F041 | E036 |
| `capture-thought` | Park a thought | F042–F043 | E037–E038 |
| `capture-from-calendar` | Capture opened from another screen (Calendar) | F044 | E039 |
| `tasks-list` | Tasks: To do / Doing / Done | F045–F047 | E040–E042 |
| `tasks-filters` | Tasks: filters (path, overdue, high priority) | F048–F050 | — |
| `tasks-new` | New task form: fill every field — form labels, validation, date picker, save | F051–F057 | E043–E049 |
| `tasks-edit` | Task: Edit, Schedule from the actions menu | F058–F061 | — |
| `tasks-delete` | Task: delete and undo | F062 | — |
| `tasks-actions` | Task: more actions, edit and complete | F063–F064 | — |
| `tasks-plan` | Plan these (tasks into the calendar) | F065–F066 | — |
| `calendar-day` | Calendar: Day | F067–F068 | E050–E051 |
| `calendar-week` | Calendar: Week | F069–F070 | E052–E053 |
| `calendar-month` | Calendar: Month | F071–F072 | E054–E055 |
| `calendar-agenda` | Calendar: Agenda | F073–F075 | E056–E057 |
| `calendar-quick-add` | Calendar: quick add | F076–F077 | E058–E059 |
| `calendar-new-block` | Calendar: new block form — every field, validation, save | F078–F079 | E060–E061 |
| `calendar-planner` | Calendar: planner (Adjust / Add all) | F080–F081 | E062–E063 |
| `calendar-block-details` | Calendar: open a block | F082–F084 | — |
| `calendar-triage` | Calendar: triage overdue | F085–F086 | — |
| `paths-list` | Paths list and its tabs | F087–F091 | E064–E067 |
| `paths-more` | Path: more menu | F092 | — |
| `paths-search` | Paths: search | F093–F094 | — |
| `path-new` | New path form — name, sources, create, and the brand-new empty path afterwards | F095–F099 | E068–E071 |
| `path-new-tutor` | New path → Continue with tutor — the tutor chat opened for the path just created: does it carry the new path name? | F100–F101 | E072–E073 |
| `path-map` | Path page (Map tab) | F102–F104 | — |
| `path-tabs` | Path page tabs: Sessions, Sources, Cards | F105–F113 | — |
| `checkpoint` | Checkpoint page (current) | F114–F116 | — |
| `checkpoint-future` | Checkpoint page (locked, future) | F117–F118 | — |
| `checkpoint-actions` | Checkpoint: more actions | F119 | — |
| `session` | Tutor session page | F120–F122 | — |
| `path-missing` | Path or checkpoint that does not exist | F123–F124 | E074–E075 |
| `cards-list` | Cards browser | F125–F128 | E076 |
| `cards-filters` | Cards: filters and search | F129–F131 | — |
| `card-detail` | Card detail | F132–F134 | — |
| `card-editor` | Card editor (new card) | F135–F136 | E077–E078 |
| `card-edit` | Edit an existing card | F137 | — |
| `card-missing` | Card that does not exist | F138 | E079 |
| `review-hub` | Review hub | F139–F140 | E080–E081 |
| `review-customise` | Review: customise the round | F141–F142 | — |
| `review-table` | Review: forecast as a table | F143 | — |
| `review-run` | Review round: question, answer, rating — one full card cycle | F144–F149 | — |
| `review-complete` | Review: finish the whole round → done screen — the end of a round and the empty Review hub afterwards | F150–F154 | — |
| `review-idle` | Review run with nothing in progress | F155 | E082 |
| `review-done` | Review done | F156 | E083 |
| `inbox-cards` | Inbox: card proposals | F157–F158 | E084 |
| `inbox-list` | Inbox: list view | F159–F160 | — |
| `inbox-plans` | Inbox: plan proposals | F161–F162 | E085 |
| `inbox-approve` | Inbox: approve, edit and reject a card | F163–F166 | — |
| `inbox-zero` | Inbox: decide everything → empty Inbox — the "all caught up" state and the badge disappearing | F167–F169 | — |
| `inbox-plan-detail` | Plan proposal: compare whole plan | F170–F172 | — |
| `atlas-map` | Atlas: map | F173 | E086 |
| `atlas-list` | Atlas: list | F174–F176 | E087 |
| `atlas-search` | Atlas: search and legend | F177–F179 | E088–E089 |
| `atlas-tabs` | Atlas: Themes and Bridges | F180–F181 | — |
| `atlas-select` | Atlas: select a concept, open its details | F182–F186 | — |
| `insights` | Progress: overview | F187–F189 | E090–E091 |
| `insights-ranges` | Progress: 30 and 90 days, table view | F190–F193 | E092–E095 |
| `insights-learning` | Progress: Learning tab | F194–F197 | E096–E097 |
| `insights-time` | Progress: Time tab | F198–F200 | E098 |
| `time-log` | Time log (week) | F201 | E099 |
| `time-log-add` | Time log: add time manually | F202 | E100 |
| `time-log-day` | Time log: one day | F203–F204 | E101–E102 |
| `week` | Your week (digest page) | F205 | E103 |
| `focus-idle` | Focus with nothing running | F206 | E104 |
| `focus-run` | Focus: start, running, pause, break, finish and save | F207–F216 | — |
| `focus-quick` | Quick focus: start from the sheet | F217 | E105–E106 |
| `today-running` | Today while a focus session runs | F218–F219 | — |
| `practice` | Practice topics | F220 | E107 |
| `close-day` | Close the day (3 steps) | F221–F223 | E108 |
| `settings-root` | Settings | F224 | E109 |
| `settings-appearance` | Settings: appearance | F225–F226 | E110–E111 |
| `settings-tutor` | Settings: tutor | F227–F228 | E112–E113 |
| `settings-study` | Settings: study | F229–F230 | E114–E115 |
| `settings-planning` | Settings: planning | F231–F232 | E116–E117 |
| `settings-reminders` | Settings: reminders | F233–F234 | E118–E119 |
| `settings-subjects` | Settings: subjects | F235 | E120 |
| `settings-data` | Settings: data | F236–F237 | E121–E122 |
| `settings-tutor-rows` | Settings → tutor: open every row — each picker/dialog a row opens | F238–F241 | E123–E126 |
| `settings-study-rows` | Settings → study: open every row — each picker/dialog a row opens | F242–F250 | E127–E135 |
| `settings-planning-rows` | Settings → planning: open every row — each picker/dialog a row opens | F251–F257 | E136–E142 |
| `settings-reminders-rows` | Settings → reminders: open every row — each picker/dialog a row opens | F258–F265 | E143–E150 |
| `settings-appearance-options` | Settings → Appearance: paper and sky options (night) — each paper (Plain, Graph, Dot, Ruled) and sky (Clear, Stars) in the night theme | F266–F271 | E151–E156 |
| `settings-subjects-rows` | Settings → Subjects: open each subject | F272–F274 | — |
| `settings-data-actions` | Settings → Data and account: Delete confirmation (not confirmed) | F275–F277 | E157–E159 |
| `settings-reminders-on` | Settings → Reminders: turn reminders on | F278–F280 | E160–E162 |
| `tutor-chat` | Tutor chat (checkpoint) | F281–F282 | — |
| `pad` | Lemma Pad | F283 | E163 |
| `today-morning` | Today at morning (2026-11-09 07:30) — greeting, hero card and plan change with the time of day | F284–F286 | E164–E165 |
| `today-evening` | Today at evening (2026-11-09 21:15) — greeting, hero card and plan change with the time of day | F287–F289 | E166–E167 |
| `today-night` | Today at night (2026-11-10 00:40) — greeting, hero card and plan change with the time of day | F290–F292 | E168–E169 |
| `today-weekend` | Today at weekend (2026-11-14 10:00) — greeting, hero card and plan change with the time of day | F293–F295 | E170–E171 |
| `offline` | Offline banner | F296–F297 | E172–E173 |
| `large-text-today` | Large system text (130%): today — nothing clipped, overlapping or unreachable at 130% text | F298–F300 | E174–E175 |
| `large-text-capture` | Large system text (130%): capture — nothing clipped, overlapping or unreachable at 130% text | F301 | E176 |
| `large-text-tasks` | Large system text (130%): tasks — nothing clipped, overlapping or unreachable at 130% text | F302–F303 | E177 |
| `large-text-review` | Large system text (130%): review — nothing clipped, overlapping or unreachable at 130% text | F304–F306 | E178–E180 |
| `large-text-settings` | Large system text (130%): settings — nothing clipped, overlapping or unreachable at 130% text | F307–F308 | E181–E182 |
| `long-text` | Very long titles and unusual characters — wrapping/truncation of a 150-character task, math and non-Latin text | F309–F310 | — |

## Profile: Populated (typical amount of data)

| Sheet | Frames | Screens |
|---|---|---|
| `sheets/full-sheet-01.png` | F001–F004 | Sign in; Welcome: three skippable first-run steps; Not found (unknown address) |
| `sheets/full-sheet-02.png` | F005–F008 | Today; Search sheet |
| `sheets/full-sheet-03.png` | F009–F012 | Search sheet |
| `sheets/full-sheet-04.png` | F013–F016 | Search sheet; Set weekday study minutes |
| `sheets/full-sheet-05.png` | F017–F020 | Quick focus sheet; Plan card: decision details |
| `sheets/full-sheet-06.png` | F021–F024 | Plan card: decision details; Complete a task from Today |
| `sheets/full-sheet-07.png` | F025–F028 | Capture sheet: empty, type picker; Add a task by typing a sentence |
| `sheets/full-sheet-08.png` | F029–F032 | Add a task by typing a sentence; Add a task: plain sentence with a due day |
| `sheets/full-sheet-09.png` | F033–F036 | Capture → More options (full task form); Add a time block |
| `sheets/full-sheet-10.png` | F037–F040 | Add a time block; Add a card (front :: back) |
| `sheets/full-sheet-11.png` | F041–F044 | Card without a back: disabled reason; Park a thought; Capture opened from another screen (Calendar) |
| `sheets/full-sheet-12.png` | F045–F048 | Tasks: To do / Doing / Done; Tasks: filters (path, overdue, high priority) |
| `sheets/full-sheet-13.png` | F049–F052 | Tasks: filters (path, overdue, high priority); New task form: fill every field |
| `sheets/full-sheet-14.png` | F053–F056 | New task form: fill every field |
| `sheets/full-sheet-15.png` | F057–F060 | New task form: fill every field; Task: Edit, Schedule from the actions menu |
| `sheets/full-sheet-16.png` | F061–F064 | Task: Edit, Schedule from the actions menu; Task: delete and undo; Task: more actions, edit and complete |
| `sheets/full-sheet-17.png` | F065–F066 | Plan these (tasks into the calendar) |
| `sheets/full-sheet-18.png` | F067–F070 | Calendar: Day; Calendar: Week |
| `sheets/full-sheet-19.png` | F071–F074 | Calendar: Month; Calendar: Agenda |
| `sheets/full-sheet-20.png` | F075–F078 | Calendar: Agenda; Calendar: quick add; Calendar: new block form |
| `sheets/full-sheet-21.png` | F079–F082 | Calendar: new block form; Calendar: planner (Adjust / Add all); Calendar: open a block |
| `sheets/full-sheet-22.png` | F083–F086 | Calendar: open a block; Calendar: triage overdue |
| `sheets/full-sheet-23.png` | F087–F090 | Paths list and its tabs |
| `sheets/full-sheet-24.png` | F091–F094 | Paths list and its tabs; Path: more menu; Paths: search |
| `sheets/full-sheet-25.png` | F095–F098 | New path form |
| `sheets/full-sheet-26.png` | F099–F102 | New path form; New path → Continue with tutor; Path page (Map tab) |
| `sheets/full-sheet-27.png` | F103–F106 | Path page (Map tab); Path page tabs: Sessions, Sources, Cards |
| `sheets/full-sheet-28.png` | F107–F110 | Path page tabs: Sessions, Sources, Cards |
| `sheets/full-sheet-29.png` | F111–F114 | Path page tabs: Sessions, Sources, Cards; Checkpoint page (current) |
| `sheets/full-sheet-30.png` | F115–F118 | Checkpoint page (current); Checkpoint page (locked, future) |
| `sheets/full-sheet-31.png` | F119–F122 | Checkpoint: more actions; Tutor session page |
| `sheets/full-sheet-32.png` | F123–F124 | Path or checkpoint that does not exist |
| `sheets/full-sheet-33.png` | F125–F128 | Cards browser |
| `sheets/full-sheet-34.png` | F129–F132 | Cards: filters and search; Card detail |
| `sheets/full-sheet-35.png` | F133–F136 | Card detail; Card editor (new card) |
| `sheets/full-sheet-36.png` | F137–F138 | Edit an existing card; Card that does not exist |
| `sheets/full-sheet-37.png` | F139–F142 | Review hub; Review: customise the round |
| `sheets/full-sheet-38.png` | F143–F146 | Review: forecast as a table; Review round: question, answer, rating |
| `sheets/full-sheet-39.png` | F147–F150 | Review round: question, answer, rating; Review: finish the whole round → done screen |
| `sheets/full-sheet-40.png` | F151–F154 | Review: finish the whole round → done screen |
| `sheets/full-sheet-41.png` | F155–F156 | Review run with nothing in progress; Review done |
| `sheets/full-sheet-42.png` | F157–F160 | Inbox: card proposals; Inbox: list view |
| `sheets/full-sheet-43.png` | F161–F164 | Inbox: plan proposals; Inbox: approve, edit and reject a card |
| `sheets/full-sheet-44.png` | F165–F168 | Inbox: approve, edit and reject a card; Inbox: decide everything → empty Inbox |
| `sheets/full-sheet-45.png` | F169–F172 | Inbox: decide everything → empty Inbox; Plan proposal: compare whole plan |
| `sheets/full-sheet-46.png` | F173–F176 | Atlas: map; Atlas: list |
| `sheets/full-sheet-47.png` | F177–F180 | Atlas: search and legend; Atlas: Themes and Bridges |
| `sheets/full-sheet-48.png` | F181–F184 | Atlas: Themes and Bridges; Atlas: select a concept, open its details |
| `sheets/full-sheet-49.png` | F185–F186 | Atlas: select a concept, open its details |
| `sheets/full-sheet-50.png` | F187–F190 | Progress: overview; Progress: 30 and 90 days, table view |
| `sheets/full-sheet-51.png` | F191–F194 | Progress: 30 and 90 days, table view; Progress: Learning tab |
| `sheets/full-sheet-52.png` | F195–F198 | Progress: Learning tab; Progress: Time tab |
| `sheets/full-sheet-53.png` | F199–F202 | Progress: Time tab; Time log (week); Time log: add time manually |
| `sheets/full-sheet-54.png` | F203–F205 | Time log: one day; Your week (digest page) |
| `sheets/full-sheet-55.png` | F206–F209 | Focus with nothing running; Focus: start, running, pause, break, finish and save |
| `sheets/full-sheet-56.png` | F210–F213 | Focus: start, running, pause, break, finish and save |
| `sheets/full-sheet-57.png` | F214–F217 | Focus: start, running, pause, break, finish and save; Quick focus: start from the sheet |
| `sheets/full-sheet-58.png` | F218–F221 | Today while a focus session runs; Practice topics; Close the day (3 steps) |
| `sheets/full-sheet-59.png` | F222–F223 | Close the day (3 steps) |
| `sheets/full-sheet-60.png` | F224–F227 | Settings; Settings: appearance; Settings: tutor |
| `sheets/full-sheet-61.png` | F228–F231 | Settings: tutor; Settings: study; Settings: planning |
| `sheets/full-sheet-62.png` | F232–F235 | Settings: planning; Settings: reminders; Settings: subjects |
| `sheets/full-sheet-63.png` | F236–F239 | Settings: data; Settings → tutor: open every row |
| `sheets/full-sheet-64.png` | F240–F243 | Settings → tutor: open every row; Settings → study: open every row |
| `sheets/full-sheet-65.png` | F244–F247 | Settings → study: open every row |
| `sheets/full-sheet-66.png` | F248–F251 | Settings → study: open every row; Settings → planning: open every row |
| `sheets/full-sheet-67.png` | F252–F255 | Settings → planning: open every row |
| `sheets/full-sheet-68.png` | F256–F259 | Settings → planning: open every row; Settings → reminders: open every row |
| `sheets/full-sheet-69.png` | F260–F263 | Settings → reminders: open every row |
| `sheets/full-sheet-70.png` | F264–F267 | Settings → reminders: open every row; Settings → Appearance: paper and sky options (night) |
| `sheets/full-sheet-71.png` | F268–F271 | Settings → Appearance: paper and sky options (night) |
| `sheets/full-sheet-72.png` | F272–F275 | Settings → Subjects: open each subject; Settings → Data and account: Delete confirmation (not confirmed) |
| `sheets/full-sheet-73.png` | F276–F279 | Settings → Data and account: Delete confirmation (not confirmed); Settings → Reminders: turn reminders on |
| `sheets/full-sheet-74.png` | F280–F281 | Settings → Reminders: turn reminders on; Tutor chat (checkpoint) |
| `sheets/full-sheet-75.png` | F282–F283 | Tutor chat (checkpoint); Lemma Pad |
| `sheets/full-sheet-76.png` | F284–F287 | Today at morning (2026-11-09 07:30); Today at evening (2026-11-09 21:15) |
| `sheets/full-sheet-77.png` | F288–F291 | Today at evening (2026-11-09 21:15); Today at night (2026-11-10 00:40) |
| `sheets/full-sheet-78.png` | F292–F295 | Today at night (2026-11-10 00:40); Today at weekend (2026-11-14 10:00) |
| `sheets/full-sheet-79.png` | F296–F299 | Offline banner; Large system text (130%): today |
| `sheets/full-sheet-80.png` | F300–F303 | Large system text (130%): today; Large system text (130%): capture; Large system text (130%): tasks |
| `sheets/full-sheet-81.png` | F304–F307 | Large system text (130%): review; Large system text (130%): settings |
| `sheets/full-sheet-82.png` | F308–F310 | Large system text (130%): settings; Very long titles and unusual characters |

### Frames

| Frame | Screen | State | Note |
|---|---|---|---|
| F001 | Sign in | top |  |
| F002 | Welcome: three skippable first-run steps | step 1 |  |
| F003 | Welcome: three skippable first-run steps | step 2 |  |
| F004 | Not found (unknown address) | top |  |
| F005 | Today | top (1/3) |  |
| F006 | Today | top (2/3) |  |
| F007 | Today | top (3/3) |  |
| F008 | Search sheet | opened (1/3) |  |
| F009 | Search sheet | opened (2/3) |  |
| F010 | Search sheet | opened (3/3) |  |
| F011 | Search sheet | typed "compact" (1/2) |  |
| F012 | Search sheet | typed "compact" (2/2) |  |
| F013 | Search sheet | no results (1/3) |  |
| F014 | Search sheet | no results (2/3) |  |
| F015 | Search sheet | no results (3/3) |  |
| F016 | Set weekday study minutes | opened |  |
| F017 | Quick focus sheet | opened (1/3) |  |
| F018 | Quick focus sheet | opened (2/3) |  |
| F019 | Quick focus sheet | opened (3/3) |  |
| F020 | Plan card: decision details | expanded (1/3) |  |
| F021 | Plan card: decision details | expanded (2/3) |  |
| F022 | Plan card: decision details | expanded (3/3) |  |
| F023 | Complete a task from Today | before |  |
| F024 | Complete a task from Today | after completing (toast, ∎) |  |
| F025 | Capture sheet: empty, type picker | opened (nothing typed) |  |
| F026 | Add a task by typing a sentence | typed: a date+time+length is read as a Time block |  |
| F027 | Add a task by typing a sentence | type switched to Task: same tokens, different footer |  |
| F028 | Add a task by typing a sentence | added: toast with Undo |  |
| F029 | Add a task by typing a sentence | the new task in Tasks (1/2) |  |
| F030 | Add a task by typing a sentence | the new task in Tasks (2/2) |  |
| F031 | Add a task: plain sentence with a due day | typed: recognised as a task |  |
| F032 | Add a task: plain sentence with a due day | added |  |
| F033 | Capture → More options (full task form) | full task form prefilled (1/2) |  |
| F034 | Capture → More options (full task form) | full task form prefilled (2/2) |  |
| F035 | Add a time block | typed as a time block |  |
| F036 | Add a time block | added |  |
| F037 | Add a time block | the block on tomorrow (1/2) |  |
| F038 | Add a time block | the block on tomorrow (2/2) |  |
| F039 | Add a card (front :: back) | typed as a card |  |
| F040 | Add a card (front :: back) | after Add card |  |
| F041 | Card without a back: disabled reason | Add card unavailable, reason shown |  |
| F042 | Park a thought | typed as a thought |  |
| F043 | Park a thought | parked: toast |  |
| F044 | Capture opened from another screen (Calendar) | over Calendar |  |
| F045 | Tasks: To do / Doing / Done | To do |  |
| F046 | Tasks: To do / Doing / Done | Doing |  |
| F047 | Tasks: To do / Doing / Done | Done |  |
| F048 | Tasks: filters (path, overdue, high priority) | path filter sheet |  |
| F049 | Tasks: filters (path, overdue, high priority) | Overdue only |  |
| F050 | Tasks: filters (path, overdue, high priority) | High priority |  |
| F051 | New task form: fill every field | blank form |  |
| F052 | New task form: fill every field | Save with no title: validation |  |
| F053 | New task form: fill every field | title, High priority, Date chosen (1/2) |  |
| F054 | New task form: fill every field | title, High priority, Date chosen (2/2) |  |
| F055 | New task form: fill every field | Date & time chosen (1/2) |  |
| F056 | New task form: fill every field | Date & time chosen (2/2) |  |
| F057 | New task form: fill every field | path picker | ⚠ save: Could not find "Save task" |
| F058 | Task: Edit, Schedule from the actions menu | Edit task sheet (1/2) |  |
| F059 | Task: Edit, Schedule from the actions menu | Edit task sheet (2/2) |  |
| F060 | Task: Edit, Schedule from the actions menu | Schedule (1/2) |  |
| F061 | Task: Edit, Schedule from the actions menu | Schedule (2/2) |  |
| F062 | Task: delete and undo | confirm or toast |  |
| F063 | Task: more actions, edit and complete | actions menu |  |
| F064 | Task: more actions, edit and complete | after Complete: toast |  |
| F065 | Plan these (tasks into the calendar) | planner (1/2) |  |
| F066 | Plan these (tasks into the calendar) | planner (2/2) |  |
| F067 | Calendar: Day | day (1/2) |  |
| F068 | Calendar: Day | day (2/2) |  |
| F069 | Calendar: Week | week (1/2) |  |
| F070 | Calendar: Week | week (2/2) |  |
| F071 | Calendar: Month | month (1/2) |  |
| F072 | Calendar: Month | month (2/2) |  |
| F073 | Calendar: Agenda | agenda (1/3) |  |
| F074 | Calendar: Agenda | agenda (2/3) |  |
| F075 | Calendar: Agenda | agenda (3/3) |  |
| F076 | Calendar: quick add | quick add (1/2) |  |
| F077 | Calendar: quick add | quick add (2/2) |  |
| F078 | Calendar: new block form | blank block form (1/2) |  |
| F079 | Calendar: new block form | blank block form (2/2) | ⚠ save: Could not find "/^(Save/Add) (time )?block/" |
| F080 | Calendar: planner (Adjust / Add all) | planner (1/2) |  |
| F081 | Calendar: planner (Adjust / Add all) | planner (2/2) |  |
| F082 | Calendar: open a block | block sheet (1/3) |  |
| F083 | Calendar: open a block | block sheet (2/3) |  |
| F084 | Calendar: open a block | block sheet (3/3) |  |
| F085 | Calendar: triage overdue | triage (1/2) |  |
| F086 | Calendar: triage overdue | triage (2/2) |  |
| F087 | Paths list and its tabs | Active (1/2) |  |
| F088 | Paths list and its tabs | Active (2/2) |  |
| F089 | Paths list and its tabs | Paused |  |
| F090 | Paths list and its tabs | Done |  |
| F091 | Paths list and its tabs | Archived |  |
| F092 | Path: more menu | menu |  |
| F093 | Paths: search | results |  |
| F094 | Paths: search | no results |  |
| F095 | New path form | blank (Create path disabled until a name) (1/2) |  |
| F096 | New path form | blank (Create path disabled until a name) (2/2) |  |
| F097 | New path form | name typed |  |
| F098 | New path form | after Create path: the new, empty path (1/2) |  |
| F099 | New path form | after Create path: the new, empty path (2/2) |  |
| F100 | New path → Continue with tutor | new empty path, before tapping |  |
| F101 | New path → Continue with tutor | after Continue with tutor | ⚠ begin: Could not find "Begin session"; ⚠ write: Could not find "Write a question" |
| F102 | Path page (Map tab) | Map (1/3) |  |
| F103 | Path page (Map tab) | Map (2/3) |  |
| F104 | Path page (Map tab) | Map (3/3) |  |
| F105 | Path page tabs: Sessions, Sources, Cards | /^Sessions/ (1/3) |  |
| F106 | Path page tabs: Sessions, Sources, Cards | /^Sessions/ (2/3) |  |
| F107 | Path page tabs: Sessions, Sources, Cards | /^Sessions/ (3/3) |  |
| F108 | Path page tabs: Sessions, Sources, Cards | /^Sources/ (1/3) |  |
| F109 | Path page tabs: Sessions, Sources, Cards | /^Sources/ (2/3) |  |
| F110 | Path page tabs: Sessions, Sources, Cards | /^Sources/ (3/3) |  |
| F111 | Path page tabs: Sessions, Sources, Cards | /^Cards/ (1/3) |  |
| F112 | Path page tabs: Sessions, Sources, Cards | /^Cards/ (2/3) |  |
| F113 | Path page tabs: Sessions, Sources, Cards | /^Cards/ (3/3) |  |
| F114 | Checkpoint page (current) | CP4 (1/3) |  |
| F115 | Checkpoint page (current) | CP4 (2/3) |  |
| F116 | Checkpoint page (current) | CP4 (3/3) |  |
| F117 | Checkpoint page (locked, future) | CP8 (1/2) |  |
| F118 | Checkpoint page (locked, future) | CP8 (2/2) |  |
| F119 | Checkpoint: more actions | menu |  |
| F120 | Tutor session page | session (1/3) |  |
| F121 | Tutor session page | session (2/3) |  |
| F122 | Tutor session page | session (3/3) |  |
| F123 | Path or checkpoint that does not exist | unknown path |  |
| F124 | Path or checkpoint that does not exist | unknown checkpoint |  |
| F125 | Cards browser | list (1/4) |  |
| F126 | Cards browser | list (2/4) |  |
| F127 | Cards browser | list (3/4) |  |
| F128 | Cards browser | list (4/4) |  |
| F129 | Cards: filters and search | Path filter |  |
| F130 | Cards: filters and search | State filter |  |
| F131 | Cards: filters and search | search with no results |  |
| F132 | Card detail | card 1 (1/3) |  |
| F133 | Card detail | card 1 (2/3) |  |
| F134 | Card detail | card 1 (3/3) |  |
| F135 | Card editor (new card) | blank editor (1/2) |  |
| F136 | Card editor (new card) | blank editor (2/2) |  |
| F137 | Edit an existing card | edit sheet |  |
| F138 | Card that does not exist | missing card |  |
| F139 | Review hub | hub (1/2) |  |
| F140 | Review hub | hub (2/2) |  |
| F141 | Review: customise the round | customise (1/2) |  |
| F142 | Review: customise the round | customise (2/2) |  |
| F143 | Review: forecast as a table | table |  |
| F144 | Review round: question, answer, rating | question |  |
| F145 | Review round: question, answer, rating | confidence chosen |  |
| F146 | Review round: question, answer, rating | scratch paper |  |
| F147 | Review round: question, answer, rating | answer revealed |  |
| F148 | Review round: question, answer, rating | after rating: next card |  |
| F149 | Review round: question, answer, rating | after undo |  |
| F150 | Review: finish the whole round → done screen | after the last card |  |
| F151 | Review: finish the whole round → done screen | Review hub with nothing due (1/2) |  |
| F152 | Review: finish the whole round → done screen | Review hub with nothing due (2/2) |  |
| F153 | Review: finish the whole round → done screen | Today afterwards (1/2) |  |
| F154 | Review: finish the whole round → done screen | Today afterwards (2/2) |  |
| F155 | Review run with nothing in progress | no round |  |
| F156 | Review done | done |  |
| F157 | Inbox: card proposals | Cards tab (1/2) |  |
| F158 | Inbox: card proposals | Cards tab (2/2) |  |
| F159 | Inbox: list view | list view (1/2) |  |
| F160 | Inbox: list view | list view (2/2) |  |
| F161 | Inbox: plan proposals | Plans tab (1/2) |  |
| F162 | Inbox: plan proposals | Plans tab (2/2) |  |
| F163 | Inbox: approve, edit and reject a card | Edit proposal (1/2) |  |
| F164 | Inbox: approve, edit and reject a card | Edit proposal (2/2) |  |
| F165 | Inbox: approve, edit and reject a card | after Approve: toast |  |
| F166 | Inbox: approve, edit and reject a card | after Reject |  |
| F167 | Inbox: decide everything → empty Inbox | empty Inbox |  |
| F168 | Inbox: decide everything → empty Inbox | Today: no more "needs you" (1/2) |  |
| F169 | Inbox: decide everything → empty Inbox | Today: no more "needs you" (2/2) |  |
| F170 | Plan proposal: compare whole plan | plan proposal (1/3) |  |
| F171 | Plan proposal: compare whole plan | plan proposal (2/3) |  |
| F172 | Plan proposal: compare whole plan | plan proposal (3/3) |  |
| F173 | Atlas: map | map |  |
| F174 | Atlas: list | list (1/3) |  |
| F175 | Atlas: list | list (2/3) |  |
| F176 | Atlas: list | list (3/3) |  |
| F177 | Atlas: search and legend | search |  |
| F178 | Atlas: search and legend | search "comp" |  |
| F179 | Atlas: search and legend | legend |  |
| F180 | Atlas: Themes and Bridges | Themes |  |
| F181 | Atlas: Themes and Bridges | Bridges |  |
| F182 | Atlas: select a concept, open its details | tapped the Compactness area of the map |  |
| F183 | Atlas: select a concept, open its details | concept details (1/4) |  |
| F184 | Atlas: select a concept, open its details | concept details (2/4) |  |
| F185 | Atlas: select a concept, open its details | concept details (3/4) |  |
| F186 | Atlas: select a concept, open its details | concept details (4/4) |  |
| F187 | Progress: overview | overview (1/3) |  |
| F188 | Progress: overview | overview (2/3) |  |
| F189 | Progress: overview | overview (3/3) |  |
| F190 | Progress: 30 and 90 days, table view | 30 days (1/2) |  |
| F191 | Progress: 30 and 90 days, table view | 30 days (2/2) |  |
| F192 | Progress: 30 and 90 days, table view | 90 days |  |
| F193 | Progress: 30 and 90 days, table view | chart as table |  |
| F194 | Progress: Learning tab | learning (1/4) |  |
| F195 | Progress: Learning tab | learning (2/4) |  |
| F196 | Progress: Learning tab | learning (3/4) |  |
| F197 | Progress: Learning tab | learning (4/4) |  |
| F198 | Progress: Time tab | time (1/3) |  |
| F199 | Progress: Time tab | time (2/3) |  |
| F200 | Progress: Time tab | time (3/3) |  |
| F201 | Time log (week) | week |  |
| F202 | Time log: add time manually | add time form |  |
| F203 | Time log: one day | Sunday 8 Nov |  |
| F204 | Time log: one day | Friday 6 Nov |  |
| F205 | Your week (digest page) | week digest |  |
| F206 | Focus with nothing running | no session |  |
| F207 | Focus: start, running, pause, break, finish and save | just started (00:00) |  |
| F208 | Focus: start, running, pause, break, finish and save | running, 12 min in |  |
| F209 | Focus: start, running, pause, break, finish and save | thought parked during focus |  |
| F210 | Focus: start, running, pause, break, finish and save | paused |  |
| F211 | Focus: start, running, pause, break, finish and save | resumed, 25 min in |  |
| F212 | Focus: start, running, pause, break, finish and save | break |  |
| F213 | Focus: start, running, pause, break, finish and save | drifted marked |  |
| F214 | Focus: start, running, pause, break, finish and save | finish sheet: what happened |  |
| F215 | Focus: start, running, pause, break, finish and save | after saving (1/2) |  |
| F216 | Focus: start, running, pause, break, finish and save | after saving (2/2) |  |
| F217 | Quick focus: start from the sheet | sheet | ⚠ start: locator.click: Timeout 4000ms exceeded. |
| F218 | Today while a focus session runs | Today with a running session (1/2) |  |
| F219 | Today while a focus session runs | Today with a running session (2/2) |  |
| F220 | Practice topics | practice |  |
| F221 | Close the day (3 steps) | 1 · today (1/3) |  |
| F222 | Close the day (3 steps) | 1 · today (2/3) |  |
| F223 | Close the day (3 steps) | 1 · today (3/3) |  |
| F224 | Settings | root |  |
| F225 | Settings: appearance | top (1/2) |  |
| F226 | Settings: appearance | top (2/2) |  |
| F227 | Settings: tutor | top (1/2) |  |
| F228 | Settings: tutor | top (2/2) |  |
| F229 | Settings: study | top (1/2) |  |
| F230 | Settings: study | top (2/2) |  |
| F231 | Settings: planning | top (1/2) |  |
| F232 | Settings: planning | top (2/2) |  |
| F233 | Settings: reminders | top (1/2) |  |
| F234 | Settings: reminders | top (2/2) |  |
| F235 | Settings: subjects | top |  |
| F236 | Settings: data | top (1/2) |  |
| F237 | Settings: data | top (2/2) |  |
| F238 | Settings → tutor: open every row | tutor: Checkpoint chat |  |
| F239 | Settings → tutor: open every row | tutor: Manual handoff |  |
| F240 | Settings → tutor: open every row | tutor: ChatGPT plan on this phone |  |
| F241 | Settings → tutor: open every row | tutor: Last connector activity |  |
| F242 | Settings → study: open every row | study: Target recall |  |
| F243 | Settings → study: open every row | study: New cards a day |  |
| F244 | Settings → study: open every row | study: Default mode |  |
| F245 | Settings → study: open every row | study: Focus |  |
| F246 | Settings → study: open every row | study: Break |  |
| F247 | Settings → study: open every row | study: Long break |  |
| F248 | Settings → study: open every row | study: Cards a day |  |
| F249 | Settings → study: open every row | study: Minutes a day |  |
| F250 | Settings → study: open every row | study: Advanced |  |
| F251 | Settings → planning: open every row | planning: Scheduling algorithm |  |
| F252 | Settings → planning: open every row | planning: Daily minimum |  |
| F253 | Settings → planning: open every row | planning: Day starts |  |
| F254 | Settings → planning: open every row | planning: Day ends |  |
| F255 | Settings → planning: open every row | planning: Week starts on |  |
| F256 | Settings → planning: open every row | planning: Time display |  |
| F257 | Settings → planning: open every row | planning: Advanced |  |
| F258 | Settings → reminders: open every row | reminders: Schedule |  |
| F259 | Settings → reminders: open every row | reminders: Preferred study time |  |
| F260 | Settings → reminders: open every row | reminders: At most |  |
| F261 | Settings → reminders: open every row | reminders: When cards due reach |  |
| F262 | Settings → reminders: open every row | reminders: Starts |  |
| F263 | Settings → reminders: open every row | reminders: Ends |  |
| F264 | Settings → reminders: open every row | reminders: Day |  |
| F265 | Settings → reminders: open every row | reminders: Time |  |
| F266 | Settings → Appearance: paper and sky options (night) | option: Plain |  |
| F267 | Settings → Appearance: paper and sky options (night) | option: Graph |  |
| F268 | Settings → Appearance: paper and sky options (night) | option: Dot |  |
| F269 | Settings → Appearance: paper and sky options (night) | option: Ruled |  |
| F270 | Settings → Appearance: paper and sky options (night) | option: Clear |  |
| F271 | Settings → Appearance: paper and sky options (night) | option: Stars |  |
| F272 | Settings → Subjects: open each subject | subject Analysis/ |  |
| F273 | Settings → Subjects: open each subject | subject Topology/ |  |
| F274 | Settings → Subjects: open each subject | subject Linear Alg |  |
| F275 | Settings → Data and account: Delete confirmation (not confirmed) | Delete… dialog (1/2) |  |
| F276 | Settings → Data and account: Delete confirmation (not confirmed) | Delete… dialog (2/2) |  |
| F277 | Settings → Data and account: Delete confirmation (not confirmed) | after Sign out |  |
| F278 | Settings → Reminders: turn reminders on | off |  |
| F279 | Settings → Reminders: turn reminders on | on (1/2) |  |
| F280 | Settings → Reminders: turn reminders on | on (2/2) |  |
| F281 | Tutor chat (checkpoint) | start |  |
| F282 | Tutor chat (checkpoint) | began | ⚠ write: Could not find "Write a question" |
| F283 | Lemma Pad | pad |  |
| F284 | Today at morning (2026-11-09 07:30) | morning (1/3) |  |
| F285 | Today at morning (2026-11-09 07:30) | morning (2/3) |  |
| F286 | Today at morning (2026-11-09 07:30) | morning (3/3) |  |
| F287 | Today at evening (2026-11-09 21:15) | evening (1/3) |  |
| F288 | Today at evening (2026-11-09 21:15) | evening (2/3) |  |
| F289 | Today at evening (2026-11-09 21:15) | evening (3/3) |  |
| F290 | Today at night (2026-11-10 00:40) | night (1/3) |  |
| F291 | Today at night (2026-11-10 00:40) | night (2/3) |  |
| F292 | Today at night (2026-11-10 00:40) | night (3/3) |  |
| F293 | Today at weekend (2026-11-14 10:00) | weekend (1/3) |  |
| F294 | Today at weekend (2026-11-14 10:00) | weekend (2/3) |  |
| F295 | Today at weekend (2026-11-14 10:00) | weekend (3/3) |  |
| F296 | Offline banner | Today offline |  |
| F297 | Offline banner | Tasks offline |  |
| F298 | Large system text (130%): today | 130% text (1/3) |  |
| F299 | Large system text (130%): today | 130% text (2/3) |  |
| F300 | Large system text (130%): today | 130% text (3/3) |  |
| F301 | Large system text (130%): capture | 130% text |  |
| F302 | Large system text (130%): tasks | 130% text (1/2) |  |
| F303 | Large system text (130%): tasks | 130% text (2/2) |  |
| F304 | Large system text (130%): review | 130% text (1/3) |  |
| F305 | Large system text (130%): review | 130% text (2/3) |  |
| F306 | Large system text (130%): review | 130% text (3/3) |  |
| F307 | Large system text (130%): settings | 130% text (1/2) |  |
| F308 | Large system text (130%): settings | 130% text (2/2) |  |
| F309 | Very long titles and unusual characters | long task in the list (1/2) |  |
| F310 | Very long titles and unusual characters | long task in the list (2/2) |  |

## Profile: Empty (brand-new account)

| Sheet | Frames | Screens |
|---|---|---|
| `sheets/empty-sheet-01.png` | E001–E004 | Sign in; Welcome: three skippable first-run steps; Not found (unknown address) |
| `sheets/empty-sheet-02.png` | E005–E008 | Today; Search sheet |
| `sheets/empty-sheet-03.png` | E009–E012 | Search sheet |
| `sheets/empty-sheet-04.png` | E013–E016 | Set weekday study minutes; Quick focus sheet; Plan card: decision details |
| `sheets/empty-sheet-05.png` | E017–E018 | Plan card: decision details; Capture sheet: empty, type picker |
| `sheets/empty-sheet-06.png` | E019–E022 | Add a task by typing a sentence |
| `sheets/empty-sheet-07.png` | E023–E026 | Add a task: plain sentence with a due day; Capture → More options (full task form) |
| `sheets/empty-sheet-08.png` | E027–E030 | Add a time block |
| `sheets/empty-sheet-09.png` | E031–E034 | Add a card (front :: back) |
| `sheets/empty-sheet-10.png` | E035–E038 | Add a card (front :: back); Card without a back: disabled reason; Park a thought |
| `sheets/empty-sheet-11.png` | E039–E040 | Capture opened from another screen (Calendar); Tasks: To do / Doing / Done |
| `sheets/empty-sheet-12.png` | E041–E044 | Tasks: To do / Doing / Done; New task form: fill every field |
| `sheets/empty-sheet-13.png` | E045–E048 | New task form: fill every field |
| `sheets/empty-sheet-14.png` | E049–E050 | New task form: fill every field; Calendar: Day |
| `sheets/empty-sheet-15.png` | E051–E054 | Calendar: Day; Calendar: Week; Calendar: Month |
| `sheets/empty-sheet-16.png` | E055–E058 | Calendar: Month; Calendar: Agenda; Calendar: quick add |
| `sheets/empty-sheet-17.png` | E059–E062 | Calendar: quick add; Calendar: new block form; Calendar: planner (Adjust / Add all) |
| `sheets/empty-sheet-18.png` | E063–E064 | Calendar: planner (Adjust / Add all); Paths list and its tabs |
| `sheets/empty-sheet-19.png` | E065–E068 | Paths list and its tabs; New path form |
| `sheets/empty-sheet-20.png` | E069–E072 | New path form; New path → Continue with tutor |
| `sheets/empty-sheet-21.png` | E073–E075 | New path → Continue with tutor; Path or checkpoint that does not exist |
| `sheets/empty-sheet-22.png` | E076–E079 | Cards browser; Card editor (new card); Card that does not exist |
| `sheets/empty-sheet-23.png` | E080–E083 | Review hub; Review run with nothing in progress; Review done |
| `sheets/empty-sheet-24.png` | E084–E085 | Inbox: card proposals; Inbox: plan proposals |
| `sheets/empty-sheet-25.png` | E086–E089 | Atlas: map; Atlas: list; Atlas: search and legend |
| `sheets/empty-sheet-26.png` | E090–E093 | Progress: overview; Progress: 30 and 90 days, table view |
| `sheets/empty-sheet-27.png` | E094–E097 | Progress: 30 and 90 days, table view; Progress: Learning tab |
| `sheets/empty-sheet-28.png` | E098–E101 | Progress: Time tab; Time log (week); Time log: add time manually; Time log: one day |
| `sheets/empty-sheet-29.png` | E102–E103 | Time log: one day; Your week (digest page) |
| `sheets/empty-sheet-30.png` | E104–E107 | Focus with nothing running; Quick focus: start from the sheet; Practice topics |
| `sheets/empty-sheet-31.png` | E108–E109 | Close the day (3 steps); Settings |
| `sheets/empty-sheet-32.png` | E110–E113 | Settings: appearance; Settings: tutor |
| `sheets/empty-sheet-33.png` | E114–E117 | Settings: study; Settings: planning |
| `sheets/empty-sheet-34.png` | E118–E121 | Settings: reminders; Settings: subjects; Settings: data |
| `sheets/empty-sheet-35.png` | E122–E125 | Settings: data; Settings → tutor: open every row |
| `sheets/empty-sheet-36.png` | E126–E129 | Settings → tutor: open every row; Settings → study: open every row |
| `sheets/empty-sheet-37.png` | E130–E133 | Settings → study: open every row |
| `sheets/empty-sheet-38.png` | E134–E137 | Settings → study: open every row; Settings → planning: open every row |
| `sheets/empty-sheet-39.png` | E138–E141 | Settings → planning: open every row |
| `sheets/empty-sheet-40.png` | E142–E145 | Settings → planning: open every row; Settings → reminders: open every row |
| `sheets/empty-sheet-41.png` | E146–E149 | Settings → reminders: open every row |
| `sheets/empty-sheet-42.png` | E150–E153 | Settings → reminders: open every row; Settings → Appearance: paper and sky options (night) |
| `sheets/empty-sheet-43.png` | E154–E157 | Settings → Appearance: paper and sky options (night); Settings → Data and account: Delete confirmation (not confirmed) |
| `sheets/empty-sheet-44.png` | E158–E161 | Settings → Data and account: Delete confirmation (not confirmed); Settings → Reminders: turn reminders on |
| `sheets/empty-sheet-45.png` | E162–E163 | Settings → Reminders: turn reminders on; Lemma Pad |
| `sheets/empty-sheet-46.png` | E164–E167 | Today at morning (2026-11-09 07:30); Today at evening (2026-11-09 21:15) |
| `sheets/empty-sheet-47.png` | E168–E171 | Today at night (2026-11-10 00:40); Today at weekend (2026-11-14 10:00) |
| `sheets/empty-sheet-48.png` | E172–E175 | Offline banner; Large system text (130%): today |
| `sheets/empty-sheet-49.png` | E176–E179 | Large system text (130%): capture; Large system text (130%): tasks; Large system text (130%): review |
| `sheets/empty-sheet-50.png` | E180–E182 | Large system text (130%): review; Large system text (130%): settings |

### Frames

| Frame | Screen | State | Note |
|---|---|---|---|
| E001 | Sign in | top |  |
| E002 | Welcome: three skippable first-run steps | step 1 |  |
| E003 | Welcome: three skippable first-run steps | step 2 |  |
| E004 | Not found (unknown address) | top |  |
| E005 | Today | top (1/2) |  |
| E006 | Today | top (2/2) |  |
| E007 | Search sheet | opened (1/2) |  |
| E008 | Search sheet | opened (2/2) |  |
| E009 | Search sheet | typed "compact" (1/2) |  |
| E010 | Search sheet | typed "compact" (2/2) |  |
| E011 | Search sheet | no results (1/2) |  |
| E012 | Search sheet | no results (2/2) |  |
| E013 | Set weekday study minutes | opened |  |
| E014 | Quick focus sheet | opened (1/2) |  |
| E015 | Quick focus sheet | opened (2/2) |  |
| E016 | Plan card: decision details | expanded (1/2) |  |
| E017 | Plan card: decision details | expanded (2/2) |  |
| E018 | Capture sheet: empty, type picker | opened (nothing typed) |  |
| E019 | Add a task by typing a sentence | typed: a date+time+length is read as a Time block |  |
| E020 | Add a task by typing a sentence | type switched to Task: same tokens, different footer |  |
| E021 | Add a task by typing a sentence | added: toast with Undo |  |
| E022 | Add a task by typing a sentence | the new task in Tasks |  |
| E023 | Add a task: plain sentence with a due day | typed: recognised as a task |  |
| E024 | Add a task: plain sentence with a due day | added |  |
| E025 | Capture → More options (full task form) | full task form prefilled (1/2) |  |
| E026 | Capture → More options (full task form) | full task form prefilled (2/2) |  |
| E027 | Add a time block | typed as a time block |  |
| E028 | Add a time block | added |  |
| E029 | Add a time block | the block on tomorrow (1/2) |  |
| E030 | Add a time block | the block on tomorrow (2/2) |  |
| E031 | Add a card (front :: back) | typed as a card |  |
| E032 | Add a card (front :: back) | after Add card |  |
| E033 | Add a card (front :: back) | first-card form filled |  |
| E034 | Add a card (front :: back) | first card saved (1/2) |  |
| E035 | Add a card (front :: back) | first card saved (2/2) |  |
| E036 | Card without a back: disabled reason | Add card unavailable, reason shown |  |
| E037 | Park a thought | typed as a thought |  |
| E038 | Park a thought | parked: toast |  |
| E039 | Capture opened from another screen (Calendar) | over Calendar |  |
| E040 | Tasks: To do / Doing / Done | To do |  |
| E041 | Tasks: To do / Doing / Done | Doing |  |
| E042 | Tasks: To do / Doing / Done | Done |  |
| E043 | New task form: fill every field | blank form |  |
| E044 | New task form: fill every field | Save with no title: validation |  |
| E045 | New task form: fill every field | title, High priority, Date chosen (1/2) |  |
| E046 | New task form: fill every field | title, High priority, Date chosen (2/2) |  |
| E047 | New task form: fill every field | Date & time chosen (1/2) |  |
| E048 | New task form: fill every field | Date & time chosen (2/2) |  |
| E049 | New task form: fill every field | path picker | ⚠ save: Could not find "Save task" |
| E050 | Calendar: Day | day (1/2) |  |
| E051 | Calendar: Day | day (2/2) |  |
| E052 | Calendar: Week | week (1/2) |  |
| E053 | Calendar: Week | week (2/2) |  |
| E054 | Calendar: Month | month (1/2) |  |
| E055 | Calendar: Month | month (2/2) |  |
| E056 | Calendar: Agenda | agenda (1/2) |  |
| E057 | Calendar: Agenda | agenda (2/2) |  |
| E058 | Calendar: quick add | quick add (1/2) |  |
| E059 | Calendar: quick add | quick add (2/2) |  |
| E060 | Calendar: new block form | blank block form (1/2) |  |
| E061 | Calendar: new block form | blank block form (2/2) | ⚠ save: Could not find "/^(Save/Add) (time )?block/" |
| E062 | Calendar: planner (Adjust / Add all) | planner (1/2) |  |
| E063 | Calendar: planner (Adjust / Add all) | planner (2/2) |  |
| E064 | Paths list and its tabs | Active |  |
| E065 | Paths list and its tabs | Paused |  |
| E066 | Paths list and its tabs | Done |  |
| E067 | Paths list and its tabs | Archived |  |
| E068 | New path form | blank (Create path disabled until a name) |  |
| E069 | New path form | name typed |  |
| E070 | New path form | after Create path: the new, empty path (1/2) |  |
| E071 | New path form | after Create path: the new, empty path (2/2) |  |
| E072 | New path → Continue with tutor | new empty path, before tapping |  |
| E073 | New path → Continue with tutor | after Continue with tutor | ⚠ begin: Could not find "Begin session"; ⚠ write: Could not find "Write a question" |
| E074 | Path or checkpoint that does not exist | unknown path |  |
| E075 | Path or checkpoint that does not exist | unknown checkpoint |  |
| E076 | Cards browser | list |  |
| E077 | Card editor (new card) | blank editor (1/2) |  |
| E078 | Card editor (new card) | blank editor (2/2) |  |
| E079 | Card that does not exist | missing card |  |
| E080 | Review hub | hub (1/2) |  |
| E081 | Review hub | hub (2/2) |  |
| E082 | Review run with nothing in progress | no round |  |
| E083 | Review done | done |  |
| E084 | Inbox: card proposals | Cards tab |  |
| E085 | Inbox: plan proposals | Plans tab |  |
| E086 | Atlas: map | map |  |
| E087 | Atlas: list | list |  |
| E088 | Atlas: search and legend | search |  |
| E089 | Atlas: search and legend | search "comp" | ⚠ legend: Could not find "Legend" |
| E090 | Progress: overview | overview (1/2) |  |
| E091 | Progress: overview | overview (2/2) |  |
| E092 | Progress: 30 and 90 days, table view | 30 days (1/2) |  |
| E093 | Progress: 30 and 90 days, table view | 30 days (2/2) |  |
| E094 | Progress: 30 and 90 days, table view | 90 days |  |
| E095 | Progress: 30 and 90 days, table view | chart as table |  |
| E096 | Progress: Learning tab | learning (1/2) |  |
| E097 | Progress: Learning tab | learning (2/2) |  |
| E098 | Progress: Time tab | time |  |
| E099 | Time log (week) | week |  |
| E100 | Time log: add time manually | add time form |  |
| E101 | Time log: one day | Sunday 8 Nov |  |
| E102 | Time log: one day | Friday 6 Nov |  |
| E103 | Your week (digest page) | week digest |  |
| E104 | Focus with nothing running | no session |  |
| E105 | Quick focus: start from the sheet | sheet |  |
| E106 | Quick focus: start from the sheet | quick focus running |  |
| E107 | Practice topics | practice |  |
| E108 | Close the day (3 steps) | 1 · today |  |
| E109 | Settings | root |  |
| E110 | Settings: appearance | top (1/2) |  |
| E111 | Settings: appearance | top (2/2) |  |
| E112 | Settings: tutor | top (1/2) |  |
| E113 | Settings: tutor | top (2/2) |  |
| E114 | Settings: study | top (1/2) |  |
| E115 | Settings: study | top (2/2) |  |
| E116 | Settings: planning | top (1/2) |  |
| E117 | Settings: planning | top (2/2) |  |
| E118 | Settings: reminders | top (1/2) |  |
| E119 | Settings: reminders | top (2/2) |  |
| E120 | Settings: subjects | top |  |
| E121 | Settings: data | top (1/2) |  |
| E122 | Settings: data | top (2/2) |  |
| E123 | Settings → tutor: open every row | tutor: Checkpoint chat |  |
| E124 | Settings → tutor: open every row | tutor: Manual handoff |  |
| E125 | Settings → tutor: open every row | tutor: ChatGPT plan on this phone |  |
| E126 | Settings → tutor: open every row | tutor: Last connector activity |  |
| E127 | Settings → study: open every row | study: Target recall |  |
| E128 | Settings → study: open every row | study: New cards a day |  |
| E129 | Settings → study: open every row | study: Default mode |  |
| E130 | Settings → study: open every row | study: Focus |  |
| E131 | Settings → study: open every row | study: Break |  |
| E132 | Settings → study: open every row | study: Long break |  |
| E133 | Settings → study: open every row | study: Cards a day |  |
| E134 | Settings → study: open every row | study: Minutes a day |  |
| E135 | Settings → study: open every row | study: Advanced |  |
| E136 | Settings → planning: open every row | planning: Scheduling algorithm |  |
| E137 | Settings → planning: open every row | planning: Daily minimum |  |
| E138 | Settings → planning: open every row | planning: Day starts |  |
| E139 | Settings → planning: open every row | planning: Day ends |  |
| E140 | Settings → planning: open every row | planning: Week starts on |  |
| E141 | Settings → planning: open every row | planning: Time display |  |
| E142 | Settings → planning: open every row | planning: Advanced |  |
| E143 | Settings → reminders: open every row | reminders: Schedule |  |
| E144 | Settings → reminders: open every row | reminders: Preferred study time |  |
| E145 | Settings → reminders: open every row | reminders: At most |  |
| E146 | Settings → reminders: open every row | reminders: When cards due reach |  |
| E147 | Settings → reminders: open every row | reminders: Starts |  |
| E148 | Settings → reminders: open every row | reminders: Ends |  |
| E149 | Settings → reminders: open every row | reminders: Day |  |
| E150 | Settings → reminders: open every row | reminders: Time |  |
| E151 | Settings → Appearance: paper and sky options (night) | option: Plain |  |
| E152 | Settings → Appearance: paper and sky options (night) | option: Graph |  |
| E153 | Settings → Appearance: paper and sky options (night) | option: Dot |  |
| E154 | Settings → Appearance: paper and sky options (night) | option: Ruled |  |
| E155 | Settings → Appearance: paper and sky options (night) | option: Clear |  |
| E156 | Settings → Appearance: paper and sky options (night) | option: Stars |  |
| E157 | Settings → Data and account: Delete confirmation (not confirmed) | Delete… dialog (1/2) |  |
| E158 | Settings → Data and account: Delete confirmation (not confirmed) | Delete… dialog (2/2) |  |
| E159 | Settings → Data and account: Delete confirmation (not confirmed) | after Sign out |  |
| E160 | Settings → Reminders: turn reminders on | off |  |
| E161 | Settings → Reminders: turn reminders on | on (1/2) |  |
| E162 | Settings → Reminders: turn reminders on | on (2/2) |  |
| E163 | Lemma Pad | pad |  |
| E164 | Today at morning (2026-11-09 07:30) | morning (1/2) |  |
| E165 | Today at morning (2026-11-09 07:30) | morning (2/2) |  |
| E166 | Today at evening (2026-11-09 21:15) | evening (1/2) |  |
| E167 | Today at evening (2026-11-09 21:15) | evening (2/2) |  |
| E168 | Today at night (2026-11-10 00:40) | night (1/2) |  |
| E169 | Today at night (2026-11-10 00:40) | night (2/2) |  |
| E170 | Today at weekend (2026-11-14 10:00) | weekend (1/2) |  |
| E171 | Today at weekend (2026-11-14 10:00) | weekend (2/2) |  |
| E172 | Offline banner | Today offline |  |
| E173 | Offline banner | Tasks offline |  |
| E174 | Large system text (130%): today | 130% text (1/2) |  |
| E175 | Large system text (130%): today | 130% text (2/2) |  |
| E176 | Large system text (130%): capture | 130% text |  |
| E177 | Large system text (130%): tasks | 130% text |  |
| E178 | Large system text (130%): review | 130% text (1/3) |  |
| E179 | Large system text (130%): review | 130% text (2/3) |  |
| E180 | Large system text (130%): review | 130% text (3/3) |  |
| E181 | Large system text (130%): settings | 130% text (1/2) |  |
| E182 | Large system text (130%): settings | 130% text (2/2) |  |

## Groups

- 1 · First run and edges
- 2 · Today
- 3 · Capture (the + button): add a task, block, card, thought
- 4 · Tasks
- 5 · Calendar
- 6 · Paths, checkpoints and sessions
- 7 · Cards
- 8 · Review
- 9 · Inbox (tutor proposals)
- 10 · Atlas
- 11 · Progress, time log and week
- 12 · Focus, practice and closing the day
- 13 · Settings
- 14 · Tutor chat and Pad
- 15 · Edge conditions: time of day, offline, large text
