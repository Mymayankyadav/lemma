# Owner task N160: the 30-area chat-connector checklist

Given by the Owner on 13 Nov 2026 with the words "Implement these". The list is kept here as given, with the status of each area in `capability-map.json` (checked by `tests/unit/mcp/capability-map.test.ts`).

Every action should use the same rules as the app, appear in the app after execution, detect conflicting edits and support undo where available. Device permission prompts remain on the device. Some capabilities already have backend support; those items include completing and testing their MCP access. Recurring tasks, week/month planning and remote device control require additional functionality.

1. Complete MCP access: expose all supported actions and verify the connector matches the server.
2. Read current context: Today, tasks, calendar, active timer, deadlines, reviews and availability.
3. Manage tasks: create, edit, prioritize, reorder, complete, reopen, cancel and delete.
4. Recurring tasks: daily, weekdays, weekly, monthly or custom intervals; skip occurrences and edit or stop a series.
5. Manage calendar blocks: create, move, resize, cancel and delete study/busy blocks; detect overlaps.
6. Plan my day: schedule tasks, reviews and practice around available time and breaks.
7. Plan my week/month: distribute work across dates using deadlines, working hours and goals.
8. Replan unfinished work: reschedule missed tasks or adjust when availability changes.
9. Manage deadlines: exams, assignments, due dates and remaining effort.
10. Manage study goals: daily, weekly or custom periods, globally or per subject/Path.
11. Control timers: start, pause, resume, take breaks, advance phases, finish/save or discard.
12. Manage timer presets: Pomodoro, Flowtime and open-ended sessions, including breaks and cycles.
13. Manage time logs: manually record time, correct intervals, split entries, void and restore.
14. Quick capture: save thoughts, distractions and notes; convert thoughts into tasks.
15. Daily routines: set intentions, close/reopen the day, carry work forward and choose tomorrow's first task.
16. Subjects, Paths and checkpoints: create/edit, organize, set targets, update progress, pin, pause or archive.
17. Manage cards: create/edit, tag, move, suspend, restore, delete, reschedule and reset.
18. Control review sessions: choose decks/budgets, start/pause/resume, reveal answers, grade and correct reviews.
19. Manage practice: topics, schedules, attempts, responses, ratings and time spent.
20. Manage Atlas: concepts, relationships, prerequisites, positions, merges and misconceptions.
21. Manage sources: upload supported files from chat, attach to Paths, search/read pages and correct transcription.
22. Manage proposals: draft, edit, submit, approve, reject, withdraw, revise and reopen.
23. Manage tutor sessions: start/resume/end, save progress, evidence, diagnostics and next questions.
24. Read progress reports: study time, consistency, subject breakdowns, goals, recall and forecasts.
25. Change settings: study defaults, working hours, review budgets, tutor instructions, time zone and supported appearance preferences.
26. Manage notifications: reminders, quiet hours, holds, registered devices and test notifications.
27. History, undo and exports: inspect changes, undo/redo supported actions, restore records and export data.
28. Control the connected app: select a device, open screens/records and synchronize timer controls, with delivery confirmation.
29. Account and connection controls: connection health, disconnect/revoke access and account actions with explicit confirmation.
30. Background scheduling: recurring tasks and reminders work while chat/app are closed, without duplicate execution.
