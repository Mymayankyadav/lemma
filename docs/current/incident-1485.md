## Incident #1485 — deterministic Calendar Day navigation

The Calendar Day navigation acceptance test mixed fixed November 2026 navigation dates with the real wall clock. Its loose Today selector also matched the week strip's current-day cell (for example "Monday, November 9, today"), causing strict-mode failures while the old strip was still rendering after navigation (#1389).

The test now uses the shared v7 scene clock (9 November 2026) and an exact Today button name. It verifies Today before and after Next week, Previous week restoring the original date, Today actually returning to the pinned date, the selected strip cell, and the disappearance of the Today action once already there. No application behavior or test thresholds change.

Agent: chat-907326#k9v2.
