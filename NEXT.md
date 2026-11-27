# NEXT — consolidated remaining Lemma work (Owner decision 2026-11-20)

**Owner release decision (supersedes earlier opt-in/default-off shipping language):** the **new scheduler and learning algorithm ship New by default** with an accessible persistent **Settings > Planning: New / Legacy** selector. **Lemma Pad ships as a full page with its custom math keyboard, enabled by default.** Build flags may remain off until integrated acceptance; N198 must turn them on for the coordinated public release. Prospective randomized practice remains independently safety-qualified, with native fallback when ineligible. Never skip migration, owner isolation, Android or release validation to turn on a flag.

This is the **working queue**, ranked for future chats. The 44-entry previous queue is preserved unmodified in [NEXT-before-reconciliation.md](docs/implementation/2026-11-20/NEXT-before-reconciliation.md); individual dispositions and uncertainties are in [LEGACY-DISPOSITION.md](docs/implementation/2026-11-20/LEGACY-DISPOSITION.md). Do not treat archival as proof of completion. The nine task packets live at [implementation handoff](docs/implementation/2026-11-20/README.md).

**Picking:** obey `AGENTS.md` incident/review/own-PR order first. An **existing open PR is its claim**; continue or take it over only under the lease-expired rule. Choose the highest **open** item whose `Needs` are done. An unverified provider/asset entry condition keeps a conditional item **blocked**. If an existing PR is already claimed, independent fixes on that same PR can proceed before its final integration dependency, but may not be called complete. Agents must not open replacement PRs for N191/N192/N193/N195/N196.

## N257 Stop replaying stale symbol reads from the equation paper

Stage: Harden · Status: done · Needs: — · Assigned: chat-816327#gm8s
Done = The opt-in single-symbol reader gets at most one completed equation-paper revision per pen lift, drops obsolete work, skips paper beyond its existing symbol limit and resumes after undo. Opening equation mode checks once for installed full-equation weights without opening all cached response bodies just to test their presence.
Tests: Real-model equation-mode inputs, worker dispatch counts over 13 strokes and undo, unchanged geometry and stale snapshot invalidation, explicit insertion, one-time download, checksum rejection and Pencil-only gesture regressions.
Scope: TutorComposer readSymbol, tutor input ink session and assist, TutorEquationPanel and equation recognizer cache probes, associated tests and docs/current/N257.md.
Not: Model, ranking, thresholds, palm or Pencil policy, production telemetry, deployment headers, thread counts, typing or theme settings.

## N256 Skip expired neural typing requests

Stage: Harden · Status: in progress · Needs: — · Assigned: chat-473926#m4vq
Done = A count result reaching the neural client late does not dispatch the draft; a queued edit expiring before its graph starts does not consume a new prefill. A live edit still scores and existing cached-prefix/epoch rules and expiry accounting hold.
Tests: tests/unit/tutor/neural-worker-cache.test.ts and existing tutor writing-assistance entry-point regressions.
Scope: src/features/tutor/writingAid/decoder/{neuralClient,neural.worker}.ts, tests/unit/tutor/neural-worker-cache.test.ts, docs/current/N256.md and this item.
Not: Changing model choice or consent, inference deadline, ranking thresholds, training, N253, formula recognition, or qualifying hardware latency.

## N255 Make Appearance paper and sky choices control the screen background

Stage: Harden · Status: done · Needs: — · Assigned: chat-780461#y85j
Done = Settings > Appearance visibly changes the background for the active theme. Plain paper and clear sky have no pattern; the chosen textures persist across reloads and theme switches. Accessibility overrides still hide decoration.
Scope: v7 background styles, Appearance regression tests and docs/current/N255.md.
Not: Changes to tutor input, Atlas graph data, drawing canvases or the palette.

## N258 Reduce dictionary cold start for tutor typing

Stage: Harden · Status: in progress · Needs: — · Assigned: chat-473926#m4vq
Done = Validate the model without allocating a fresh buffer view for each history or rescanning every edge across several independent passes. Retain strict structural and probability validation, exact ranking and model identity; measure the first usable count reply through the tutor.
Tests: tests/unit/tutor/ngram-load-validation.test.ts, existing expansion, spatial and exhaustive ordering tests, and the ABBA cold-editor probe.
Scope: src/features/tutor/writingAid/decoder/kn.ts, scripts/typeahead/measure-cold-keyboard.mjs, the regression test, docs/current/N258.md, its diagnostic receipt and this item.
Not: Changing weights, model selection, thresholds, ranking, predictions, persistent data or the N253 right-context logic. No physical-device speed claim.

## N259 Package the same-origin pthread entry for isolated equation readers

Stage: Harden · Status: done · Needs: — · Assigned: chat-816327#gm8s
Done = When the existing equation reader selects more than one WASM thread, it can initialize its nested runtime workers from the matching packaged module instead of hanging. The offline shell includes that helper.
Tests: Actual packaged runtime on an isolated loopback origin under same-origin worker CSP; real production-built equation reads, including an offline page reload with installed weights.
Scope: Full-equation recognizer worker, a targeted PWA precache glob, scoped E2E regression and docs/current/N259.md.
Not: Changing deployment isolation/CSP headers or thread counts, model weights, download consent, screen layout, digit shapes or recognition ranking.

