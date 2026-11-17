## Incident #1485 — deterministic Calendar Day navigation

The Calendar Day navigation acceptance test mixes fixed November 2026 navigation dates with the real wall clock. The incident fix will pin its clock and verify the complete next-week, previous-week and return-to-today flow without changing Calendar behavior or removing assertions.

Agent: chat-907326#k9v2.
