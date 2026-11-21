# Tutor-informed writing aid trial

This revision supersedes swipe acceptance and the earlier no-tutor-context design. It is a review and physical-device trial in PR #1738. It does not authorize production release. The experiment report in this directory records the measured candidate choice; this document describes the shared interaction and safety boundaries.

## Interaction

Tap a floating suggestion to accept it. The input strikes through proposed replacement text, and a faded continuation remains outside the saved draft until accepted. Desktop Tab also accepts a continuation. Swiping performs normal selection/scrolling and never accepts. Refresh is available beside a floating choice and in the keyboard; X declines the current occurrence. Three word targets stay in fixed positions with the preferred choice in the middle and distinct word families preferred when available.

Suggestion categories use existing Day/Night tokens: amber for spelling, blue for notation, green for continuations, and purple for word choices. Text labels and icons carry the same distinction. These colors describe the type of writing help, not whether the mathematical reasoning is correct. Tutor-derived offers also say “From tutor.” Touch targets remain at least 44 px, with contrast and narrow-screen checks.

An eligible personal autocorrection happens at a directly typed word separator. Its nearby card says what changed and offers Undo. The first Backspace or ordinary Undo also restores the exact typed token and separator. Rejecting an automatic change suppresses another correction of that occurrence and revokes permission for that typo pair. Paste, restoration, composition, selections, literals, mathematical operators, variable declarations and unsupported correction classes do not trigger it.

## Tutor signals

Both tutor reply transports accept optional `writingAid` metadata. The tutor receives instructions for a versioned payload with a revision and at most twelve fragments. Each fragment has an ID, source message ID, role, exact visible text, and optional variable and symbol inventories. A fragment is at most 240 characters; each inventory contains at most sixteen bounded entries. Roles distinguish prompt, given, suggested wording, hint, proof, solution and unknown.

The transport packs a structurally valid payload into a tagged suffix of the existing private reply body, preserving the existing database command and authorization contract. Every fragment and inventory entry must occur in the visible reply. Overflow drops optional metadata rather than truncating the tutor answer. New clients hide only a complete validated suffix. Older clients may show its code block, which is a compatibility limitation until their frontend is updated.

The app uses only the latest connector reply and binds source IDs to its actual saved message ID. Manual imports do not activate tutor hints. A content fingerprint invalidates proposals when a tutor changes its payload even if it reuses the revision. Tutor labels are untrusted: falsely calling a proof step “suggested wording” is not permission to complete it. The private transcript persists as before; the keyboard does not make an additional store of tutor prose.

The generator retains only a bounded learner-authored context and checks each output independently. Variables do not fill an unchosen operand slot. A weak prefix cannot select a proof method or property. Tutor terms can help with strongly typed lexical endings and notation ranking. Longer exact-source copies require a substantial authored prefix and an independent neutral communication scaffold with restricted continuation vocabulary. A phrase such as “We can apply…” cannot retrieve a theorem or method. Generated or accepted text cannot become new learner evidence for a chain of proof completions.

The trial defaults to the validation-selected contextual ranker with tutor wording enabled. Settings offers Wording, experimental Wording and notation, and Off under Tutor hints. The declared-variable guard still receives the full validated inventory in Wording mode. Off provides the no-context comparison. These options are separate from Balanced, Faster typing and Strict. The held-out comparison did not demonstrate an incremental speed gain from tutor wording over the previous contextual ranker; selection is provisional.

An additional Faster-mode audit exposed 48 weak-prefix offers of “because.” The connector gate was tightened across all candidate sources. The known-task regression then reported zero such exposures, and the Balanced results were unchanged. The report preserves the pre-fix result and distinguishes the regression from fresh targeted probes.

## Personal automatic corrections

Four surface typo pairs are considered: `teh → the`, `recieve → receive`, `recieved → received`, and `seperate → separate`. Unconditional rules failed the initial synthetic precision criterion. A separate preregistered personal-history experiment evaluates the fixed requirement of two explicit acceptances of the exact pair, with no intervening negative feedback.

The trial requires both the measured class certificate and local permission. Its certificate uses a two-sided 95% Wilson lower precision bound of at least 98%, at least 200 eligible independent synthetic profiles, and a separate held-out check. The report also includes family-cluster intervals, coverage and harmful corrections. These are estimates under the simulator's assumptions, not human precision guarantees. A larger simulated cohort can narrow sampling intervals but cannot eliminate model misspecification or establish real study impact.

Permission expires thirty days after the last explicit acceptance. Automatic application, passive retention and the tutor's instructions cannot grant it. Refresh, dismiss, Undo and edits revoke it. The automatic-correction switch is separate from mode and personalization, and Off disables assistance. Demo starts with assistance enabled; personal corrections still require the two actual acceptances. Live profiles retain the existing Off default.

## Feedback and adaptation

The bounded local reward learner uses explicit acceptance, refresh, dismiss, Undo, partial edit, selecting an alternative, retained acceptance, manually typed match, divergence, and repeated directly typed vocabulary. Automatic Undo and automatic retention are separate, weaker/negative channels; automatic application is an event, not acceptance credit. Hidden offers and disabled assistance do not collect feedback. Each owner/demo profile has isolated storage with pause and Forget controls.

These are incremental reward updates over eligible candidates, not on-device language-model reinforcement training. The research compares actual fitted small scorers and low-rank rerankers. A low-rank scorer trained from scratch is not LoRA applied to Qwen. Larger model probes, dataset limitations, latency environment, full typing costs and the selected candidate belong in the accompanying experiment report.

## Release boundary

The test app installs alongside Lemma. Main Settings → Tutor → Writing aid and the chat's Writing assistance sheet expose the same preferences. The owner reviews the winning candidate and tries the APK on a physical device before production authorization. Host Chromium timing and simulated WPM do not establish phone performance or human speed.
