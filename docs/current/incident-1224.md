## Incident #1224 — reminder completion test depends on wall time

Main CI became red on November 8, 2026 because the N6.3 reminder-completion test expected a fixture preview for November 7, 2026 to be displayed as a *future* reminder, yet the component intentionally calls `nextReminderTime` with the actual `Date.now()`. As real time advanced past the fixture's `at` instant, the component correctly hid it and the test incorrectly expected to find the "Next reminder" panel. The production owner projection must continue suppressing expired previews.

The scoped test now pins `Date.now` to its already-declared `now` fixture during every test and restores it after unmount. This retains real timers for React `act` and `vi.waitFor`; no assertions are relaxed. A focused regression checks the default-clock path, in addition to the existing DOM regression showing the real reminder time and Done navigation. No production behavior or CI infrastructure was modified.
