# Lemma mobile UI handoff

Follow-up, 5 November 2026: `REVIEW_FIX_REPORT.md` is the current Inbox repair
record. Navigation and the active timer remain visible in portrait Inbox;
decisions are a body-level portal above measured chrome. The new rendered
regression covers eight Chromium configurations and lifecycle recovery.
Other screen/device limitations in the original handoff below still apply.
`PLANNING/` provides the revised shared-data/full-MCP production contract.

Audit remediation delivered 5 November 2026. See [V5_REAUDIT_RESPONSE.md](V5_REAUDIT_RESPONSE.md) for the latest N1–N12 fixes and creative-direction decisions, and [AUDIT_RESPONSE.md](AUDIT_RESPONSE.md) for the earlier audit. The prototype retains its 78 module import identifiers, original math content, learning adapters and browser-local example data.

| Screen | Delivered behavior |
| --- | --- |
| Today | One current study action, shared Inbox/Add/Menu, logged-time total and intention rail, and at most two secondary rows including the next block with Start. Starting it preserves previous effort and opens Focus with the block's intent, duration and tags. Finish/discard refreshes the hero. |
| Focus | Native dialog; explicit Pomodoro cycle; editable minutes, optional rating/note, Save/Discard and return to paused session. A reflection draft commits nothing. |
| Paths/project | Continuous rails, append 20 paths, wrapping Archive breadcrumb, distinct generic subject markers, explicit Switch, scoped counts, single stage picker and prominent state chips. Session outcome counts and a categorical event timeline precede collapsed repeated reasoning. |
| Concept map | Phone list default; natural sort; non-synthetic concept count; details in a native sheet. Bounded map groups have large cells, and closing details preserves map context. |
| Review | Selected batch checkmark, full-label deck selection, separate expansion and named due counts. Interrupted rounds pause and retain queue/answers across refresh. Only exhausted rounds complete. Again is separate from Hard/Good/Easy. |
| Cards | Filters sheet, removable active chips, one page scroll, first 20 rows, progressive Load 20 more. Visible detail actions, destructive Delete and explained memory values. |
| Calendar | Date navigation, four view tabs, one Planning tools control, schedule before Day details. Agenda defaults on phones. Dense overlaps become named stacks. Month today uses a ring and readable outside-month text. |
| Planning | Catalog subjects/path tags, field errors, finite estimates and presets, insert/reveal/highlight on save, fitting slot suggestions. Five unchecked day-plan suggestions, at most 20 automatic placements, unchecked carry-overs. |
| Progress | Compact range select plus view tabs. Same saved-time selector as Today/Calendar, correction link, distinct patterned charts, inline confidence values and Other last. |
| Inbox | Single feedback surface, at least 30 seconds per pending decision extended on focus, batch Undo, named chevrons, honest missing-rationale copy and a stronger Approve/See plan hierarchy. Swipes remain available to long mathematics. |
| Settings | Top-level list opens one section page with Back. Valid local fields autosave on blur; Saved status; switches; linked weekly-goal rows first; visible demo sign-out response. Subjects expose Add, Edit, search, reorder and confirmed record-preserving merge. |
| Kit | Time values occupy a dedicated column. Interactive Calendar specimens share the real Calendar field/button factories, native-dialog behavior and stylesheet. |

## Shared design contracts

