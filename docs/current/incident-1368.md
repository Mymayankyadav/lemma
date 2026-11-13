## incident #1368 Three tests read the real clock (13 Nov 2026)

Main went red at midnight UTC on 13 Nov 2026 without a code change. CI's automatic revert of N132 (#1369) could not help,
because the cause was the date, not a merge. Bug #1367 has the details.

- `tests/unit/tasks-ui/backlog.test.tsx`: task 0 is due 2026-11-12, and overdue tasks lead their group (N121 F10). From
  13 Nov it was overdue, so "Move Task 0 down" no longer put Task 1 first.
- `tests/unit/focus/today-focus.test.tsx`: the saved entry runs from 10 to 2 minutes before now, so in the first minutes
  after midnight part of it fell on yesterday ("4 min" instead of "8 min").
- `tests/e2e/v6-harden-slice.spec.ts`: the 10-minute manual log case ends 5 minutes before now, so its own guard threw
  "straddles midnight" in the first quarter hour of every day.

Each test now runs at a fixed mid-day instant, 2026-11-10 07:00 UTC. The unit tests fake only `Date`
(`vi.useFakeTimers({toFake:['Date']})`, so React's timers stay real). The e2e uses `page.clock.setFixedTime`, and its
manual entry is built from the same instant. The fixtures and assertions are unchanged, and no product code changed.
The unit tests were checked in four time zones (UTC+14, UTC+5:30, UTC−8, UTC−11).
