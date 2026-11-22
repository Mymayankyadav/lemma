# NEXT — consolidated remaining Lemma work (Owner decision 2026-11-20)

**Owner release decision (supersedes earlier opt-in/default-off shipping language):** the **new scheduler and learning algorithm ship New by default** with an accessible persistent **Settings > Planning: New / Legacy** selector. **Lemma Pad ships as a full page with its custom math keyboard, enabled by default.** Build flags may remain off until integrated acceptance; N198 must turn them on for the coordinated public release. Prospective randomized practice remains independently safety-qualified, with native fallback when ineligible. Never skip migration, owner isolation, Android or release validation to turn on a flag.

This is the **working queue**, ranked for future chats. The 44-entry previous queue is preserved unmodified in [NEXT-before-reconciliation.md](docs/implementation/2026-11-20/NEXT-before-reconciliation.md); individual dispositions and uncertainties are in [LEGACY-DISPOSITION.md](docs/implementation/2026-11-20/LEGACY-DISPOSITION.md). Do not treat archival as proof of completion. The nine task packets live at [implementation handoff](docs/implementation/2026-11-20/README.md).

**Picking:** obey `AGENTS.md` incident/review/own-PR order first. An **existing open PR is its claim**; continue or take it over only under the lease-expired rule. Choose the highest **open** item whose `Needs` are done. An unverified provider/asset entry condition keeps a conditional item **blocked**. If an existing PR is already claimed, independent fixes on that same PR can proceed before its final integration dependency, but may not be called complete. Agents must not open replacement PRs for N191/N192/N193/N195/N196.

## N221 Finish the Owner's phone review of N220: Gboard keyboard, Atlas subjects, Calendar toolbar, Progress total and session header