- Navy primary in Day, light blue in Night; destructive red for delete/remove/reject/sign out. Calendar consumes the same semantic roles through its shadow boundary.
- Shared headers reserve a title row and a separate page-action row. Detail/secondary pages put Inbox/Add inside Menu; complete titles remain accessible when visually ellipsized. Paths and Cards have one creation entry point. Utilities retain 44-pixel targets.
- Global Task opens over the current route, validates and saves to the canonical backlog; View in backlog is explicit, and targeted Undo preserves other work.
- Newsreader headings, Instrument Sans UI, IBM Plex Mono clocks; original mathematical rendering and external font URLs/fallback families retained.
- Rem-based body/fields, capped display headings, unbroken short labels, wrapping actions, icon navigation at large text. The timer joins minimized navigation on scroll. Landscape uses a slim timer pill and header Menu destinations. Sign in has no timer chrome.
- Core/Calendar sheets use titled native dialogs, safe-area padding, a 90-dvh maximum, focus restoration and close/Escape behavior. False drag handles were removed.
- One body-level feedback queue retains pending actions until used/dismissed. New confirmations retain Undo. Planner Undo changes affected records and preserves unrelated later work.
- During Focus, that same feedback surface moves into the native dialog. Park is an inline field; Finish and Close my day can turn thoughts into tasks or dismiss them. Calendar dialogs lock root/body scrolling and restore the prior values.
- Charts keep one patterned legend. Decorative bar groups retain accessible labels without individual tab stops; only the scroll viewport receives a keyboard-visible focus indicator. Touch focus no longer draws a chart-wide frame or native ring around a bar. Exact values remain available in View data.
- Route titles and forward-navigation heading focus; keyboard view tabs. Existing route scroll restoration remains.

## Metric definitions

| Metric | Definition |
| --- | --- |
| Logged time | Union of saved intervals up to the current instant in the named local calendar day/range. Future portions are excluded/flagged and remain editable; future Calendar projections are planned records needing review. Duplicate/overlapping minutes count once. Duration-only records cannot exceed elapsed day capacity. |
| In progress | Current unsaved study time, separate from the log. Break time is excluded. |
| Pomodoro time | In-progress Pomodoro effort stops at the configured focus length; an interval left open cannot accumulate hours beyond it. Open timers retain their elapsed-time semantics. |
| Occupied time | Union of planned, logged and busy intervals in the selected day. Requested durations may exceed capacity and receive an explicit warning. |
| Capacity stack | Partitions occupied intervals with logged time first, then busy time, then planned time. The stack never double counts overlapping blocks. Independent totals and conflicts remain visible. |
| Subject time | A partition of saved interval time. Overlaps are assigned once in record order; correcting the log revises attribution. |
| Review batch / all due | Selected due items bounded by the session budget / all due items across decks. |
| Scheduled tomorrow | Tomorrow’s forecast arrivals, explicitly excluding overdue cards. Missing forecast is unavailable. |
| Checkpoints demonstrated | Demonstration events in the selected range, distinct from lifetime path completion. |
| Tutor sessions | Original tutor conversations, scoped to checkpoint or whole path; distinct from locally timed focus sessions. |

## Verification limits

Passed: 53 state/interaction regressions (26 original + 10 follow-up + 17 re-audit), 23 source/module-contract checks, retained effort regressions, syntax for 84 production source files plus 12 executable HTML scripts, two CSS parses and 48 selected contrast pairs. Repacking is byte-for-byte reproducible.

The state suite executes actual stores, timer owner, Calendar mutations, review store, reflection component and Cards component using DOM test doubles. It does not measure layout. No supported browser-control tool was available. Final browser screenshots, viewport geometry, computed rendered contrast, 320/390-pixel and landscape reflow, 200% text, screen readers, physical-device Back/gestures and human usability sessions remain unverified. Historical screenshots are before-change evidence.

iOS Live Activities and Android Live Updates require native wrappers and remain deferred. Existing OS/service examples remain labeled previews. Planned-versus-actual attribution and difficult-topic analytics remain deferred until supported by source data.

Of 82 screen findings, 78 are implemented, three have documented partial dispositions (missing rationale, swipe navigation and standalone subject deletion), and one demo sign-in limitation is accepted. See `AUDIT_COMMENT_COUNT.md`; no browser-verified closure is claimed.

The new re-audit's 12 finding groups have source fixes, including growing Paths rows, wrapping large-text controls, dock-aware focus reveal, themed Calendar accents, a binned session timeline and planning recovery. Optional confidence is visible before reveal; the Time view has a forgiving seven-day rhythm derived from saved effort. Larger speculative features have explicit data/native/design dependencies in the latest response.
