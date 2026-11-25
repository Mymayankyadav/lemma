## First-study grade confirmation (#1872)

The signed-in review round shows “Confirming your grade…” during account verification and grade submission. If confirmation fails, the learner can select “Retry grade confirmation.” Previously, that button appeared before the first grade request could reach the server.

Reloading recovers the saved rating and schedule using the original operation ID. Browser tests cover a reload during account verification and a reload after the server applies the grade but its acknowledgement is lost. Each path records one grade.
