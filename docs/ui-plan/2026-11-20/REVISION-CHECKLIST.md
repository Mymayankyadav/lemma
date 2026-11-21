# Owner revision checklist

This revision continues PR #1738. The original N202–N216 main-commit checklist remains in `bd9bce887f5570d6714ff537b4fe27462a383ac9`. The owner rejected the original visual comparisons. Approval of the replacement evidence remains pending. [PR #1738](https://github.com/Mymayankyadav/lemma/pull/1738)

## Existing UI revision

- [x] Review all supplied visual assets and reconstruct the baseline's reachable screens, menus, forms and scroll positions.
- [x] Restore feature access using shared components and disclosures: study details, diagnostics, Atlas subsets/edits, Calendar suggestions/triage, exact time/estimates, review history, progress details and source controls.
- [x] Give Calendar the shared title without subtitle; week/month arrows; Choose date fourth in its menu.
- [x] Fix Atlas creation/edit overlaps, narrow task forms, Review scratch overlap, count labels and empty button progress spacing.
- [x] Keep Tutor header information compact; show a tappable presence light beside its title.
- [x] Keep three keyboard suggestions, key previews/haptics/hit cells and no vertical symbol-grid scrolling.
- [x] Integrate the scratchpad surface, gestures and resizing with chat.
- [x] Insert editable image-reference chips at the caret, preserve text/image order in the saved answer and MCP, and retain recent image edits through Undo.
- [x] Guard offline queued edits, attachment limits, storage-write failure and legacy draft migration.
- [x] Apply the latest Atlas direction with translucent floating controls, in-place search, List above the paused map, and navigation hidden for both List and idea panels with restoration on close.
- [x] Consolidate Atlas options into one transparent vertical rail with translucent buttons, subject shortcuts underneath and a pinned eye / crossed-out-eye Hide/Show control; preserve Back, search, navigation and map state.
- [x] Correct the CI browser regressions, preserve map framing and modal focus, and verify enlarged chart labels and the Path goal disclosure without changing test thresholds or budgets.
- [x] Finish responsive fixes for Tutor viewport anchoring, Calendar hour labels, the compact dock, Path actions and Day-theme contrast.
- [x] Restore active or paused cards through Undo, scoped to the account that deleted them.
- [x] Run production regressions after integrating the latest input and layout changes. [Validation](VALIDATION.md)
- [x] Publish and review complete revised visual evidence, including inline chips and keyboard-open states.
- [ ] Owner visual acceptance of the replacement evidence (N216).

## Mobile proof input beta — added November 21

The owner's latest instructions specify a Settings beta opt-in without a physical-device approval gate. Touch entry uses the custom keyboard with a direct **Draw symbol** button. [Supplied implementation specification](../../implementation/2026-11-21/mobile-math-input.md)

- [x] Add the canonical symbol catalogue, checked Unicode and TeX insertion, and suggestions that preserve the learner's mathematical choices.
- [x] Implement transient single-symbol ink, compatible extensions, cancellation, owner and revision guards, and atomic acceptance.
- [x] Package the licensed and pinned Detypify model, local worker and exact asset manifest for web and Android-mode builds. Verify web offline reload and the locally served Android bundle.
- [x] Implement separate automatic-acceptance policy. The current asset set requires explicit candidate choice pending calibration and extension coverage.
- [x] Preserve the inline-picture scratchpad and input history with the Settings beta enabled or disabled.
- [x] Run deterministic regressions, real model inference, build and asset verification, and production browser flows.
- [x] Record desktop and browser results and the unmeasured physical-device cases. [Runtime validation](../../../public/models/tutor-symbols/detypify-0.3.0-lemma-v1/README.md)
- [x] Show up to three matches and three compatible extensions in one row with a divider, loading spinner and accessible group labels. An eligible duplicate appears under **Could become**.
- [x] Rank symbol searches by exact glyph, TeX, name, prefixes, misspellings and shape descriptions.
- [x] Simulate distorted, partial and unsupported ink with the real local worker. Compare candidate counts and threshold tradeoffs, replay the manual geometry change, and record the separate stress set with pen lifts, missed strokes and additional prototypes. [Simulation report](../../implementation/2026-11-21/ink-simulation/README.md)
- [x] Record local language-model and alternate-recognizer feasibility for the target device. [Local model options](local-input-model-options.md) · [Handwriting recognizers](handwriting-model-options.md)

Optional LLM ranking is research only unless a measured benefit justifies it. First release sends no handwriting to inference services and introduces no proof-solving model.

## Implementation review

- [x] Wait for Tutor image recovery, verify every referenced image and keep the answer recoverable after a failed read.
- [x] Include the Tutor ink database in owner deletion and fence pending reads and writes.
- [x] Show Calendar Day deadlines and due practice below the desktop breakpoint.
- [x] Route the scheduled Tutor action and its explanation to the selected project and checkpoint.
- [x] Terminate compound TeX symbols before letters and keep the insertion caret.
- [x] Deliver ordered image content through the existing bearer grant as well as the regular connector.
- [x] Keep the symbol pad active for repeated insertions at a textarea caret.
- [x] Show plan completion only when all checkpoints are complete.

[Review verification](VALIDATION.md#implementation-review) · [Review screenshots](before-after/revision-2026-11-21/review/README.md)

## Delivery

- [x] Update current-state notes, feature-retention matrix and validation report.
- [x] Update the PR description with the final evidence.
- [x] Put the completed revision checklist in the follow-up commit, push it to the existing PR and finish the run-log result.
- [ ] Independent review of the PR's existing migrations before deployment; no direct production migration or merge from this task.
