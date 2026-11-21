## N202 implementation review corrections

Tutor keeps the answer while its IndexedDB draft opens. Send waits for recovery with the scratchpad enabled, including older drafts whose attached drawings and photos have no inline markers. Each inline reference must resolve to recovered image bytes. A failed read offers retry, missing chips can be removed, and the learner can explicitly continue with text. Offline replay and the live adapter check references too.

Account deletion now waits for the owner's Tutor image draft cleanup. The IndexedDB deletion transaction removes that owner's photos, drawings and queued answers together and records a deletion marker. Draft reads and writes also check the active account and the deletion marker. Other owners' records remain available.

Both Tutor transports now return the authorized pending turn's drawings and photos in composition order. The bearer endpoint reads image rows only after its existing grant command confirms the requested turn. The attachment foreign key supplies the owner for the private Storage path. The response includes image content and attachment labels. It retains legacy attachments and the text-only response shape. The grant, claim and reply contracts use the existing migrations.

Calendar Day shows a due count and an accessible disclosure for deadlines and practice below the desktop breakpoint. The due time and item title stack in the sheet to fit enlarged text. Today resolves the scheduler's chosen project and checkpoint for Tutor and uses that same target in **Why this**. A missing target offers a safe path entry. Paths shows completion only when the completed count reaches the plan total.

Compound TeX symbols terminate the final control word. **Keep drawing** restores the textarea caret before focus so consecutive insertions stay at the same place in the answer.

[Review verification](../ui-plan/2026-11-20/VALIDATION.md#implementation-review) · [Review screenshots](../ui-plan/2026-11-20/before-after/revision-2026-11-21/review/README.md)
