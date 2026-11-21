## N202 writing personalization reset

Forgetting learned writing preferences clears the local weights, vocabulary and permission for individual automatic corrections. Pausing keeps existing preferences for resume. Both actions retire feedback from earlier suggestions and automatic corrections, including retention timers. The composer keeps the answer and its undo history.

Each reset or pause starts a new learning generation for the current owner or demo profile. Feedback saves check that generation against storage. Ordinary feedback saves keep their generation so retention, refresh, undo and newly typed vocabulary can still train the model. Explicit rejection can still revoke permission for a correction while personalization is paused. Existing preference records are read without a migration.
