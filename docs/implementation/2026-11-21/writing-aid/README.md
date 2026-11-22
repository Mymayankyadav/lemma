# Writing aid in the checkpoint composer

**Superseded interaction baseline:** the owner rejected this fixed review row and More panel. The current [floating-card, swipe and adaptive-feedback design](../writing-aid-adaptive/DESIGN.md) replaces it. Screenshots and simulation results in this directory describe the earlier implementation, retained for comparison; they are not the current APK.

Owner-requested continuation of PR #1738, November 21. The trial is a separate Android demo installation, with Balanced assistance on by default. Production merge awaits the owner's phone test.

## Implementation checklist

- [x] Integrate the compact local runtime and its licenses, without external inference calls.
- [x] Keep three broad stationary word targets directly above the keyboard.
- [x] Show old wording struck through beside a proposed notation/spelling replacement.
- [x] Render a bounded faded continuation inside the answer, with an explicit accept target and desktop Tab shortcut.
- [x] Keep complete alternatives, rejection and writing preferences close to the draft.
- [x] Make each acceptance undoable and preserve the learner's original edit history.
- [x] Keep a declined edit dismissed while the learner continues typing.
- [x] Respect composition, selection, account, checkpoint and queued-answer boundaries.
- [x] Hold the original touched proposal through a draft update; reject stale taps.
- [x] Expose modes and all four surface switches in main Settings and chat.
- [x] Keep the existing math keyboard, symbol drawing, scratchpad, attachments, hints and transcript flows.
- [x] Measure target geometry and simulate placement and recovery costs.
- [ ] Owner tests the side-by-side APK on the physical phone.
- [ ] Owner accepts the trial before production release.

## Interaction decisions

The preferred word stays in the middle slot and the other two stay on either side. All three retain a full target while pressed. Suggestions wrap to two lines when text is enlarged; More exposes the complete text. This preserves a stable destination as the learner looks between the keys and the proof. The input and its review row share one themed surface and one focus indication. The review area keeps its height while the keyboard is open, so a replacement arriving does not move the keys.

The alternatives panel opens directly above the review area. On short landscape screens it uses the visible right-hand pane to avoid clipping controls above the viewport. It closes on further typing, outside touch or Escape. Keyboard users can reach every choice and close it without changing their draft. Escape first dismisses an offered completion; Tab accepts an eligible continuation and otherwise keeps its ordinary focus/placeholder behavior.

| Situation | Result |
| --- | --- |
| The best word matches the learner's intention | Tap its fixed slot; continue typing or take one further eligible neutral word. |
| The first choice is wrong | Choose another visible word, open More for the full alternatives, or keep typing. |
| A replacement is questionable | Inspect the struck-through original and replacement; choose Keep what I typed to dismiss that occurrence. |
| An accepted suggestion is wrong | Undo suggestion restores exactly the previous text and caret. Further typing retains ordinary Undo history. |
| A word is followed by punctuation | A generated trailing space is consumed; learner-authored spaces stay intact. |
| A proof contains an incorrect mathematical claim | The writing aid does not assess or repair proof truth. Spelling and explicit notation remain separate from logic. |
| An unresolved operand or proof step follows “take”, “by”, or a relation | Abstain at the unresolved logic boundary. The learner uses the existing math keys. |
| The cursor moves into earlier text or a range is selected | Suppress predictive offers; editing and the manual math catalogue remain available. |
| A finger is held while the text changes | Validate the proposal captured on press; never substitute the new occupant of that slot. |
| IME composition, a queued answer, or read-only state is active | Suspend insertion and retire stale work. |
| Settings or account/checkpoint scope changes | Invalidate prior proposals and learner evidence; persist preferences in the correct owner/demo scope. |
| Assets are still loading or cannot load | Keep ordinary editing available. No cloud fallback or draft upload occurs. |

## Modes and output budgets

Balanced is the demo default. Faster typing exposes earlier word stems and is experimental; it can steer wording. Strict uses literal notation and stronger typed stems. Off leaves the regular and math keyboards available. Each surface has its own switch. No suggestion is automatically inserted.

Words contain one word, at most three are displayed, and faded continuations contain at most two output tokens. Accepted text does not become newly authored context. Exact notation replacements can include the literal supplied symbols. These limits are described in [ENGINE.md](ENGINE.md), together with source hashes, licenses and the earlier research's limits. The production engine chunk is approximately 429 kB, or 165 kB gzip; installed APK size also includes the app's existing assets and handwriting runtime.

The simulations and screenshots in this directory are reproducible through `scripts/writing-aid-simulation.mjs`. They measure rendered geometry and model interaction costs. They cannot measure the owner's actual thumb motion, acceptance rate, thermal behavior or Android WebView latency. Physical results must come from the test APK.
