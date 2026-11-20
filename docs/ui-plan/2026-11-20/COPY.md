# Copy deck: before → after (phone, all screens)

Rules (PLAN.md P3):
- Title ≤ 4 words; helper ≤ 1 sentence of ≤ 12 words.
- Never restate a visible number.
- No internal terms, IDs, versions or raw dates (one formatter: "Thu 12 Nov · 18:00").
- Keyboard hints only for a fine pointer.
- How-to hints for the first 3 uses only.

Where a line is removed for sighted users, keep it as screen-reader text if it summarises a chart.

| # | Screen · frame | Before | After |
|---|---|---|---|
| 1 | Today · F005 | Next block in 1 h 17 min. 23 cards due and 1 thing overdue. | *(remove when the hero shows the next block; otherwise)* Nothing scheduled. |
| 2 | Today plan card · F005 | Checks → Learn → Practice → Close | Today's plan |
| 3 | Today plan card | Set weekday study minutes to plan your time. | Set your study time to get a plan. |
| 4 | Today plan card | Next action · No authorized task fits this window | Nothing fits before your next block. |
| 5 | Today plan card (empty) · E005 | Available study time has not been declared | Set your study time to get a plan. |
| 6 | Today plan card · F020 | Decision details › Scheduling algorithm · New atlas-owner-2026-11-20.1 · 9/11/2026, 1:43:00 pm | *(remove from UI; keep in diagnostics/export)* |
| 7 | Today | 6 proposals from your tutor · Decide in the Inbox. | 6 from your tutor |
| 8 | Today empty · E005 | Start your first path · A path gives your ideas a place to grow. | Start your first path |
| 9 | Capture · F025 | Try: Rudin ch 4 tomorrow 4pm 90m #real | *(first 3 uses only)* Try "Rudin ch 4 tomorrow 4pm 90m" |
| 10 | Capture | Unavailable · Type something to add. | *(remove; the disabled button and placeholder say it)* |
| 11 | Capture card | Unavailable · Write the card as front :: back. | Write it as front :: back |
| 12 | Tasks · F045 | Tasks, deadlines and practice · Triage | 1 overdue · Review |
| 13 | Calendar · F067 | Suggested study times | Good times to study |
| 14 | Calendar | Ranked by when you usually keep a block. You choose; nothing is added until you do. | *(remove)* |
| 15 | Calendar · F071 | 12/11/2026, 6:00:00 pm · 60 min · kept 0 of 0 recent | Thu 12 Nov · 18:00 · 60 min |
| 16 | Calendar Month · F071 | Logged ▢0 ■1–15 ■16–30 ■31–60 ■60+ min · Glyphs mark planned study · ⏰ something due | *(behind an ⓘ button)* |
| 17 | Calendar Agenda · F073 | Nothing planned · Add *(per empty range, repeated)* | Nothing planned Tue–Thu · Add *(merged)* |
| 18 | Triage sheet · F085 | Needs a decision · 1 overdue | 1 overdue |
| 19 | New path · E068 | Your tutor fills in the subject, goal and plan. You can add sources from the path later. | Your tutor plans it with you. |
| 20 | Path (new) · E072 | Your tutor fills this in. | *(remove)* |
| 21 | Path · F102 | TELL YOUR TUTOR · Ask your tutor to read the sources and plan this path with you. · Copy prompt | Plan with your tutor · Copy prompt |
| 22 | Path · F102 | Plan estimates · Plan fits 0% · core 100% · 1742 min required · 0 min available · 15–193 min … ×8 | About 29 h of work · no weekly time set · Set time |
| 23 | Path (new) · E072 | A plan is waiting to be written. Ask your tutor to break your goal into checkpoints. | No plan yet. |
| 24 | Path · F102 | Continue · Compactness *(button)* + Continue with tutor *(floating)* | Continue with tutor *(one action-bar button)* |
| 25 | Checkpoint · F114 | Work on this with your tutor | Continue with tutor |
| 26 | Checkpoint · F114 | TO DEMONSTRATE … · What counts *(disclosure)* | Goal … *(what counts inline, one line)* |
| 27 | Checkpoint · F115 | Ready · Compactness · — · not yet | Recheck: not ready yet |
| 28 | Session · F120 | Recent attempts · No attempts yet. | *(remove)* |
| 29 | Session | Start another session | Continue with tutor |
| 30 | Review · F139 | Cards due over the next 14 days: 90 in all. Stacked by subject; includes overdue cards today. | 90 due in 14 days |
| 31 | Review round · F145 | Swipe right for Good, left for Again, up for Easy. | *(first 3 rounds only)* Swipe: right Good · left Again · up Easy |
| 32 | Review round | How sure are you? Optional | How sure? |
| 33 | Review empty · E080 | 0 cards today · Nothing is due right now · No cards due. Your review queue is clear. | No cards yet · Create your first card |
| 34 | Inbox · F157 | Keys: A or Right approves, R or Left rejects, E edits, Up skips to the end. | *(fine pointer only)* |
| 35 | Inbox · F157 | Atlas links · analogous · 1 · Approve all 1 analogous · Reject all 1 analogous · Metric spaces → Open sets analogous · Both arguments use the same compactness structure. · 80% | Suggested link · Metric spaces ↔ Open sets · Same compactness argument · Approve / Reject |
| 36 | Atlas list · F174 | Conjecture · not started · Analysis *(on ~80 rows)* | *(state glyph only; subject is the group header)* |
| 37 | Atlas Bridges · F181 | Metric spaces → Open sets · 0 uses · 0 opportunities | *(hide until used)* |
| 38 | Atlas Themes · F180 | Themes · No themes yet. | *(hide the tab while empty)* |
| 39 | Atlas empty · E086 | No concepts yet. They appear as your plans grow. · New concept | No concepts yet · Start a path |
| 40 | Progress · F187 | 1 h 35 min more than the 30 days before *(previous = 0)* | Your first month |
| 41 | Progress · F187 | You studied 1 h 35 min in this range, most on Sun 1 Nov – Sat 7 Nov. | *(screen-reader only)* |
| 42 | Progress · F188 | You studied 1 h 35 min across 14 days; 3 days had study activity. | 3 study days in 14 |
| 43 | Progress Learning · E096 | 0 checkpoints demonstrated in this range, most on Sun 11 Oct – Sat 17 Oct. | None yet. *(bug: "most on" with zero data, `src/ui/v7/Chart.tsx`)* |
| 44 | Close the day · F221 | Given and shown · 19 reviews answered today | Today · 19 reviews |
| 45 | Focus · F207–F216 | This session is too short to save. Discard it, or keep going and finish later. *(banner)* + Nothing to log yet *(sheet)* | *(sheet only)* Less than a minute — keep going or discard? |
| 46 | Not found · F004 | Not in the notebook · This page isn't in the notebook. The link may be old, or what it pointed to was deleted. | Page not found · The link may be old. |
| 47 | Tutor (path, no plan) · F101 | Approve a checkpoint in your plan to start a tutor conversation. · Back to path | This path has no plan yet. · Plan with your tutor |
| 48 | Tutor (demo) · F282 | Saved in this demo. Import a tutor reply to continue. | *(status line)* Demo: import a reply to continue |
| 49 | Pad · F283 | Work through a checkpoint with notes, mathematics and ink. Drafts stay on this device until you explicitly export or share a selection. | Notes and ink for a checkpoint. Saved on this device. |