Owner task: "N219 completed, before this actually complete the remaining ui bugs reported then move to do this."
Owner task (22 Nov, take-over): "Take over n221 I don't what to do with keyboard it's getting more and more further from the Gboard keyboard. Now this you main task to get the layout correct. The space below is bigger but the keys are much longer not square. Use spec available on internet to match it perfectly. I am also attaching image again. I am used to this layout therefore it will be important. And also add simple auto complete using simple code and ngrams decoder and spatial model using n219. Fix everything in one run."
Stage: Harden · Status: done · Needs: — · Assigned: chat-683106#krtq
Done = The answer keyboard has Gboard's portrait geometry, measured on the Owner's Gboard screenshot and AOSP LatinIME's 205.6 dp keyboard height: in the Android app, 51.4 px rows with 41 px caps taller than wide, ten key pitches across, Gboard's bottom row widths, 53.8 px from the strip's top to the first cap and Gboard's 48 px band under the keys with Hide keyboard where Gboard's ⌄ is; browsers keep the shape with 44 px rows. The strip spreads its icons when idle and frames three equal one-line word slots with one icon at each end while typing. Word suggestions come from an n-gram (N219's licensed unigrams, mathlib bigrams, the tutor's question as a cache) and spatial (touch) decoder inside the writing aid's existing guards, offered only as taps. Atlas shows a button for every subject with the one in view marked; Calendar's view picker is a plain label and the status row's chip and button share one height; Progress shows its total at display size with Your week beside it and one meta line; the session header is the app's full-width detail header.
Tests: tests/e2e/v7-tutor-gboard-layout.spec.ts (Android-app and browser geometry, strip, decoded taps); tests/unit/tutor/ngram-spatial-decoder.test.ts; the Atlas rail test expects every subject; existing keyboard, writing-aid, Tutor layout, Calendar and Progress tests.
Scope: src/features/{tutor,atlas,calendar,insights}/**; public/models/writing-decoder/unigram-v1/** (N219's asset, byte-identical); tests/e2e/{v7-atlas-layers,v7-tutor-gboard-layout}.spec.ts; tests/unit/tutor/ngram-spatial-decoder.test.ts; docs/current/N221.md.

## N220 Make the v7 interface consistent across sheets, Calendar, Atlas, Path, Progress, Settings and the answer keyboard

Owner task: "Please fix all the issues in just one pr."
Stage: Harden · Status: done · Needs: — · Assigned: chat-547160#k4sm
Done = The Owner's November screenshots are fixed in one PR. Headings use one type family and scale; sheets have a spaced eyebrow and title, equal footer buttons and clear the gesture bar, and safe-area insets come from the Android app as well as env(). Calendar has the shared hub header (title, Search, Inbox, ⋯), its view and period arrows on one toolbar row, a dragged block that stays under the finger while the grid auto-scrolls, and time blocks with typed Start and End times and length presets that do not open the keyboard on the title. Atlas shows a button for every subject, names only a few concepts at a distance and keeps its concept peek above the gesture bar. Path shows its emblem and a one-line goal that opens in place, with dates as chips. Practice's time row is one aligned line. Progress puts Your week with its figure, at a reading size, and charts answer a tap with a tip instead of a Table switch. Easy is blue. Settings explanations sit behind (i) tips, and the hosted advanced forms use the kit's type and controls. The answer keyboard follows Gboard: a wide space bar, a key preview that lingers, the system keyboard-tap haptic and tap correction, with the maths symbols in the suggestion strip, compact symbol candidates and a chat-style composer.
Tests: updated e2e for the Calendar header, block sheet, charts, Atlas rail, Path goal and Inbox-only reminders; new unit tests for tap correction and the typed time field; the v7 kit check and lint.
Scope: src/ui/v7/**; src/app/v7/**; src/features/{atlas,calendar,home,insights,pad,practice,project,review-run,ritual,focus,settings,tutor}/**; src/platform/{bridge,haptics}.ts; android/app/src/main/java/io/github/mymayankyadav/lemma/LemmaNativePlugin.java; tests/**; docs/current/N220.md.

## N201 Open the checkpoint tutor chat from the study path

Owner task: "I want exactly this page as chatbot in lemma app when I click on continue with tutor. You can us le already existing contracts to make this page work as it was intended usage. Remove ugly pad and shit"
Stage: Harden · Status: done · Needs: — · Assigned: chat-174602#75tl
Done = Both Continue with tutor entry points open the supplied chat design for the selected checkpoint inside Lemma's shared app shell. Navigation hides on phone and desktop to enlarge the conversation; shared Back, Search and session controls remain available. The Gboard-style keyboard provides local autocomplete and respects the app's haptics setting and theme tokens. Sending an answer grants the connected Lemma MCP tutor that turn. The next tutor question appears in the same conversation. Leaving and returning preserves the conversation and draft. Existing saved Pad notes remain accessible through Settings.
Tests: phone and desktop chat space, full question reading, navigation recovery, keyboard layout and autocomplete, haptics setting, persisted drafts, signed-in grant and reply recovery, ordinary MCP tool discovery and PostgreSQL owner/lease/reply isolation.
Scope: app routing and v7 navigation, tutor UI, browser adapters, checkpoint and Settings entry points, existing Lemma MCP tutor tools, an additive grant lookup migration and their regression tests.

## N199 Optional direct native tutor transport when provider eligibility is verified

Owner task: "Ok add on new schedular and the algorithm is shipped with default on and optional switch and in settings and the lemma pad should be shipped as page with its custom keyboard. Then publish"
Stage: Build · Status: blocked · Needs: N193 · Assigned: —
Existing PR: —
Done = Only if a real provider, client, device and account offer a supported authorized transport: build and test direct native tutoring with protected credentials, explicit per-turn grants, expiry/revocation, the same one-final-answer contract and manual fallback. No promised direct plan access without evidence.
Tests: `provider-specific authorized test account/device`; `credential scoping, rotation, lease expiry, owner separation and recovery`; `manual fallback under network/host absence`.
Scope: src/data/tutor/**; src/platform/**; supabase/functions/mcp/tutor-profile.ts; docs/current/N199.md.
Not: Secrets in browser/PR; Screen scraping private chats or bypassing host controls; Blocking N198 while eligibility is absent.
Agent packet: [N199.md](docs/implementation/2026-11-20/tasks/N199.md). Do not auto-select: External provider/entitlement/device eligibility NOT YET VERIFIED; stays blocked and outside core release.

## N200 Optional bounded on-device equation recognition after asset and corpus qualification

Owner task: "Ok add on new schedular and the algorithm is shipped with default on and optional switch and in settings and the lemma pad should be shipped as page with its custom keyboard. Then publish"
Stage: Build · Status: blocked · Needs: N192 · Assigned: —
Existing PR: —
Done = If licensed model/assets and a representative test corpus qualify: add bounded on-device image-to-equation recognition to the Pad page, preview editable output, let the learner insert explicitly and preserve all offline/keyboard/undo behavior. Reject the feature when it cannot pass quality and performance gates.
Tests: `representative formula and handwriting corpus`; `slow/offline device cancellation and memory limits`; `malformed image and equation limits, user edit/undo`; `comparison with manual custom keyboard entry`.
Scope: src/features/pad/**; tests/unit/pad/**; tests/e2e/pad-local.spec.ts; docs/current/N200.md.
Not: Replacing the custom math keyboard; Shipping an unlicensed model; Requiring the optional OCR for N198.
Agent packet: [N200.md](docs/implementation/2026-11-20/tasks/N200.md). Do not auto-select: Needs verified model rights, assets, device and representative corpus; remains blocked and optional.
