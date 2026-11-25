## N242 Exam tutor transport

Exam tutor threads are keyed by sitting and keep their own turns. Existing tutor threads have an immutable required checkpoint relationship. The separate sitting store leaves course transcripts, project inventories and checkpoints independent. Both transports use the existing connector and grant checks. In the app, the exam-specific owner RPCs keep the same command and pagination contract as checkpoint tutor commands and take the sitting ID.

On a pending exam turn, the connector returns the exact sitting, its current status, the prior timed limit and the learner's reported active seconds and overtime. Time metadata carries no grade. Diagnosing and checking questionnaires accept private `examRows` bindings keyed by question ID. The learner questionnaire and transcript omit those bindings. The next grant-authorized pending handoff supplies submitted answers with their row keys, blueprint version and scoring rubrics. Follow-ups, images and transcript deletions stay scoped to the sitting. Owner export includes the transcript and questionnaire binding metadata. It redacts row keys, scoring keys, rubric steps and grant verifiers.

On any later pending turn, a grant holder can page through ten unscored answers at a time. Pass the returned `examQuestionnaireCursor` as `cursor` to the same `get(what=tutor_turn, id=...)` call. Recording a score removes that answer from the next read. Voiding the score makes the original rubric available for grading again.

Release verification belongs to the shared exam-mode PR. Combined SQL coverage checks the dedicated thread, claims, retries, timed replies and answers, rubric isolation and grant-bound reads. Existing checkpoint connections do not change.