## v2 additions (from the full revisit)

| # | Screen · frame | Before | After |
|---|---|---|---|
| 50 | Today evening · F287 | Free evening · Nothing planned for the rest of today · A little room to think is a good thing. · Plan my day | Free evening · Close the day · Plan tomorrow |
| 51 | Today after midnight · F290 | Good evening *(at 00:40)* | Still up? *(hero: Plan tomorrow)* |
| 52 | Path not found · F123 | Path unavailable. Check your connection or try again. · Try again | This path doesn't exist. · Back to Paths |
| 53 | Checkpoint not found · F124 | Checkpoint unavailable. Check your connection or try again. | This checkpoint doesn't exist. · Back to the path |
| 54 | Card not found · F138 | This card could not be loaded. · Try again | Card #99999 doesn't exist. · Back to Cards |
| 55 | Tutor › Connection | Copy bearer token · Create a connector grant for this question · Handoff reference · Check for reply | *(under ⋯ › Connection)* Copy connection prompt · Reference · Refresh |
| 56 | Tutor | A saved submission is waiting for confirmation. | Sending… *(status line, retries on its own)* |
| 57 | Progress › Time empty · E098 | No active goals. Set one from Settings › Planning. | No goals yet · Add a goal |
| 58 | Paths Paused/Done/Archived · F089–F091 | No paused paths · Paths you mark this way will gather here. · Start a new path | Nothing paused. *(no button)* |
| 59 | Checkpoint locked · F117 | Work on this with your tutor · 0 due · Review Uniform continuity | Unlocks after Heine–Borel |
| 60 | Delete task · F062 | Task deleted *(no Undo)* | Task deleted · Undo |
| 61 | Search · F013 | Nothing matches "zzzzqq". | Nothing matches "zzzzqq" · Add task "zzzzqq" · Ask your tutor |