## N254 Warm Lemma palette, tutor keyboard, motion and surface ownership

Stage: Harden · Status: in progress · Needs: N252 · Assigned: chat-568402#d4nw
Done = The warm day and night palette covers the app, subject chips and brand assets, with small adjustments for color separation. The UI token HTML shows both themes. The tutor keyboard echoes the typed word, preloads local prediction in a disposable worker, and docks to the iPad window with native key dimensions. A separate pin keeps Lemma open, the keyboard switch selects the device keyboard, and tutor-authored questions and choices render mathematical notation. The motion and surface plan covers shared layer ownership, guarded drafts, route and study transitions, and the recorded audit.
Tests: Palette, subject emblems, tutor suggestions, iPad key geometry, keyboard switching, questionnaires, layer order and focus, date navigation, Capture handoffs, Calendar, Review, Atlas, Focus and recorded motion in both themes.
Scope: Shared theme, brand assets, subject components, tutor interface, local writing decoder, v7 app and study surfaces, local audit tooling, related regression tests and docs/current.
Not: Publishing the app, changing the study algorithm, training models or changing server records.

## N252 iPad tutor keyboard and layout in portrait and landscape

Owner task: "This is how it looks on my ipad. And this how the native keyboard looks on iPad. I understand that keyboard layout should depend on the device. Keep the current layout for android devices."
Owner follow-up: "Also for iPad you might have to add proper padding in the header. You can see earlier screenshot of Claude app to see the proper padding"
Owner follow-up: "Ok create comprehensive ui audit for my ipad use the sentout screenshots for size and ratios. Add the detailed changes list to the current pr before coding. And keep all of this in the current pr. And go ahead and open a new pr for all changes for ipad."
Owner follow-up: "Ok don't apply the pallette just fix layout for ipad"
Owner follow-up: "Almost all the screens have this empty space therefore waste of space, fix the layout in landscape mode too."
Owner follow-up: "This looks very oddly placed. Also look at all the screens for similar waste of space. I have seen that you are not thorough for layout like you missed many screens like analytucs and settings, look at the import paths like adding tasks etc bw thorough."
Stage: Build · Status: done · Needs: — · Assigned: chat-697888#xr09
Done = On iPad windows at least 600 px wide, the tutor offers iPadOS-style key rows, long-press secondary characters, Tab, Caps Lock, Return and Hide. Decoder taps use the current layout's geometry. Android, iPhone, desktop and narrower windows use the Gboard layout. On iPad, v7 headers clear the status bar, pages use the available width in both orientations and charts and action bars fill their columns. Capture aligns with the wide rail, Path tabs group at the left, and the Paths grid, Calendar, Welcome, Close the day and Review use the layouts in the audit. The audit covers all Settings pages, Progress and the flows for creating study items.
Tests: tests/unit/tutor/ipad-keyboard.test.tsx, tests/unit/v7/n130-decisions.test.tsx, tests/e2e/v7-tutor-ipad-keyboard.spec.ts and tests/e2e/v7-ipad-layout.spec.ts.
Scope: src/platform/ipad.ts, src/main.tsx, src/app/v7/{V7Shell.tsx,shell.css,ipad.css}, src/features/tutor/{keyboardLayout.ts,TutorKeyboard.tsx,TutorComposer.tsx,PaperInputTools.tsx,keyboard.css}, src/ui/v7/Chart.tsx, src/features/card/v7/RecallChart.tsx, src/features/cards/v7/cards.css, the tests above, docs/v7/ipad-audit-2026-11-26.md, docs/current/N252.md and this item.
Not: palette changes, Gboard geometry, server or migration changes, or new dependencies.

## N251 Exam mode on by default in the app, with its screens polished

Owner task: "Turn on exam mode in the app"
Owner follow-up: "Fix the screens and tests and then create pr"
Stage: Build · Status: done · Needs: — · Assigned: chat-697888#xr09
Done = `examMode` defaults on (Owner), so production shows the Path's exam setup and ledger, Today's exam card, the exam tutor, return to study and card ideas. The exam tutor's header matches the checkpoint tutor's title; an empty exam conversation opens with a start card; the exam controls share one text size; the course tutor's exam banner, the setup and row sheets and the Ideas tab use the app's buttons, labels, checkboxes, disclosures and empty-state text; coverage conflicts read like the ledger; Today and Practice keep one primary button per view; the return card opens the Plan tab, so the Path's tabs follow its header. Only the v7 shell reads Home's exam block (exam_home_summary); the demo adapter builds it from the demo exam store whatever the page's mode. Recorded in docs/current/N251.md.
Tests: tests/unit/flags.test.ts; tests/unit/data/st5-live-reads.test.ts; tests/unit/exam/demo-home.test.ts; the full unit suite; the full browser suite, with v7 live mocks that answer exam_home_summary and the new Exam label and tab.
Scope: src/flags.ts; src/data/exam/{queries,home-demo}.ts; src/features/exam/{TutorExamTools,ExamSetupSheet,BlueprintRowSheet,IdeaItem,IdeasList,LedgerTab,TopicReview}.tsx and exam.css; src/data/{live,demo}/adapter.ts; src/features/exam/{ReturnCard,CountdownCard}.tsx; src/features/project/v7/V7Path.tsx; src/features/tutor/{TutorChat,TutorLayout}.tsx; src/features/practice/v7/PracticeV7.tsx; the tests above and the live browser mocks; docs/current/N251.md; NEXT.md.
Not: server, MCP or migration changes; the numeric exam policy (it stays in shadow); new dependencies.

