# Lemma: mobile proof input assistance — implementation specification

**Prepared:** 21 November 2026

**Repository:** [Mymayankyadav/lemma](https://github.com/Mymayankyadav/lemma)

**Inspected branch and commit:** `main` at [`24c8a225390e5fade05d95208d91fe2b087fcb38`](https://github.com/Mymayankyadav/lemma/tree/24c8a225390e5fade05d95208d91fe2b087fcb38)

**Latest inspected change:** N201, “Open focused tutor chat with Gboard-style input and MCP replies”

**Status:** Final implementation plan; no implementation or deployment performed. Repository inspection was read-only. No repository files, branches, issues, pull requests, database records, or production configuration were changed.

## 1. Recommended implementation

Extend the existing `TutorComposer` with three coordinated input features:

1. **Local proof-writing autocomplete:** finish words, notation and explicitly requested sentence structures while preserving the learner’s mathematical choices.
2. **Local single-symbol handwriting:** recognize a finger or stylus drawing continuously, display likely symbols and possible completed symbols, and insert automatically only when both identity and completion are sufficiently certain.
3. **A deterministic symbol catalogue:** always available through **Symbols**, with search, categories and recent choices. It works without recognition or a network connection once the app itself is available.

Use the existing React application for Android Capacitor and mobile web. Keep the current custom keyboard and device-keyboard option. Recognition runs in a worker; accepted edits use the composer’s existing text, selection, undo and draft-save path. The baseline needs no LLM, remote inference endpoint, new tutor API or Supabase schema change. [R01], [R02], [R03]

**Model decision:** evaluate Detypify first as the small local symbol recognizer, behind a Lemma-owned adapter. Compare Symbolizer only after resolving its redistribution terms. Neither is already qualified for rough finger input on the user’s phones. Detypify’s current service also needs a preprocessing/worker integration adjustment; it is not a drop-in worker package. The full model decision is in section 9.

**Text decision:** retain and constrain the existing deterministic completion engine. An optional small language model may later rank approved forms, but it must not produce unrestricted continuations. A statement such as “Let x” does not authorize choosing a domain, declaring x arbitrary, or predicting the next logical step.

### Meaning of “formal” in this feature

This feature helps write mathematical notation and clear mathematical prose. It does not establish that the proof is correct, and it does not introduce Lean, Isabelle or another proof-checking language. Proof assessment remains with the existing tutor flow after the learner sends their answer.

### Scope boundaries

The first implementation covers one drawn symbol at a time and local text completion in the tutor composer. Full handwritten equations, photograph OCR, freehand proof recognition and generated proof steps are separate work. Existing N200 concerns optional image-to-equation recognition in Pad and remains a distinct blocked task; its explicit-insertion contract must not be silently repurposed for this feature. [R04]

## 2. Required interaction contract

The following are requirements, not capabilities already demonstrated by the current app or candidate models.

### 2.1 Two independent decisions before automatic insertion

**Identity:** does the current ink clearly identify one supported symbol? Require calibrated confidence and separation from competing interpretations. A high raw model score by itself is insufficient.

**Completion:** could the current ink plausibly be an unfinished drawing of another supported single symbol? This check is separate from recognizing completed symbols. A classifier can be very confident about `<` while `≤` remains a plausible next stroke.

Automatic insertion is allowed only when all of these are true:

- The user has enabled automatic insertion and this model/symbol family has qualified for it.
- No candidate selection, catalogue interaction or other explicit-choice lock is active for the session.
- A genuine drawing `pointerup` has completed the latest stroke; no drawing pointer remains active.
- The latest result matches the active ink session and revision.
- Identity is clear and completion is classified as finished.
- The current editor/owner/caret snapshot still matches the insertion target.
- The editor is writable, outside IME composition, and the edit fits its length limit.
- This ink revision has not already been committed.

Missing confidence, incomplete extension coverage or an unknown runtime state means **explicit choice**, not presumed certainty.

### 2.2 Required decisions

| Situation | Behaviour |
|---|---|
| Finger or stylus still drawing | Update visible ink and candidate previews; never insert. |
| Clear identity, no plausible extension, final pointer-up | Insert the recognized symbol once, without a blanket waiting timer. |
| Low confidence in the first candidate | Keep ink; offer candidates; require a tap. |
| Close leading candidates, including a close runner-up | Keep ink; show up to five distinct recognized candidates; require a tap. |
| Clear identity, but another symbol can contain this ink | Keep ink and offer possible completions; allow another stroke or explicit selection. |
| User taps a recognized candidate | Insert exactly that symbol. |
| User taps a possible completion | Insert the complete chosen symbol, including the parts not drawn. |
| User taps the manual catalogue | Insert exactly the selected symbol; recognition confidence is irrelevant. |
| No credible interpretation | Keep ink and offer redraw or Symbols; do not force the highest score. |
| Pause or timeout | Do not turn uncertainty into acceptance. |
| User resumes typing with unresolved ink | Preserve the typing; do not accept a candidate. Make any retained ink explicitly selectable. |
| Pointer cancellation, lost capture, app interruption | Never treat cancellation as completion. |

**First-release decision:** resuming typing does not implicitly finish an extendable drawing. Explicit selection of the shorter or longer symbol is the dependable completion signal. A later explicit “finish ink” gesture can be evaluated separately; it must still refuse low-confidence or close-candidate recognition.

### 2.3 Recognized symbols versus possible completions

Use separate labels, for example **Matches** and **Could become**. For current ink shaped like `<`, a valid presentation is:

| Matches | Could become | User action |
|---|---|---|
| `<` | `≤` | Tap `<` to finish the shorter symbol; tap `≤` to insert it immediately; or draw the lower stroke. |
| `∈` | `∉` | Tap either candidate, or draw the negating stroke. |
| `⊂` | `⊆`, where supported by the chosen notation convention | Tap the desired symbol, or continue drawing. |

These examples are geometry families, not a complete extension inventory. Actual proposals depend on supported glyphs and the current strokes. A completion score describes compatibility with a future completed shape; it is not the probability that the missing strokes already exist.

The “Could become” row must also handle partial ink that is not itself a recognizable complete symbol. Do not generate it solely from the first recognized candidate or from the displayed top five.

### 2.4 Interpretation of “the image is a subset”

Implement this as **approximate compatible stroke containment**: the observed strokes could form part of another supported glyph after additional strokes. Preserve relative position, scale, aspect and stroke shape; tolerate noisy finger input and different drawing orders.

Literal binary pixel inclusion would fail with normal variation. Unrestricted containment in arbitrary expressions would make nearly every mark unfinished. Restrict matching to a finite, audited single-symbol catalogue. If a symbol family has not been checked for plausible partial forms, keep it in explicit-selection mode.

## 3. What already exists in Lemma

### 3.1 Integration map

| Existing file | Verified role | Planned use |
|---|---|---|
| `src/features/tutor/TutorComposer.tsx` | Custom and native keyboard modes; local suggestions; textarea; selection/history; IME; send gating | Main integration point; retain one authoritative draft/history. |
| `src/features/tutor/notation.ts` | Symbols, phrase aliases, word completion, next-word seeds, spelling correction | Tighten the completion policy and consume canonical symbols. |
| `src/features/tutor/TutorChat.tsx` | Passes draft callbacks and title/step/question as notation context | Supply stable session identity and bounded lexical context. |
| `src/features/tutor/tutor.css` | Keyboard, candidate strip, safe area and visual-viewport layout | Add accessory, drawing panel and candidate states. |
| `src/features/pad/padEdit.ts` | UTF-16 selection snapshots, grapheme-aware editing, Unicode/TeX insertion, undo/redo | Reuse the existing editing primitives. |
| `src/features/pad/LocalPadInk.tsx`, `padInk.ts` | Local note drawing and pointer capture/cancellation | Reference gesture handling; use a dedicated recognition buffer. |
| `src/data/tutor/local-storage.ts`, `src/data/authBoundary.ts` | Owner-scoped writes, account generations and deletion fences | Preserve ownership boundaries and cancel stale work. |
| `src/flags.ts` | Reviewed feature defaults and development/test overrides | Add proposed assist flags through the normal release workflow. |
| `vite.config.ts`, `capacitor.config.json` | `/lemma/` deployment; PWA and Android build variants | Configure local model/runtime assets deliberately. |

These are current files at the inspected commit. New filenames in section 13 are proposals. [R02], [R03], [R05], [R06], [R07], [R08], [R09], [R10], [R22], [R23], [R24]

N201 already opens a focused checkpoint tutor chat; Pad remains a saved-notes surface in Settings. The routes use the existing hash router, including `/lemma/#/p/<slug>/cp/<code>/tutor`. This work should extend that flow instead of introducing a second editor or returning Pad to the main conversation. [R01], [R11]

### 3.2 Existing editing guarantees to preserve

`TutorComposer` already owns `history`, `cursor` and `pendingSelection`. Its `commit` function enforces read-only state and a **2,000 UTF-16 code-unit** text limit before calling `props.onChange`. Existing `PadTextHistory` keeps text and selection snapshots; caret-only changes do not consume undo. Deletion/navigation are grapheme-aware even though textarea offsets are UTF-16. [R02], [R06]

All accepted candidates must take one shared transaction:

`symbol ID or approved text edit → PadEdit → changePadText → composer commit → onChange`

One accepted symbol, including a TeX command with a terminating separator, is one undo step. Do not route machine-generated symbol insertion through `typedNotation`, which could apply an unrelated spelling or phrase conversion. Preserve the current immediate undo of spelling corrections and the current placeholder behaviour.

Externally replaced drafts currently reset composer history. Consequently, recognition must be invalidated on send, restored drafts and other external value changes, even if the React component remains mounted. A stale result must never appear in the next answer. [R02]

### 3.3 Concrete gaps the implementation must fix

1. **Current suggestions can supply reasoning.** `BASE_NEXT` offers induction/contradiction after “by”; other paths introduce variables and positivity conditions after quantifiers. Section 4 specifies the correction. [R03]
2. **Suggestions disappear in device-keyboard mode.** The strip is inside the conditional custom keyboard; selecting the native keyboard hides that container. Extract a persistent accessory outside it. [R02]
3. **Current tutor insertion is literal.** `insertNotation` does not choose Unicode versus TeX. `insertPadSymbol` already provides a useful context-sensitive primitive; add a deliberate symbol adapter. [R03], [R06]
4. **Pad ink is not a recognizer buffer.** Its fixed 640×400 coordinates, non-aspect-preserving SVG and `(x,y)` points lack the geometry/timing contract needed here. [R07], [R23]
5. **Offline model assets are not configured.** Current Workbox patterns exclude `.onnx` and `.wasm`, and have a 4 MiB per-file precache limit. The Android build does not use a service worker. [R09]

## 4. Autocomplete that preserves the learner’s reasoning

### 4.1 Allowed and disallowed suggestions

Use deterministic transformation classes with explicit evidence from the learner’s input. Do not try to enforce this requirement using only an LLM instruction such as “do not solve the proof.”

| Learner input or action | Permitted assistance | Must not add |
|---|---|---|
| `prei` | `preimage` as a word completion | A claim about a particular preimage. |
| `contrad…` | Complete the word `contradiction` | A contradiction argument. |
| `by ` | Neutral spelling/typing help; no selected justification | Induction, contradiction, a theorem or even an inferred “by definition.” |
| Explicit `for all`, `forall` or `\forall` | Offer `∀` | A new variable, domain or quantifier order. |
| `let x` | Complete the wording already started; leave the declaration unfinished | `x ∈ ℝ`, `x > 0`, or “arbitrary.” |
| Explicit declaration shorthand `let x in A` | Offer `Let x ∈ A.` as one selectable line | Arbitrary/fixed/positive, or an additional assumption. |
| User deliberately selects `Let … ∈ …` scaffold | Insert `Let □ ∈ □.` with slots | Guess either slot from the problem. |
| Explicit `for every x in A, P(x)` | Offer `∀x ∈ A, P(x)` in the supported shorthand grammar | A witness or another quantifier. |
| `therefore` | Complete that word or offer `∴` | The conclusion the learner should prove. |
| `if` | Complete the token being typed | Change the connective to “if and only if.” |
| `subset` | Offer notation alternatives or use an explicitly selected convention | Silently settle `⊂` versus `⊆`. |

Full-line completion is permitted when **all mathematical content in that line was explicitly supplied**. Start with a small documented shorthand grammar, not unrestricted natural-language formalization. If parsing is ambiguous, offer a structure with unresolved slots or do not suggest a line.

“Trivial next step” is not a reliable boundary: expanding a definition can still do the exercise for the learner. The enforceable first-release rule is **no new mathematical proposition or choice**, regardless of how easy it seems.

### 4.2 Repair the current defaults

Audit these exact areas in `notation.ts` before enabling the new assistant: [R03]

- `BASE_NEXT`: remove strategy and connective changes from default next-word prediction, including `by → induction/contradiction/definition`, `if → and only if`, `suppose → not`, and unsolicited “both inclusions.”
- Quantifier continuations: remove automatically proposed `x ∈`, `ε > 0` and `δ > 0` after `∀`, `∃` or `∃!`.
- `Phrases`: exclude the image-witness line, epsilon–N argument and two-inclusions argument from the default input assistant. They contain reasoning even when some operands are blank. If retained elsewhere, treat them as an explicit tutoring/hint feature with separate scope.
- Context-derived snippets: do not extract useful mathematical expressions from the question and present them as the next line of the learner’s answer.
- Alias meanings: review `subset`, `contains`, and mappings of isomorphic/homeomorphic/congruent phrases. Do not silently collapse a course’s notation conventions into one glyph.
- Alias prefixes: do not auto-convert a phrase that may still extend, such as “less than” before “or equal to,” or “there exists” before “a unique.” Prefer an explicit candidate or an unambiguous completed command such as `\leq`.

Do not ban words such as “induction” globally. Completing a word the learner started differs from suggesting a strategy after “by.” Keep legitimate lexical help and the existing suffix/casing protections.

### 4.3 Completion engine contract

Implement a pure local engine with bounded input and work:

1. Read the current draft, exact selection and a bounded preceding text window.
2. Identify explicit aliases, current token prefixes or a recognized shorthand declaration.
3. Generate proposals only from approved transformation classes.
4. Verify that each identifier, relation, quantifier and mathematical condition is sourced from learner input or remains an unresolved placeholder.
5. Rank using prefix match, lexical frequency and accepted local symbol usage, without solving the exercise.
6. Display a small stable set. Apply only on explicit candidate selection, except any separately enabled exact-alias conversion already supported by the keyboard.

Problem titles/questions may supply vocabulary for completing a word already being typed. They must not supply answer fragments, strategy ranking, missing domains or witnesses. Ordinary symbol categories/recent symbols remain browseable controls, not claims about what logically follows.

Use structured proposals instead of only the current `{text, start, kind}`:

```ts
type CompletionProposal = {
  id: string;
  editorRevision: number;
  selectionRevision: number;
  replace: { start: number; end: number }; // UTF-16 offsets
  replacement: string;
  kind: "word" | "alias" | "scaffold" | "explicit_rephrase";
  policyRuleId: string;
  sourceRanges: readonly { start: number; end: number }[];
};
```

Before acceptance, recompute deterministic proposals or verify the exact revision/range. Preserve text after the caret. Do not apply a proposal after IME input, cursor movement or an external draft replacement. Preserve `□` selection/navigation and the existing block on sending unresolved placeholders.

### 4.4 Optional LLM, after the baseline

No language model is needed in the first release. If a measured gap remains, evaluate a small specialized model only to choose approved template IDs or map explicit shorthand to typed slots. A model score must not expand the allowed output grammar. Validate before displaying, not only before insertion: a visible suggestion can already reveal a proof step.

Gemma 3 270M is a research candidate for specialized local tasks, not an established winner for this workflow. Its task quality, browser memory, startup time and phone latency would need separate qualification. Do not make Chrome’s built-in Prompt API the mobile baseline; its documented device support excludes Android and iOS. No cloud LLM call should block typing or drawing. [E08], [E09]

## 5. Canonical symbols and manual input

Create one deterministic registry shared by the symbol picker, recognized candidates, possible completions and notation aliases. Keep it independent of the ML runtime.

```ts
type SymbolDefinition = {
  id: string;                       // Stable, not a model output index
  name: string;                     // Accessible human-readable label
  glyph: string;
  tex: string;
  aliases: readonly string[];
  category: string;
  recognizerIds: readonly string[];
  extensionFamilyIds: readonly string[];
};
```

Model metadata, calibration and automatic-insertion eligibility belong in a versioned recognition policy, not in a blanket `autoInsert: true` on every catalogue entry. The manual catalogue can include more entries than the qualified recognition subset. Separate multi-character templates from single-symbol classes.

Map Detypify’s Typst names or another model’s LaTeX labels to these IDs. Deduplicate true aliases of the same glyph before display; preserve genuinely different mathematical symbols. Do not discard alternative class probability mass and then renormalize the remaining supported choices into false confidence.

### Insertion encoding

Use Unicode in prose and an audited TeX representation when the caret is inside an explicit math region. Reuse `scanPad`/`insertPadSymbol` where their contract matches; test insertion before a closing delimiter and inside a selected placeholder. Preserve required spaces after TeX control words. For selections spanning incompatible prose/math boundaries, require a clear target rather than inventing a serialization. [R06]

Display picker glyphs as controlled text or existing safe math rendering. Never accept arbitrary model-generated HTML/TeX. Retain the current transcript renderer; `LocalPadPreview` and `MathText` have different rendering contracts and do not need to be unified for this feature. [R12], [R25]

### Manual catalogue behaviour

- A stable **Symbols** control remains available while the recognizer is disabled, loading, failed or offline.
- Provide categories, name/alias search, and recent selections; provide favourites once their persistence is covered by owner cleanup.
- Search is local. Include names such as “for all,” “not element of,” “epsilon,” and TeX aliases.
- Selecting a symbol inserts it at the preserved caret through the same transaction used by recognition.
- Opening or closing the catalogue never accepts unresolved ink. A manual selection invalidates any pending automatic recognition result; only the chosen symbol is inserted.
- Provide independent controls for **recognition** and **automatic insertion**. Users can retain candidate suggestions with automatic insertion off, or use only the deterministic keyboard/catalogue.

## 6. Mobile layout and continuous drawing

### 6.1 Preserve the existing keyboard flow

Extract `TutorInputAccessory` outside the custom keyboard’s `shown` branch. Keep **Draw** and **Symbols** in stable positions. During typing, the accessory shows text candidates; while drawing, it shows **Matches** and **Could become**. Candidate buttons may scroll horizontally on narrow screens without causing page overflow.

In custom-keyboard mode, the drawing panel replaces the key area instead of opening a separate full-screen editor. Keep the draft and enough of the tutor question visible. **Single-symbol mode is the default:** after a successful insertion, clear the accepted ink and immediately restore the previous keyboard view and caret, so the next ordinary character needs no return-mode tap. Provide a deliberate **Keep drawing** option for entering several symbols consecutively.

In device-keyboard mode, preserve the textarea selection and prefer a compact drawing surface above the still-open keyboard, without blurring the textarea. Candidate taps should preserve focus where the platform permits. After insertion, collapse that surface and retain the keyboard/caret. A deliberately expanded panel may require a keyboard transition, but must not be the default single-symbol flow. A web page cannot guarantee reopening an operating-system keyboard after an asynchronous result; qualify focus preservation on Safari, Chrome and Android WebView. If a native-mode implementation cannot preserve continuous typing, retain explicit candidate-tap acceptance with gesture-based focus restoration or use the existing custom-keyboard mode; do not claim an unverified seamless native transition.

Retain the current visual-viewport adjustment, short-phone compact start, safe-area padding and separation between transcript/keyboard scrolling. Reuse the app’s touch-target convention: 44px on web and 48px in its Android shell. Do not apply `touch-action: none` to the whole composer; limit it to the drawing surface and controls that require it. [R02], [R05], [R13]

### 6.2 Drawing mechanics

Use Pointer Events with one owned drawing pointer. Capture that pointer, draw visible ink immediately and record a bounded session:

```ts
type InkPoint = {
  x: number;
  y: number;
  t: number;
  pressure?: number;
};
type InkStroke = {
  pointerType: "mouse" | "pen" | "touch" | "unknown";
  points: readonly InkPoint[];
};
```

Retain stroke boundaries and times even if the first classifier uses only `(x,y)`. Reject non-finite geometry; preserve aspect ratio when the panel resizes. Bound points and stroke count, resampling complete paths rather than silently dropping important trailing strokes. Establish limits from real glyph traces, then test their overflow behaviour. An over-budget drawing must fall back to explicit selection/redraw rather than auto-inserting a truncated shape.

Provide **Undo stroke**, **Clear**, **Cancel** and **Symbols**. Drawing undo is separate from text undo until a glyph has been inserted. A dot is a valid stroke shape and must remain visible, though the model may abstain from classifying it. Ignore secondary contacts for classification, track interruption, and do not auto-commit a gesture affected by cancellation or unexpected multitouch.

Every mutation of stored session ink, including Undo stroke, Clear, cancellation and geometry rebasing/resampling, advances `inkRevision`. Pure preprocessing of an immutable snapshot does not mutate that session. Clear also removes pending snapshots and candidates. Clear and Undo invalidate the preceding normal-pointer-up receipt and automatic eligibility. Undo may request fresh previews, but cannot automatically insert until a new genuine drawing gesture ends; explicit selection remains available. Final pointer-up must append its final coordinates and associate a completion receipt with that exact resulting snapshot.

The UI renders at the normal frame cadence without waiting for inference. Recognition consumes snapshots on a bounded cadence and immediately after a completed stroke. Permit only one inference in flight and one replaceable latest-pending snapshot. Finishing an old inference does not entitle it to update the current UI.

To avoid starving previews during continuous movement, allow a recent older snapshot to update **non-actionable** previews while drawing, only within the same append-only ink epoch, editor target and asset set. Accept preview revisions in increasing order and enforce a short configurable age limit. Clear, Undo, geometry changes, cancellation and target changes invalidate that epoch. At pointer-up, an older preview may remain visibly pending, but its buttons stay disabled until the exact final revision is recognized. Candidate acceptance and automatic insertion always require an exact current snapshot.

### 6.3 Keep candidates usable

- Show up to five distinct recognized symbols; show a compact separate row of possible completions when present.
- Do not display raw scores as percentages. Use clear labels and candidate ordering.
- Avoid reordering a candidate underneath a finger while that candidate is being selected. Associate the selection with the candidate ID and revision visible at pointer-down.
- Candidate pointer-down and opening Symbols synchronously lock out automatic commits for that ink session. Keep the lock through selection/cancellation; closing the picker must not release a waiting auto-commit. A new drawing gesture may restore eligibility after the explicit interaction has ended.
- A candidate tap is accepted only after the drawing pointer is released. Provide equivalent keyboard and screen-reader activation.
- Announce meaningful state changes, not every recognition update. Respect the existing haptics preference; do not vibrate on every stroke or inference.
- If typing or cursor movement interrupts unresolved ink, retain at most one transient drawing and suspend its insertion target. Explicitly resuming that drawing rebinds it to the current caret and requests fresh candidates. It does not retroactively trigger automatic insertion.

## 7. Recognition, partial-symbol completion and uncertainty

### 7.1 Three cooperating components

**Complete-symbol classifier:** ranks glyph identities from the current ink. It returns the full available score information, not just the displayed five candidates.

**Partial-symbol matcher:** evaluates whether the ink can be part of a supported longer glyph and produces possible completions. It runs even if the complete-symbol classifier is unsure or fails to include the longer glyph in its top five.

**Acceptance policy:** combines identity evidence, completion evidence and editor state. It is deterministic and separately tested. The model never directly edits the proof.

### 7.2 Implement the partial-symbol matcher

Start with a curated extension-family graph and multiple geometric templates per supported family. Include common relations such as `< → ≤`, `> → ≥`, `= → ≠`, `∈ → ∉`, and subset/superset families actually present in the catalogue. The graph narrows matching; it does not itself prove that arbitrary input matches a partial glyph.

For each completion candidate, test whether observed strokes can map to a proper subset or unfinished portion of its template strokes while leaving plausible additional ink. Account for common alternative stroke orders, merged/split strokes and imperfect shape. Use shared spatial normalization for the entire drawing/template comparison. Independently stretching every stroke would erase the geometry that distinguishes symbols.

Retain original canvas-scale geometry as well as normalized geometry. Normalizing a tiny incomplete stroke to the full classifier image can make it resemble a complete glyph. Minimum evidence and partial-template compatibility must therefore be evaluated independently of the full-symbol classifier.

This matcher may combine cheap shape features and template distances initially. A learned partial-ink scorer can replace or augment it later if measured coverage requires that. Training examples must include partial paths within strokes, proper stroke subsets and different writing orders, not only the prefix of one canonical order.

Only audited families may return `completionDecision: "finished"` for automatic acceptance. Uncovered, uncertain or conflicting families return `"unknown"` or `"extendable"`, which requires a choice. A short pause does not establish that the remaining stroke will never be drawn.

### 7.3 Calibrated identity and abstention

For a qualified model, derive confidence from the full output under a documented calibration procedure. Require an absolute confidence threshold, a separation/margin condition, and rejection of unsupported/unknown input. Use the probability or score mass outside the supported catalogue as evidence against automatic acceptance.

Do not hardcode a claim that “0.95 means 95% correct.” Neural classifier scores can be poorly calibrated, and softmax alone does not solve this. Fit thresholds on a development/calibration split, then assess them on held-out people/devices and noisy, partial and unknown drawings. Calibration methods such as temperature scaling are candidates, not guarantees of open-set reliability. [E07]

Keep thresholds in a versioned policy linked to the exact model, preprocessing and catalogue. If calibration is absent, invalid or incompatible, return candidates with automatic insertion disabled. Do not increase acceptance merely to hit a coverage target.

The extension decision must remain independent of mathematical context. For example, do not prefer `≤` because it would make the learner’s proof correct when the ink actually supports `<`. User-selected symbol families and personal handwriting examples can eventually help recognition, but the tutor’s answer or hidden solution must not influence it.

## 8. State, asynchronous results and atomic insertion

### 8.1 Explicit state model

Use a reducer for these states: `idle`, `drawing`, `recognizing`, `choice_required`, `awaiting_more_ink`, `paused`, and `committing`.

| Event | State/action |
|---|---|
| Open Draw at a valid caret | Start a fresh session/bookmark. |
| Owned pointer-down/move | `drawing`; increment ink revision; update previews only. |
| Genuine pointer-up | Append final coordinates, advance revision and record its normal-completion receipt; request latest classification/partial matching. |
| Clear or Undo stroke | Advance ink revision, invalidate old completion receipt and automatic eligibility; Clear also removes candidates/pending snapshots. |
| Valid result, uncertain identity | `choice_required`. |
| Valid result, possible extension or unknown completion | `awaiting_more_ink`; never insert on a timer. |
| Valid result, both gates pass and final pointer-up recorded | `committing`, if automatic insertion is enabled. |
| Candidate pointer-down or opening Symbols | Lock automatic insertion; preserve the displayed candidate identity/revision. |
| Candidate/manual selection | Explicitly attempt the chosen insertion; automatic results cannot overtake it. |
| Accepted transaction | Clear consumed ink; return to `idle`. |
| Length/read-only/target failure | Keep ink and draft; report the local reason. |
| Typing, caret movement or mode interruption | `paused`; invalidate target and automatic eligibility. |
| Cancel, owner change, navigation or unmount | Invalidate session and outstanding results; discard private transient state as appropriate. |

### 8.2 Worker protocol

Use a bounded typed message protocol; include identities sufficient to reject every stale callback:

```ts
type EditTarget = {
  scopeKey: string;             // Owner + auth generation + project/checkpoint/thread
  mountId: string;
  editorRevision: number;
  selectionRevision: number;
  modeRevision: number;
};

type InkResult = {
  target: EditTarget;
  sessionId: string;
  inkEpoch: number;             // Invalidated by non-append edits/interruption
  inkRevision: number;
  sampledAtMs: number;          // Captured by the main thread for preview age
  assetSetVersion: string;
  recognized: readonly {
    symbolId: string;
    rankScore: number;
    calibratedConfidence?: number;
  }[];
  possibleCompletions: readonly {
    symbolId: string;
    extensionScore: number;
    requiresExplicitSelection: true;
  }[];
  identityDecision: "clear" | "uncertain" | "unknown";
  completionDecision: "finished" | "extendable" | "unknown";
};
```

The main thread owns the current editor state and decides whether a result is still usable. Worker cancellation is best effort: when an inference cannot be interrupted, let it finish and discard its output. Never use “last promise to resolve wins.”

### 8.3 One commit path

The following is behavioural pseudocode, not code already present in Lemma:

```ts
function onInkResult(result: InkResult) {
  if (!matchesCurrentEpochTargetAndAssets(result)) return;
  if (canShowNewerBoundedAgeProgressPreview(result)) {
    showCandidatePreviews(result, { actionable: false });
  }
  if (!matchesCurrentSessionAndTarget(result)) return;
  showCandidatePreviews(result, { actionable: activePointerCount === 0 });

  if (!automaticInsertionEnabled()) return;
  if (explicitChoiceLockedForSession()) return;
  if (!qualifiedForAutoInsertion(result)) return;
  if (activePointerCount !== 0 || !latestStrokeEndedNormally(result)) return;
  if (result.identityDecision !== "clear") return;
  if (result.completionDecision !== "finished") return;
  if (isComposing() || isReadOnly()) return;

  tryCommitSymbol(result.recognized[0].symbolId, {
    source: "qualified_automatic",
    expected: result,
  });
}

function acceptInkCandidate(candidateId: string, displayedRevision: number) {
  if (!candidateStillDisplayed(candidateId, displayedRevision)) return;
  if (!currentTargetValid() || activePointerCount !== 0 || isComposing()) return;
  tryCommitSymbol(candidateId, {
    source: "explicit_candidate",
    expected: currentSessionSnapshot(),
  });
}
```

`tryCommitSymbol` resolves a canonical ID, computes the complete encoded edit, checks the current revision/selection and length limit, and commits once through the existing history. It must return an accepted/rejected receipt; the current `commit` returns no status, so add a small checked adapter or receipt return rather than assuming `onChange` happened. Clear ink only after the local edit is accepted. Reuse the parent’s existing draft-save warning if persistence subsequently fails; do not silently discard the accepted text.

Candidate and manual paths bypass the probability gates because the user made the choice. They still enforce composition, read-only, target validity, length, canonical-ID validation and one-time commit. Invalidate the recognition session before a manual insertion can race with an automatic callback.

Set the explicit-choice lock at candidate pointer-down or catalogue opening, before a click/selection callback. An inference completing between pointer-down and click must not insert another symbol. Cancelling the press or closing the catalogue does not automatically accept any pending result. A new normally completed drawing gesture is required to restore automatic eligibility for that session.

### 8.4 Required invalidation boundaries

Increment/invalidate revisions on text edits, selection changes, external draft replacement, undo/redo, send, checkpoint/thread change, owner/auth generation change, confirmed deletion, relevant mode change, read-only transition and unmount. Suspend on IME composition start and do not queue a stale acceptance for composition end.

Do not accidentally disable ordinary draft editing merely because `canSend` is false; preserve the composer’s existing distinction between editing and delivery. Raw drawing input must not trigger `onSend`, `onAsk`, connector grants, tutor replies or proof assessment. [R02], [R08], [R14]

## 9. Model and runtime selection

### 9.1 Candidate comparison

| Candidate | Verified evidence | Decision for Lemma |
|---|---|---|
| **Detypify** | Author describes an offline PWA, small model and 400+ symbols; MIT code; reusable inference service. | First benchmark candidate. Adapt preprocessing/runtime and map Typst metadata to Lemma IDs. No verified phone accuracy/latency claim. |
| **Symbolizer** | Author reports a 1.6 MB ONNX model, 396 symbols and offline WASM inference; reported test top-1 about 84.9%, top-5 about 98.8%. | Secondary benchmark candidate after confirming model/code/data redistribution rights. Self-reported scores are not rough-finger mobile validation. |
| **MyScript iink** | Native Android/iOS recognition and math support; web integration uses remote services. | Commercial native alternative if small local models fail qualification. Native plugin work would be a separate integration; disable math solving and use recognition-only behaviour. |
| **Generic LLM/vision API** | Does not provide a demonstrated local continuous-ink path for this app. | Exclude from the latency-critical loop. |

Sources: [E01], [E04], [E06], [E10]. Neither a top-five score nor a “milliseconds” statement establishes that automatic insertion is safe. The first implementation must remain useful in candidates-only mode.

### 9.2 Concrete Detypify adapter

The inspected service source is version 0.3.0 at commit `983a887e553b42725d2555695b7bbfac982117dc`; its package pins ONNX Runtime Web 1.27.0. Its inference wrapper uses `document.createElement("canvas")`, so it cannot run unchanged in a Web Worker. It also exposes scores without calibrated confidence or partial-symbol decisions. [E02], [E03]

Implement a Lemma-owned adapter that:

1. Loads a verified pinned model and class metadata from Lemma-controlled assets.
2. Preserves the upstream baseline rasterization: whole-drawing aspect-preserving centering, 224×224 grayscale input, 9px padding/stroke width and the documented pixel alignment; tensor shape `[1,1,224,224]`.
3. Uses worker `OffscreenCanvas` when supported and qualified. Otherwise performs the bounded rasterization on the main thread and transfers the tensor buffer to a worker; measure that fallback’s UI cost.
4. Owns the ONNX session, its lifecycle and the latest-only request queue.
5. Maps model class metadata to the canonical registry and returns raw ranking information to the calibration/acceptance layer.
6. Adds the independent partial-symbol matcher and all session/caret checks described above.

Inspect the distributed ONNX graph before declaring its outputs logits or probabilities. The source wrapper returns raw output values; neither its scores nor a locally added softmax should be presented as calibrated accuracy. [E02]

The service’s default model URL is relative to its package, and `create()` has no model-URL options. Do not invent a configurable API that does not exist. Prefer an explicitly owned session and asset loader. The source repository does not establish the exact distributed model size/inventory, so inspect the actual pinned package, metadata, license notices and checksums before selecting a release artifact. [E02], [E03]

Preserve preprocessing before optimizing it. Test empty drawings, dots, tiny partial marks and added strokes that change the bounding box. Altering normalization or quantization creates a new model/preprocessing combination that needs requalification.

### 9.3 Runtime baseline

Use an explicit single-thread WASM worker baseline. WebGPU and multithreaded WASM may be optional measured accelerators; do not make them prerequisites. Verify the actual shipped runtime’s asset strategy: bundled WASM or same-origin versioned external WASM. Count runtime, model, metadata and worker bytes together, rather than describing only the model size. [E05]

Do not copy a demo’s external CDN configuration into the production input loop. If the runtime, model or worker is unavailable, keep typed input and Symbols usable and fall back to candidates-only or unavailable recognition as appropriate.

## 10. Assets, offline readiness and ownership

### 10.1 Explicit asset set

Define a manifest for one compatible set: model ID/version, runtime version, preprocessing version, catalogue mapping version, partial-template version, calibration version, sizes, hashes, license notices and base-path-safe URLs. Pin a running session to that set.

Resolve URLs under `import.meta.env.BASE_URL`; the current deployment base and Android start path are `/lemma/`. Do not assume origin-root `/models/...` works. [R09], [R10]

For web/PWA, deliberately cache the chosen model/runtime assets. Existing Workbox globs do not cover raw `.onnx` or `.wasm`; large bundled runtime files can also exceed the existing 4 MiB per-file ceiling. Use a dedicated versioned asset cache/readiness check or a reviewed, specific precache addition. Inspect the final build before choosing. Avoid broadly increasing cache limits without measuring the resulting app download. [R09]

For Android, bundle the same qualified assets into `dist-android/lemma/` through the existing build. Android mode deliberately omits service-worker/PWA registration. Prove initialization from the packaged WebView origin with networking disabled; a successful browser cache test is insufficient. [R09], [R10]

### 10.2 Loading and updates

Render typing and the deterministic catalogue first. Initialize recognition lazily when relevant; warm it while the tutor is idle or after the user opens Draw. Maintain explicit `unloaded`, `loading`, `ready` and `unavailable` states. `ready` requires runtime initialization and a compatible full asset set, not only a successful download.

Handle cache eviction, storage denial, asset mismatch and a first offline visit without blocking the composer. Once assets are ready, no inference request should require network access. Do not claim that the whole tutor transport works offline: sending remains governed by the existing tutor transport. Recognition adds no network dependency to editing.

Preserve the existing user-prompted PWA update behaviour during a proof. Do not replace models or reload the app mid-stroke. Clean up outdated asset versions without deleting the active session’s required files. Inspect actual deployment headers and WebView behaviour; the inspected source does not establish cross-origin isolation or a deployed CSP policy. [R15], [E05]

### 10.3 User data

Keep raw strokes, candidate lists, partial matches and inference state transient in the first release. Only accepted text enters the existing draft-save path. Shared model assets contain no learner content.

Use the existing owner/auth-generation/deletion boundaries. The current local-storage parser recognizes specific namespaces and suffixes, so a new favourites, preference or handwriting-personalization key will not automatically receive the existing cleanup guarantees. Any persistence added for these features must include explicit owner scoping, demo isolation and deletion tests. Session-only recents are the simplest baseline. [R08]

No handwriting upload or training-data collection is required. If personalization is added later, start with explicitly accepted/corrected examples, protect against learning from unconfirmed guesses and provide a reset. Any external training dataset requires its own usage-rights review; the presence of downloadable mathematical handwriting data is not permission to ship derived weights for every use.

## 11. Performance and recognition qualification

### 11.1 Proposed responsiveness targets

These are engineering targets for the implementation, **not measured performance of current Lemma or a selected model**. Measure end-to-end event-to-paint timing on supported physical devices with production builds.

| Operation | Proposed warm target | Measurement boundary |
|---|---|---|
| Typed word/alias suggestion | p95 ≤ 50ms | Text event to visible updated suggestion. |
| Visible drawing feedback | Next available frame | Pointer input to painted ink; independent of inference. |
| Recognition/partial-completion preview | p95 ≤ 100ms | Latest sampled ink snapshot to visible current candidates. |
| Explicit candidate insertion | Within about two 60Hz frames, ≤ 33ms target | Accepted tap to draft/caret paint. |
| Automatic insertion after final stroke | p95 ≤ 100ms when eligible | Genuine pointer-up to inserted-symbol paint, including latest-result validation. |
| Assistant-induced UI stalls | No repeatable > 50ms main-thread task in normal interaction | Include preprocessing, rendering and candidate layout. |

Record p50 and p95, cold initialization, model preparation/download separately, dropped/stale work, memory peak and total shipped asset bytes. A fast isolated `session.run()` is not proof of fast input. Test after several minutes of use as well as immediately after opening the app; avoid results that represent only an already-warm flagship device.

If latency misses the target, first reduce unnecessary inference, preprocessing/readback, repeated allocations and candidate rendering. Keep latest-only scheduling. Degrade to explicit candidate selection if needed; do not move inference onto the UI thread or block typed input to preserve a headline recognition rate.

### 11.2 Representative evaluation corpus

Build a permissioned evaluation set covering actual supported symbols, with finger and stylus input, different writers, slow/fast drawings, shaky input, alternate stroke orders, single-point marks, unknown scribbles and partial symbols. Include intentionally interrupted drawings and every extension family that can affect automatic acceptance.

Separate training/tuning, calibration and final test writers; avoid placing different versions of one person’s identical trace in both calibration and evaluation. Record the supported symbol subset and device/browser/runtime/model versions. If only a subset is qualified, expose automatic insertion only for that subset.

Report:

- Top-1 and top-5 recognition accuracy on completed glyphs, including difficult families separately.
- **False insertion rate among automatically accepted glyphs**, plus **automatic-insertion coverage** over eligible completed attempts.
- Premature insertion rate on partial drawings and missed plausible extensions.
- Recall of the intended symbol in **Could become**, with false completion clutter measured separately.
- Abstention on unsupported marks and the correction burden after erroneous choices.
- Time/gestures to enter a symbol through drawing versus the manual catalogue, including undo and retries.

Do not optimize only top-1 accuracy or report zero errors without reporting how rarely the system inserted automatically. Do not promise recognition from every poor drawing: some shapes are intrinsically ambiguous, and an explicit shortlist is the correct result.

### 11.3 Proposed automatic-insertion release gate

Enable automatic insertion separately from candidate recognition. A proposed product target is an incorrect automatic-insertion rate below **0.1%**, assessed with a one-sided 95% confidence bound on a representative held-out set, alongside reported coverage and partial-symbol performance. Treat this as a target to validate or deliberately revise, not an already-achieved number.

For scale, about 3,000 independent automatic acceptances with zero errors are needed for a binomial upper bound near 0.1%; clustered samples from a few writers do not establish general reliability. Report writer/device coverage and difficult-family outcomes as well as the aggregate. A small demonstration session is insufficient evidence.

Every required extension scenario must pass the deterministic/state regression suite. On broader partial-input evaluation, report premature insertions explicitly; strong completed-symbol accuracy does not excuse them. If evidence is inadequate, ship **candidates-only drawing** and manual input while continuing qualification. The user still gains fast recognition and completion selection without unreliable automatic insertion.

### 11.4 Device matrix

At minimum, qualify:

- Chrome on a representative midrange Android phone, including the software keyboard and IME.
- The installed Capacitor Android app, including offline bundled inference and rotation.
- Safari and installed PWA mode on a real iPhone, including keyboard/viewport changes.
- A constrained small-screen layout and a desktop browser for regression coverage.

The repository names POCO M8 Power / Android 16 as an existing physical verification target, but the inspected note does not record a successful physical run. Reuse that target if available and add iPhone browser coverage; do not report source-inspection or viewport simulation as physical validation. Native iOS is not an existing inspected Lemma build target. [R13], [R16]

## 12. Tests and acceptance cases

### 12.1 Extend existing test surfaces

| Existing tests | Required additions or intentional policy changes |
|---|---|
| `tests/unit/tutor/tutor-composer.test.tsx` | Candidate insertion, selected ranges, native/custom modes, IME, limit rejection, one-step undo and stale-result rejection. Review the old `by → definition` expectation under the new policy. |
| `tests/unit/tutor/local-storage.test.ts` | Owner change/deletion for any newly persisted assist preferences; retain current fences. |
| `tests/unit/pad/pad-edit.test.ts` | Symbol serialization and selection cases if shared helpers are extended. |
| `tests/unit/pad/pad-ink.test.tsx` | Regression only if shared gesture primitives change; new recognition state belongs in dedicated tests. |
| `tests/e2e/v7-tutor-chat.spec.ts` | Draw/Symbols/native accessory flow, exact inserted text, candidates and small-phone layout. |
| `tests/e2e/v7-tutor-live.spec.ts` | Accepted edits remain a draft; only explicit Send enters the existing turn path. |

Add focused unit suites for `completionPolicy`, `inkSession`, `recognitionPolicy`, `partialSymbolMatcher`, symbol mapping and worker-message validation. Use deterministic worker doubles for race/UI tests; real-model accuracy and phone performance belong in a separate qualification harness. Existing tests already exercise relevant selection, IME, layout and correction behaviour and should be extended rather than replaced. [R17], [R18]

### 12.2 Required behavioural matrix

| Case | Acceptance result |
|---|---|
| Clear finished supported symbol; normally ended stroke | Inserts once when qualified automatic mode is enabled. |
| Same high score while pointer is still down | Preview only. |
| Low first-candidate confidence | No insertion on release, pause, timeout or resumed typing. |
| Close top candidates | Explicit choice; up to five distinct recognized glyphs. |
| `<` strongly recognized; `≤` outside recognized top five but a plausible extension | Hold `<`; show `≤` as a possible completion. |
| User taps `≤` after drawing only `<` | Insert `≤` once, with one undo transaction. |
| User instead adds the lower stroke | Continue the same session without a premature `<` insertion. |
| User taps the recognized `<` | Insert `<` without demanding another stroke or timeout. |
| Partial ink is not a complete glyph | Compatible completion suggestions may appear; no forced full-symbol interpretation. |
| Unsupported/dot/empty/over-budget input | Visible input preserved where relevant; abstain or handle a qualified dot explicitly. |
| Older inference finishes after a newer one | Discard the old result. |
| Pointer moves faster than inference | Bounded-age previews may advance within the same append-only epoch, but remain non-actionable until the exact current snapshot is recognized. |
| Old inference resolves after Clear or Undo stroke | No insertion or restoration of erased candidates. Fresh Undo previews cannot auto-insert without a new drawing gesture. |
| Result becomes confident while a candidate is pressed or Symbols is open | Explicit-choice lock prevents insertion; the selected candidate wins. Closing/cancelling does not release a pending auto-commit. |
| Second stroke starts while inference is running | Previous completed-stroke result cannot insert. |
| Caret/draft changes, undo, send or external restore while recognition runs | No insertion into the old or new draft from the stale result. |
| IME composition begins during inference | No automatic insertion or stale deferred acceptance at composition end. |
| Pointer cancel/lost capture, multitouch interruption or backgrounding | No cancellation-driven insertion. |
| Manual catalogue used with unresolved ink | Insert only the manually selected symbol; pending auto result invalidated. |
| Selection replaced in prose versus explicit math | Correct Unicode/TeX and delimiter/control-word handling. |
| Encoded insertion would exceed 2,000 code units | Reject without truncation or clearing ink/draft. |
| Worker/model/cache failure | Typing and manual Symbols remain functional. |
| Native keyboard selected | Accessory remains accessible; no lost cursor, double input or hidden send control. |
| Type → draw one symbol → type | After successful insertion, the next character requires no extra return-mode action in each qualified input mode. Keep drawing is an explicit alternative. |
| Recognition or automatic insertion turned off | Selected mode respected immediately; in-flight results cannot bypass it. |
| `let x`, `by`, `if`, `∀`, `∃`, or `therefore` | No inferred domain, strategy, connective change, witness or conclusion. |
| Full supplied shorthand declaration | Offer its meaning-preserving notation as one explicit choice; preserve suffix text. |
| An alias is also a prefix, such as “less than” | Do not prematurely convert it before the learner can finish “or equal to.” |
| Owner/checkpoint changes or confirmed deletion | Private transient state and stale callbacks cannot affect the new scope. |
| One accepted glyph then Undo | Restore prior full text and selection, including any replaced range. |

### 12.3 Build and delivery verification

For the eventual implementation, run the repository’s existing required typecheck/unit/build/E2E workflow and the targeted regression suites. Verify production asset URLs under `/lemma/`, service-worker cold/offline readiness and the Android build’s worker/WASM initialization. Test both feature-flag states and both recognition modes.

Do not raise protected test/performance budgets or change CI rules to accommodate the model. If a required gate cannot run, record it as unrun. This document was produced from source inspection and research: **no new implementation, repository tests or device benchmarks were run as part of preparing it**.

## 13. Proposed implementation file map

The following paths describe future work; none were created in the repository for this plan.

### Existing files to modify deliberately

| Path | Change |
|---|---|
| `src/features/tutor/TutorComposer.tsx` | Extract accessory, bind assist lifecycle, add checked atomic insertion adapter and revisions. |
| `src/features/tutor/notation.ts` | Enforce allowed transformation classes; remove inference-bearing default suggestions; consume symbol registry. |
| `src/features/tutor/TutorChat.tsx` | Pass stable scope identity and policy-limited context without changing delivery callbacks. |
| `src/features/tutor/TutorPage.tsx` | Thread owner/checkpoint/session identity only if the current parent props do not already expose it. |
| `src/features/tutor/tutor.css` | Drawing/accessory/picker states, stable candidate targets and native keyboard layout. |
| `src/features/pad/padEdit.ts` | Only shared serialization changes required by audited symbols; preserve Pad behaviour. |
| `src/flags.ts` | Separately gate new input assistance and qualified auto-insertion. |
| `vite.config.ts` | Explicit production asset handling and scoped web caching. |
| `package.json` and its lockfile | Add only approved pinned runtime/model-adapter dependencies after asset/license selection. |

### New files proposed under `src/features/tutor/input/`

| File | Responsibility |
|---|---|
| `types.ts` | Session, revision, candidate and runtime contracts. |
| `symbolCatalog.ts` | Stable symbol IDs, Unicode/TeX, names, aliases and categories. |
| `completionPolicy.ts` | Allowed text transformations and semantic source checks. |
| `completionEngine.ts` | Bounded local proposal generation and ranking. |
| `inkSession.ts` | Pure pointer/session state machine and invalidation. |
| `inkGeometry.ts` | Bounded points, aspect-preserving geometry and model preprocessing adapter. |
| `partialSymbolMatcher.ts` | Extension graph/templates, partial matching and completion candidates. |
| `recognitionPolicy.ts` | Calibration, identity/separation gates, completion gate and abstention. |
| `inkRecognizer.worker.ts` | Owned inference session, latest-only queue and bounded worker results. |
| `inkRecognizer.ts` | Main-thread protocol, lifecycle, readiness and error handling. |
| `modelAssets.ts` | Versioned manifest, base-path-safe loading and asset readiness. |
| `useTutorInputAssist.ts` | React binding of current scope/editor/session to the pure components. |
| `TutorInputAccessory.tsx` | Text/ink candidate strips, Draw/Symbols controls and status. |
| `TutorInkPad.tsx` | Visible drawing surface and stroke controls. |
| `TutorSymbolPicker.tsx` | Deterministic search/categories/recent symbols. |

Deployable assets may live under `public/models/tutor-symbols/<asset-set-version>/`, with a manifest and notices. Choose the final packaging after inspecting distributed model/runtime files; do not assume all assets should be eagerly bundled or precached.

Keep model selection isolated behind the adapter. A later engine replacement should not change the UI’s uncertainty semantics, text policy, insertion transaction or tutor transport.

## 14. Implementation sequence and rollout

Create a separately scoped future work item through the repository’s normal process. Do not claim a queue number in this document, silently reopen N201 or mark N200 complete. The existing repository rules require explicit dependency authorization, new feature flags initially off, normal qualification before release, and a new `docs/current/<assigned-item>.md` record. The present user request authorizes this plan only. [R04], [R19], [R20]

| Stage | Deliverable | Gate before advancing |
|---|---|---|
| **A. Policy and deterministic input** | Shared catalogue, tightened existing autocomplete, persistent accessory, manual picker, checked insertion adapter | No-proof-step tests; existing keyboard/caret/IME/undo behaviour preserved. |
| **B. Drawing interaction** | Ink session, pointer lifecycle, candidate UI and partial-completion selection using deterministic fixtures | Every ambiguity, extension, cancellation and stale-result case passes. |
| **C. Real local recognition** | Pinned model adapter, worker and offline asset handling; candidates-only mode | License/inventory/preprocessing verified; web and Android initialization; measured phone responsiveness. |
| **D. Qualified automatic insertion** | Calibrated policy and audited extension families; separate auto-insertion switch | Held-out false-insertion/partial-input evidence, physical-device UX and all required regression gates. |
| **E. Optional improvements** | Personalization or constrained small-model wording/ranking if a measured need remains | Demonstrated benefit without new reasoning leakage, privacy/storage gaps or latency regression. |

Do not delay useful deterministic typing and catalogue improvements while waiting for an automatic-recognition gate. Conversely, do not treat a successful candidates-only demo as authorization to auto-insert every model’s first choice.

Proposed flags are `tutorInputAssist` and `tutorInkAutoInsert`, both initially false for new development. Final names should follow the assigned item. Production uses reviewed defaults; the existing source ignores ordinary query overrides in production. User preferences to disable recognition/automatic insertion remain separate from release flags. [R20]

The correction of existing reasoning-bearing suggestions should become the shared default completion policy when delivered, including any legacy/fallback composer path. Rolling back the ML feature must not restore proof-step suggestions that violate the requested product behaviour.

## 15. Completion criteria and remaining evidence

The feature is complete when it improves proof-entry speed on supported phones while preserving learner control:

- The existing tutor composer remains the sole answer entry and draft history.
- Text suggestions finish supplied intent without contributing a new argument.
- Drawing gives immediate visible feedback and local candidate updates.
- Recognized symbols and possible completed symbols are distinguished.
- A possible completion can be tapped to insert the full symbol without drawing its remaining strokes.
- Automatic insertion obeys both gates after a genuine final pointer-up.
- Low-confidence, close-candidate and extendable ink never resolves through a timeout or accidental keyboard transition.
- The complete supported symbol catalogue remains usable without recognition.
- Mobile native-keyboard/custom-keyboard transitions preserve text, selection, IME and undo.
- Stale inference cannot write into a different answer or owner’s session.
- Offline model readiness is proved separately for web/PWA and Android packaging.
- Actual device latency and recognition qualification are reported accurately, with limitations and coverage.
- Existing explicit Send, tutor authorization, ownership and assessment boundaries remain intact.

The material unresolved inputs are the exact distributable model/license/inventory, rough-finger evaluation corpus, measured phone/runtime performance, calibrated acceptance thresholds and audited partial-symbol coverage. These are implementation qualification tasks, not reasons to block the deterministic baseline. Until they are satisfied, keep automatic insertion disabled and retain explicit candidate choice.

## 16. Sources and inspection notes

Repository links below are pinned to the inspected Lemma commit. External projects were reviewed as implementation candidates on the preparation date; their claims are not Lemma benchmark results. The Detypify service links are also pinned to the inspected source commit. No external source establishes that this complete interaction is already implemented or validated in Lemma.

### Lemma repository

- [R01 — N201 current tutor behaviour][R01]
- [R02 — TutorComposer][R02]
- [R03 — Current notation and suggestion engine][R03]
- [R04 — N200 Pad recognition task][R04]
- [R05 — Tutor styling][R05]
- [R06 — Pad editing, symbol serialization and history][R06]
- [R07 — Existing local ink representation][R07]
- [R08 — Tutor local-storage ownership and cleanup][R08]
- [R09 — Vite/PWA/Android build configuration][R09]
- [R10 — Capacitor configuration][R10]
- [R11 — Current routes][R11]
- [R12 — Math rendering][R12]
- [R13 — Native platform and touch-target conventions][R13]
- [R14 — Tutor turn model][R14]
- [R15 — PWA update lifecycle][R15]
- [R16 — N192 device-validation notes][R16]
- [R17 — Existing composer unit tests][R17]
- [R18 — Existing tutor browser tests][R18]
- [R19 — Repository implementation rules][R19]
- [R20 — Feature flags][R20]
- [R21 — Package dependencies and commands][R21]
- [R22 — Tutor chat integration][R22]
- [R23 — Existing local ink interaction][R23]
- [R24 — Authentication generation and owner boundaries][R24]
- [R25 — Local Pad preview renderer][R25]

### Primary external sources

- [E01 — Detypify author repository][E01]
- [E02 — Pinned Detypify inference and preprocessing source][E02]
- [E03 — Pinned Detypify service package manifest][E03]
- [E04 — Symbolizer author repository and reported evaluation][E04]
- [E05 — ONNX Runtime Web deployment documentation][E05]
- [E06 — MyScript platform integration documentation][E06]
- [E07 — Guo et al., On Calibration of Modern Neural Networks][E07]
- [E08 — Google’s Gemma 3 270M introduction][E08]
- [E09 — Chrome Prompt API device requirements][E09]
- [E10 — MyScript math features and solver behaviour][E10]

[R01]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/docs/current/N201.md
[R02]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/src/features/tutor/TutorComposer.tsx
[R03]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/src/features/tutor/notation.ts
[R04]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/docs/implementation/2026-11-20/tasks/N200.md
[R05]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/src/features/tutor/tutor.css
[R06]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/src/features/pad/padEdit.ts
[R07]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/src/features/pad/padInk.ts
[R08]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/src/data/tutor/local-storage.ts
[R09]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/vite.config.ts
[R10]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/capacitor.config.json
[R11]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/src/app/App.tsx
[R12]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/src/ui/MathText.tsx
[R13]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/src/platform/native.ts
[R14]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/src/data/tutor/turn-model.ts
[R15]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/src/app/PwaStatus.tsx
[R16]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/docs/current/N192.md
[R17]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/tests/unit/tutor/tutor-composer.test.tsx
[R18]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/tests/e2e/v7-tutor-chat.spec.ts
[R19]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/AGENTS.md
[R20]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/src/flags.ts
[R21]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/package.json
[R22]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/src/features/tutor/TutorChat.tsx
[R23]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/src/features/pad/LocalPadInk.tsx
[R24]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/src/data/authBoundary.ts
[R25]: https://github.com/Mymayankyadav/lemma/blob/24c8a225390e5fade05d95208d91fe2b087fcb38/src/features/pad/LocalPadPreview.tsx
[E01]: https://github.com/QuarticCat/detypify
[E02]: https://github.com/QuarticCat/detypify/blob/983a887e553b42725d2555695b7bbfac982117dc/frontend/service/src/index.ts
[E03]: https://github.com/QuarticCat/detypify/blob/983a887e553b42725d2555695b7bbfac982117dc/frontend/service/package.json
[E04]: https://github.com/zimya/symbolizer
[E05]: https://onnxruntime.ai/docs/tutorials/web/deploy.html
[E06]: https://developer.myscript.com/docs/sdk/4.5/integration/platforms/
[E07]: https://proceedings.mlr.press/v70/guo17a.html
[E08]: https://developers.googleblog.com/en/introducing-gemma-3-270m/
[E09]: https://developer.chrome.com/docs/ai/prompt-api
[E10]: https://developer.myscript.com/docs/sdk/4.5/java/interactivity/math-features/