## N250 Faster return navigation, tutor typing and a custom PWA model download

Stage: Harden · Status: done · Needs: — · Assigned: chat-631904#ouou

Done = Returning to a study screen preserves usable data, actions give immediate feedback, navigation respects reduced motion, the text keyboard opens with prose suggestions and Settings can install the optional suggestion model from a custom download.
Scope: Study navigation, focus reads, motion, Tutor, keyboard, PWA model installation and their regression tests.

## N249 Draw one symbol over the tutor's keys (N248 moved from the Pad page)

Owner task: "Ok now you remove the lemma pad shit whatever you made and shift the logic to the keyboard there. Don't change anything in the layout it should be same as before"
Owner follow-up: "Keep the flag on by default."
Stage: Build · Status: done · Needs: — · Assigned: chat-517093#w3kd
Done = The Pad page is back as before N248, and padLatentInk is gone. Behind tutorKeyInk (on by default, Owner), a stroke over the tutor's keys draws one symbol while a tap stays a key. The readings take the strip's three slots and N248's policy decides when one goes in. Delete and the Space slide keep their gestures. With nothing drawn, the keyboard's markup is unchanged. Recorded in docs/current/N249.md.
Tests: tests/unit/tutor/key-ink.test.tsx; tests/unit/tutor/latent-ink-{model,policy}.test.ts; tests/unit/flags.test.ts; the tutor keyboard, strip and writing-aid e2e specs.
Scope: src/features/pad/{PadMathKeyboard,LocalPadEditor}.tsx and pad-math-keyboard.css (restored); src/features/pad/latentInk/** (removed); src/features/tutor/input/latentInk/**; src/features/tutor/{TutorKeyboard,TutorComposer}.tsx; src/features/tutor/keyboard.css; src/flags.ts; scripts/latent-ink-grids.ts; tests/unit/{pad,tutor}/latent-ink-*; tests/unit/tutor/key-ink.test.tsx; tests/unit/flags.test.ts; docs/current/{N248,N249}.md; NEXT.md.
Not: any change to the keyboard's layout; new dependencies; claiming physical-device validation.

## N248 The Pad's math keys as a latent scratch pad for one drawn symbol at a time

Owner task: "I think switching back and forth between keyboard in lemma pad can be little hectic. I feel that we can use keyboard as latent scratch pad for short symbol drawings like just one symbol. This would allow user to insert symbols in quick successions. You can use known roc curves of the detexify and using simulations to determine when auto insertion is worse than tapping in the 3 options. You auto insert if user taps on different key or start drawing another symbol. Determining when user is moving to different symbol and completing his previous symbol can be difficult. My suggestion would to be map each symbol to n*n matrix and then match entries this avoid similar looking symbols from getting distinguished but n should be precisely be chosen such that two different symbols are not mapped to each other. Auto insert when the high confidence and user doesn't need to carry further as no symbol can be subset of the suggested symbol where you have to balance probability and logic. Handle edge cases and gains should be bigger than the cost."
Stage: Build · Status: done · Needs: — · Assigned: chat-517093#w3kd
Done = Behind padLatentInk (default off), a stroke over the Pad's math keys draws one symbol while a tap stays a key; the strip offers three readings, and after an insert the other two as one-tap replacements. A confident reading that cannot be the start of a larger symbol goes in by itself once the pen settles; an extendable one (n × n grids at the smallest injective n, the catalogue's families and listed handwriting prefixes) waits for the next key, a new symbol or a pause; an unclear one waits for a choice and goes in only when the learner moves on; an unusable one is left out with a notice. The thresholds come from a cost simulation over published Detexify-family accuracy that shows a positive gain in every scenario, with an on-device guard that raises the threshold for a learner who keeps correcting. Recorded in docs/current/N248.md.
Tests: tests/unit/pad/latent-ink-{model,policy}.test.ts; tests/unit/pad/latent-ink-keyboard.test.tsx; the existing pad unit tests.
Scope: src/features/pad/latentInk/**; src/features/pad/{PadMathKeyboard,LocalPadEditor}.tsx; src/features/pad/pad-math-keyboard.css; src/flags.ts (padLatentInk, off); scripts/latent-ink-grids.ts; tests/unit/pad/latent-ink-*; docs/current/N248.md; NEXT.md.
Not: new dependencies; turning the flag on; the tutor's keyboard; claiming physical-device or calibrated-handwriting validation.

## N240 Exam preparation and return to study (includes N241–N247)

Owner task: "Implement every thing remaining in this plan in one pr."
Stage: Build and Harden · Status: implemented in one PR, pending independent review and observed outcomes · Needs: — · Assigned: chat-642810#r8mz
Done = Owner-scoped sittings, exam tutor, scored attempts, card ideas, return to study, a shared legal agenda slot, and prospective shadow replay. Numeric decisions and the default-on release remain gated by observed outcomes.
Tests: exam command and tutor SQL, shared planner, app and connector scenarios, browser round trips, deterministic replay and paired evaluation.
Scope: N240–N247 from the supplied exam-mode plan, the R0 transition, and their feature notes.

## N231 Restore Lemma promptly on offline launch

Owner task: "Ok few issues to fix is offline usauablity of the lemma, first it opens it delays main screen by saying signing in and other like why sign-in doesn't persist."
Stage: Harden · Status: done · Needs: — · Assigned: chat-842671#v7q2
Done = Returning sessions open Today or the requested route while auth loads. After an online visit, a cold offline launch can display saved Today and recently visited Paths. Reconnection refreshes the existing login and study data. OAuth return routing and the owner boundary survive account changes and sign-out.
Tests: AuthGate, offline snapshot, and the live-adapter browser regressions for offline launch, expired-token refresh, account switching and sign-out.
Scope: shared app startup, device session lookup, bounded study snapshot and supported offline views, regression tests, and docs/current/N231.md.

## N230 Apple Pencil palm rejection in scratch pad and equation composer

Owner task: "Ok create a new pr with astra 6 dot agents implementing support for ipencil with palm rejection in scratch pad and equation composer."
Owner follow-up: iPad defaults to Apple Pencil-only ink, with a setting in both paper headers to allow finger drawing, tip double-tap for a one-stroke eraser, and responsive drawing. Long-press the eraser for stroke-wise and pixel-wise modes.
Stage: Harden · Status: done · Needs: — · Assigned: chat-563902#p4nc
Done = Both Tutor papers default to Pencil-only ink on iPad and share a persistent header opt-out; rejected palms cannot mark or erase, and finger navigation remains available. Two Pencil-tip taps arm the selected eraser for one Pencil stroke and normal drawing returns on lift/cancel. The eraser offers whole-stroke or swept partial erasing via long press and an accessible menu. Undo restores one eraser gesture. Finger mode and Android retain existing behaviors. Record automated validation and hardware limits.
Tests: tests/unit/pad/{ink-pencil.test.tsx,pixel-eraser.test.ts}; tests/unit/tutor/**; tests/e2e/v7-ink-pencil.spec.ts; existing ink and Tutor full-screen/gesture regression suites.
Scope: src/ui/v7/ink/**; src/features/tutor/**; tests/unit/{pad,tutor}/**; tests/e2e/v7-ink-*.spec.ts; docs/current/N230.md; NEXT.md.
Not: new dependencies, native Android changes, protected CI changes, treating simulated input as physical Apple Pencil validation, merge or deployment.

## N229 Simplify Tutor chat and fix Android full-screen drawing

Owner task: "Fix all the issues in lemma app of lemma repo on my github"
Stage: Harden · Status: done · Needs: — · Assigned: chat-861823#po2z
Done = Keep chat and drawing tools within the Android safe area. Toggle the Tutor header from the composer. Show image and context controls directly and keep session actions in the header. Restore compact Markdown lists and consistent spacing between learner and tutor messages. Let two fingers pan the scratch paper, retain ink during device rotation, resume or discard unfinished ink from its composer icon, and queue image answers while the tutor is responding. Support copying and deleting learner and tutor messages from selection mode. Record the changes in docs/current/N229.md.
Tests: Tutor chat, mixed-message selection, transcript deletion database contract, header, file upload, image queue, scratchpad gestures, full-screen orientation, writing assistance and layout parity.
Scope: src/features/tutor/**, src/data/tutor/**, src/ui/v7/ink/InkCanvas.tsx, supabase/migrations/20261218002600_n229_tutor_message_deletions.sql, docs/v6/capability-registry/tutor_message_deletions.json, tests/e2e/**, tests/unit/tutor/**, tests/mcp/sql/n193-tutor.mjs, docs/current/N229.md, NEXT.md.
Not: changing Android's system rotation policy.

## N228 Tutor quick questionnaires (short answer, one choice, several choices) in the reply row

Owner task: "Add the quick questionnaire that can contain short answer type MCQ or msq type questions, these tutor can attach along with chat head show the option of open questionare in the reply row and use icon color to show if questionare is complete, student had started it but not completed and student has not seen, maintain data so that it can filled later on and nothing is lost. Modify MCP and data contracts accordingly. Use a new pr for this one. Add a note too won tutor is aware of this option, can use it judge the students for different purposes."
Owner task: "Here are few things, in n228 pr only add these things, allow posting of messages even when tutor is not, full screen scratch pad editing for both scratch and equation. I have noticed that drawing in both the scratch pad is laggy and unreliable fix it. All will be part of next pr that ships in n228"
Owner task: "Sorry add landscape mode too in both scratch pads (when in full screen) which means they are rotated before sending to model"
Stage: Harden · Status: done · Needs: N227 · Assigned: chat-683106#krtq
Done = The learner can keep posting while a turn waits for the tutor (each message kept with the question, read by the tutor with it, a reply refused while unread ones exist); the scratch pad and equation paper open in full screen, with a landscape turn that keeps strokes upright; drawing is faster and no longer drops strokes. The tutor attaches a questionnaire (short, mcq, msq) to a reply it gave through MCP, idempotently, and reads the learner's answers; every handoff's instructions say what the option is for. The reply row shows it with a colour for not opened, in progress and complete; answers save as the learner goes, survive reloads, offline and other devices, and lock on submit. Additive migration with owner-only functions; recorded in docs/current/N228.md.
Tests: tests/e2e/{v7-ink-drawing,v7-tutor-fullscreen-paper,v7-tutor-followups}.spec.ts; tests/unit/pad/{ink-simplify,ink-matrix}.test.ts; tests/mcp/sql/n193-tutor.mjs (with fixtures/n228-questionnaire-contract.mjs); tests/unit/mcp/tutor-questionnaire.test.ts; tests/unit/tutor/questionnaire-rules.test.ts; tests/unit/contract/capability-registry.test.ts; tests/e2e/v7-tutor-questionnaire.spec.ts.
Scope: supabase/migrations/20261218002400_n228_tutor_questionnaires.sql; supabase/functions/_shared/tutor-questionnaire.ts; supabase/functions/mcp/{tutor-connector,server}.ts; src/data/tutor/{manual-api,live-manual,local-storage}.ts; src/features/tutor/{TutorQuestionnaire,FullscreenPaper,DemoCheckpointTutor,TutorInk,TutorComposer}.tsx; src/features/tutor/input/TutorEquationPanel.tsx; src/features/tutor/{keyboard,scratchpad}.css; src/ui/v7/ink/{InkCanvas.tsx,ink.ts}; docs/v6/capability-registry/tutor_followups.json; tests/e2e/{v7-tutor-chat,v7-tutor-live}.spec.ts; src/features/tutor/replyActions.css; docs/v6/capability-registry/tutor_questionnaire{s,_responses}.json; tests/mcp/sql/{n193-tutor.mjs,fixtures/n228-questionnaire-contract.mjs}; tests/unit/mcp/tutor-questionnaire.test.ts; tests/unit/tutor/questionnaire-rules.test.ts; tests/e2e/v7-tutor-questionnaire.spec.ts; docs/current/N228.md; NEXT.md.
Not: changing existing tutor functions or migrations; grading by Lemma itself; questionnaires in the demo tutor; protected CI paths.

## N227 Equation mode tools float, finger scrolling and a resizable paper; the strip pencil opens the scratch pad; quieter chat notices; Atlas typed links

Owner task: "Few fixes required. 1. These options just waste the important row space and can be executed as floating option that hides when drawing is happening, three finger scroll is not working in it, add three two finger scroll in eq composer. The area should be expandable as isln the scratch pad. Dragging the expand handle 2. Remove the symbol search using detexify which opens when I tap on the pencil icon in suggestion strip rather wire scratch pad to it and and therefore remove pencil icon from the input box. 3. In atlas add optional view for v3 type links and use color coding for it, sits inside the fiter menu."
Owner task: "Extremely annoying text that comes in a way actual tutor question. Same goes for 'make a card..' just use icon for making cards and this menu below chat can be used later for tracking other things that are chat specific like opening cards suggested by the tutor in chat or quick questionare by tutor etc."
Owner task: "Ideally i would want chat menu like this, keep the option of copy and like and dislike and make a card from conversation icon. Faded than message text."
Owner task: "The header can disappear after few down scroll or inactivity and reappear only after upward scroll (make only after scroll speed only) or hide/unhide option in input box you decide upon the method making more and more chat visible is important without eating the precious space."
Owner task: "No use the current pr only and I don't see chat menu in the screenshots you sent"
Owner task: "Ok another thing auto close and open the keyboard when input is not selected or selected respectively. I realised that input box we can put an icon of keyboard if this is tapped then keep the keyboard on and input selected as this allows user to scroll through the chat while typing, for example he wants to see what the start of the question."
Stage: Harden · Status: done · Needs: N224 · Assigned: chat-683106#krtq
Done = Equation mode's Read, Undo and Clear float over the paper and hide during a stroke; a grip drags the paper taller; two fingers scroll the paper and three the chat. With ink on, the strip's pencil opens the scratch pad and the input box has no pencil. The unfinished-drawing sentence is a small pill. Under each tutor reply a faded row of icons holds Copy, Good and Bad reply (kept on the device) and Make a card (a sheet). The tutor's header folds away after a short scroll down or 6 s idle when the chat can scroll, and returns only on a fast scroll up, at the top, or on Home or Page Up. The keys open when the answer is selected and close when the chat is touched, unless Keep keyboard open (the box's keyboard icon) keeps them up with the answer selected. The Atlas Layers sheet has an optional, colour- and dash-coded Typed links view with a key, kept on the device. Recorded in docs/current/N227.md.
Tests: tests/e2e/v7-tutor-inline-math.spec.ts; tests/e2e/v7-atlas-typed-links.spec.ts; tests/unit/atlas/typed-links.test.ts; tests/unit/tutor/reply-actions.test.tsx; tests/unit/tutor/header-autohide.test.ts; tests/e2e/v7-tutor-header-autohide.spec.ts; the scratch pad, live tutor, feature parity, UI plan v2, equation recognition and inline editor specs.
Scope: src/features/tutor/**; src/features/atlas/v7/**; src/features/adaptive/panels/AtlasLayers.tsx; src/ui/v7/ink/InkCanvas.tsx; tests/e2e/{v7-tutor-inline-math,v7-atlas-typed-links,v7-tutor-header-autohide,v7-tutor-gboard-layout,v7-tutor-ink-model,v7-tutor-symbol-input,v7-tutor-live,v7-tutor-inline-editor,v7-ui-plan-v2,v7-tutor-equation-recognition,v7-tutor-scratchpad,v7-feature-parity}.spec.ts; tests/e2e/v7-scenes.ts; tests/e2e/helpers/scratch.ts; tests/unit/atlas/typed-links.test.ts; tests/unit/tutor/reply-actions.test.tsx; tests/unit/tutor/header-autohide.test.ts; docs/current/N227.md; NEXT.md.
Not: new dependencies; changing V3 link data or approvals; protected CI paths.

## N225 Finish Atlas MCP typed-link proposal draft with repository checks

Owner task: "Complete your draft pr and please follow rules of repo to pass scope of the repo."
Stage: Build · Status: done · Needs: — · Assigned: chat-947#b6q8
Done = PR #1831 provides an additive, audited, owner-scoped MCP command for proposed Atlas V3 typed links; ChatGPT/Claude can read complete paginated graph data, request advisory attempt tags, and approved cross-subject aliases influence shared V3 ability without automatically certifying mastery. Registry documentation, SQL parity, unit tests, version and owner guards pass repository checks. Independent review is required before deployment.
Tests: tests/mcp/sql/{parity,command-manifest-mirror,registries}.mjs; tests/unit/adaptive/atlas-mcp-worker.test.ts; tests/unit/mcp/incident-1173-budget.test.ts.
Scope: supabase/migrations/20261218002200_n199_atlas_mcp_proposals.sql; supabase/functions/mcp/{server.ts,machine-reads.ts,tools/read.ts,tools/atlas-worker-read.ts}; supabase/functions/_shared/adaptive/{atlas,measure}.ts; src/data/adaptive/live.ts; tests/mcp/sql/parity.mjs; tests/unit/adaptive/atlas-mcp-worker.test.ts; tests/unit/mcp/machine-reads.test.ts; docs/v6/capability-registry/lemma_command_resources.json; docs/mcp/capability-map.json; supabase/functions/mcp/rules.ts; docs/current/N225.md; NEXT.md.
Not: production deployment without review; autonomous approvals, merges, evidence or tiers; protected CI/rules changes; provider API keys.

## N226 Atlas V3 evidence-safe operations and atomic MCP graph editing

Owner task: "Complete the whole job like all X nothing should remain deploy full e2e solution"
Stage: Build · Status: done · Needs: N225 · Assigned: chat-947#b6q8
Done = The Atlas V3 graph never silently deletes learning evidence during a merge, duplicate concepts with evidence can be retained and aliased, and authenticated ChatGPT/Claude MCP can change concept levels with hierarchy validation, remove truly empty orphan concepts, reclassify an existing prerequisite/related link atomically, and create up to 50 version-checked links in one audited transaction. App and MCP operations preserve existing owner checks and Undo. Full SQL and unit regression tests pass before independent Supabase review.
Tests: tests/mcp/sql/parity.mjs, tests/mcp/sql/registries.mjs, tests/mcp/sql/command-manifest-mirror.mjs; tests/unit/mcp/{capability-map,instructions-coverage}.test.ts.
Scope: supabase/migrations/20261218002300_n226_atlas_safe_graph_edits.sql; docs/current/N226.md; NEXT.md; docs/v6/capability-registry/{lemma_command_resources,atlas_graph_edits}.json; docs/mcp/capability-map.json; supabase/functions/mcp/rules.ts; tests/mcp/sql/parity.mjs; tests/unit/mcp/instructions-coverage.test.ts.
Not: losing any learner evidence, altering study results, auto-approving V3 suggestions, modifying protected CI paths, bypassing owner review, or adding a model API key.

## N224 One suggestion strip, equation mode as paper, the rich answer on, and the Owner's phone review

Owner task: "Auto eq doesn't work in the chat box. I have realised that eq composer it's actually the right idea to just keep the drawing by hand and remove all these symbols bs so the scratch pad can become bigger, i think the slowness might have been caused by multiple triggers caused by handwriting as it progress we can use manual trigger if it is faster not for detexify. Another thing i see no suggestion card as this when I wrote eps and all. I can see that there might be lot of this going around that's why it's impossible be seen the what comes first like auto eq and this custom shortcut in the input, first integrate all this in one hood remove grey text prediction. These will default and no settings are needed for them as they non intrusive remove those confusing settings in the main settings. The grey text will come as proof assist option later. But keep this in mind while implementing."
Owner notes (22 Nov, from the phone): the pencil at the strip's left edge and the symbols inside its slots, no useless symbols beside next words; Today's tutor time, the Atlas peek, Prerequisites, OCR latency, the context sheet's words, Draft a card and the missing equation chips; one tap on the pencil for the scratch pad; tutor text the size of the keyboard's and no green rule. Exact words are in the PR body.
Stage: Harden · Status: done · Needs: — · Assigned: chat-683106#krtq
Done = Equations in an answer are rendered TeX chips stored as $…$; a tap opens them to edit the LaTeX, write them again by hand or remove them; tutorScratch is on so the Owner's phone has them (the rich answer, chips, the pencil's scratch pad). The strip always has Gboard's frame, Draw symbol at the left edge and Equation mode at the right, and its three slots show the first of autoeq's readings of an equation typed in the answer (inserted as a chip), symbols for a command, short form or name (eps), the word suggestions, or ∀ ∈ ⇒. Suggestions are always on with no settings and no grey text (both behind default-off flags); Refresh suggestions is in Answer actions. Equation mode is paper in the keys' place that scrolls both ways: symbols are read as drawn, the whole equation on Read, which warms the model and cancels stale readings. One tap on the pencil opens the scratch pad, whose tools are one row with Keys first. Progress Today counts one day's tutor sessions; tutor replies use the composer's sans without the subject rule; the Atlas peek grows with its text; Prerequisites are full-width rows; the context sheet and the card draft use the kit's fields with fewer words.
Tests: tests/e2e/v7-tutor-inline-math.spec.ts (rewritten for N224); tests/unit/tutor/{answer-math-chips,equation-composer,typed-equation}.test.*; tests/unit/insights/progress-today.test.ts; writing-aid preferences without the settings flag; the Gboard strip test asserts the new frame; specs that test the plain answer, the settings or the grey text pin their flags; renamed controls reached by their new names.
Scope: src/features/tutor/**; src/features/{atlas,checkpoint,insights,project,settings}/** (the review items); src/data/{api.ts,demo/adapter.ts,demo/stress.ts} (one-day insights); src/flags.ts (tutorScratch on; writingAidSettings and proofAssistGhost off); src/ui/v7/ink/InkCanvas.tsx (panTouches); tests/e2e/{v7-tutor-inline-math,v7-tutor-gboard-layout,tutor-writing-aid,v7-tutor-chat,v7-tutor-live,v7-tutor-local-excerpt,v7-tutor-scratchpad,v7-tutor-inline-editor,v7-feature-parity,v7-ui-plan-v2,v7-tutor-equation-recognition}.spec.ts; tests/e2e/v7-scenes.ts; tests/unit/{flags,pad/pad-tutor-handoff,tutor/*,insights/progress-today}.test.*; docs/current/N224.md.
Not: Equation Assist in the Pad by default; a language model for grey text (the later proof assist); WASM threads without cross-origin isolation.

## N223 Equations inline, equation mode in the keys' place and one way to write by hand

Owner task: "While reading the proof it may seem that latex is not a preferred way rather whenever a symbol is inserted or equation is inserted it is inserted inline component that wraps the renderer of tex. And tap it allows for edit if the underlying edit. This just vague idea you have figure out rest so that it looks beautiful and wire the handwriting recognition/ symbol recognition and add scratch pad into single way like Gboard suggestion strip become a tab to switch between what user wants. You have figure out rest make sure everything is beautiful and elegant and be creative in integration don't fall off the ui theme and philosophy."
Owner follow-ups (22 Nov, same PR): keep the strip layout the Owner liked with equation mode in Refresh's place, changing only the keys' area, with symbol recognition and common variables to compose equations; the composer's pencil opens equation handwriting on a tap and the drawing on a double tap; paper that scrolls both ways, the scratch pad included; the scratch pad's tools in one row with the keyboard first and no unnecessary rows; same-size, aligned strip icons; the equation composer framed by operations (top), variables (left), digits (right) and symbols (bottom), where x1 + y1 = 1 is written and later picked up by autoeq; open-source options searched first; a lower footer for the composer, a way to hide its keys for full handwriting, and Detexify kept for symbol search with a way to send the ink there. Exact words are in the PR body.
Stage: Harden · Status: done · Needs: — · Assigned: chat-683106#krtq
Done = Equations in an answer are rendered TeX chips stored as $…$; a tap opens them to edit the LaTeX, write them again by hand or remove them. The strip keeps Gboard's frame with same-size icons: idle ∀ ∈ ⇒, Draw symbol and Equation mode; typing Draw symbol, three word slots and Equation mode. Refresh suggestions is in Answer actions. Equation mode is an equation composer in the keys' place: operations along the top, variables down the left, digits and Delete on the right, symbols and ↵ along the bottom, around a composition line and paper that scrolls both ways. Its keys can be hidden for handwriting, and the band under it is only the gesture inset. What is written (x1 + y1 = 1) is read by N222's autoeq, its rules and then its on-device model, ordered by the words before the caret; the strip offers the readings and inserts the chosen one as an equation. Ink reads as an equation (Pix2Text MFR, downloaded once on the learner's yes) or a symbol and joins the composition. Search symbol sends the ink to Draw symbol, whose choice comes back. The composer's pencil (Write by hand) opens equation mode on a tap and the scratch pad on a double tap. The scratch pad's tools are one row with Keys first, its paper scrolls both ways, and its resize grip and hint take no row.
Tests: tests/e2e/v7-tutor-inline-math.spec.ts; tests/unit/tutor/{answer-math-chips,equation-composer}.test.{tsx,ts}; the scratch pad, writing-aid Refresh and Gboard strip tests reach the same controls by their new way in.
Scope: src/features/tutor/**; src/ui/v7/ink/InkCanvas.tsx (panTouches); tests/e2e/{v7-tutor-inline-math,v7-tutor-gboard-layout,tutor-writing-aid,v7-tutor-scratchpad,v7-tutor-live,v7-tutor-inline-editor,v7-feature-parity,v7-ui-plan-v2,v7-tutor-equation-recognition}.spec.ts; tests/e2e/v7-scenes.ts (tutor-scratch scene); scripts/adaptive-writing-apk-smoke.mjs (Refresh in Answer actions); tests/unit/tutor/{answer-math-chips,equation-composer}.test.{tsx,ts}; docs/current/N223.md.
Not: turning Equation Assist on by default; a language model for grey text.

## N222 Refine autoeq decoding for Equation Assist

Owner task: "Refine his approach as per your suggestions and also try to extend to equation assist. Upload your finished work in one pr of lemma."
Stage: Build · Status: done · Needs: — · Assigned: chat-644281#z6m3
Done = Autoeq preserves typed facts during beam search and offers distinct valid interpretations. Equation Assist ranks shorthand using context and translates supported proof phrases. A learner can select their own Pad text, choose a rendered LaTeX candidate and undo the edit. Autocomplete supplies notation with editable empty slots for the learner to fill.
Tests: checkpoint-matched benchmark and upstream regression suite, ranked readings, proof declarations and quantifiers, local model inference, notation-only completion, selection lifecycle and undo on a phone viewport.
Scope: src/features/pad/**; src/features/tutor/input/modelAssets.ts; src/flags.ts; public/models/equation-assist/**; scripts/equation-assist/**; tests/unit/pad/**; tests/e2e/pad-equation-assist.spec.ts; docs/current/N222.md.
Not: Autocomplete of whole equations, proof steps or answers; tutor transport, OCR, or keyboard layout changes.

## N221 Finish the Owner's phone review of N220: Gboard keyboard, Atlas subjects, Calendar toolbar, Progress total and session header

Owner task: "N219 completed, before this actually complete the remaining ui bugs reported then move to do this."
Owner task (22 Nov, take-over): "Take over n221 I don't what to do with keyboard it's getting more and more further from the Gboard keyboard. Now this you main task to get the layout correct. The space below is bigger but the keys are much longer not square. Use spec available on internet to match it perfectly. I am also attaching image again. I am used to this layout therefore it will be important. And also add simple auto complete using simple code and ngrams decoder and spatial model using n219. Fix everything in one run."
Stage: Harden · Status: done · Needs: — · Assigned: chat-683106#krtq
Owner follow-ups (22 Nov, same PR): LaTeX short-form symbol suggestions with dictionary and fuzzy matching; the suggestion box in the strip like Gboard; a complete lexicon ("how can simple words like restate missing"); less aggressive proof words ("it considered completion by because as leading to proof"); handwritten equation recognition in the scratch pad ("add the handwriting recognition in this same pr which is n221"). Auto-equation is N222 (#1826). Exact words are in the PR body.
Done = The answer keyboard has Gboard's portrait geometry, measured on the Owner's Gboard screenshot and AOSP LatinIME's 205.6 dp keyboard height: in the Android app, 51.4 px rows with 41 px caps taller than wide, ten key pitches across, Gboard's bottom row widths, 53.8 px from the strip's top to the first cap and Gboard's 48 px band under the keys with Hide keyboard where Gboard's ⌄ is; browsers keep the shape with 44 px rows. The strip spreads its icons when idle and frames three equal one-line word slots while typing; the writing aid's replacement, continuation and Undo sit in the strip like a Gboard correction instead of a floating card. Word suggestions come from an n-gram (complete 114,780-word lexicon built from N219's sources, mathlib bigrams, the tutor's question as a cache) and touch decoder with slip corrections inside the writing aid's existing guards, never correcting real words and never pushing proof words early; LaTeX commands and short forms offer catalog symbols. Everything applies only when tapped. Recognize equation in the scratch pad reads the drawing as editable LaTeX on the device with Pix2Text MFR (MIT, pinned and checksum-verified, downloaded once on request, then offline) and inserts it at the caret. Atlas shows a button for every subject with the one in view marked; Calendar's view picker is a plain label and the status row's chip and button share one height; Progress shows its total at display size with Your week beside it and one meta line; the session header is the app's full-width detail header.
Tests: tests/e2e/v7-tutor-gboard-layout.spec.ts (geometry, strip, decoded taps, in-strip fix, symbols); tests/e2e/v7-tutor-equation-recognition.spec.ts; tests/unit/tutor/{ngram-spatial-decoder,latex-shortcuts,equation-recognition}.test.ts; tutor-writing-aid placement assertions follow the in-strip decision; the Atlas rail test expects every subject; existing keyboard, writing-aid, Tutor layout, Calendar and Progress tests.
Scope: src/features/{tutor,atlas,calendar,insights}/**; public/models/writing-decoder/{unigram-v1,unigram-v2}/**; scripts/writing-decoder/{build-lexicon-v2.mjs,sources/**}; tests/e2e/{v7-atlas-layers,v7-tutor-gboard-layout,v7-tutor-equation-recognition,tutor-writing-aid}.spec.ts; tests/unit/tutor/{ngram-spatial-decoder,latex-shortcuts,equation-recognition}.test.ts; docs/current/N221.md.

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
