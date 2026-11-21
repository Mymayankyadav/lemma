# Floating writing suggestions and local adaptation

This is the owner's requested revision of the writing aid in PR #1738. The earlier fixed review row was selected for stable target placement and recovery cost. It did not implement the owner's preferred floating interaction; this revision adopts that interaction directly. The new APK is a side-by-side demo with Balanced assistance and personalization enabled. Production release still waits for the owner's physical-device test.

## What appears while writing

The affected text is struck through while the original draft remains intact. A small themed card floats just above the input, showing the original and proposed replacement, a refresh control, and an X to dismiss. Tapping the candidate applies it. The next card offers Undo. No blue underline, permanent review row, or separate More panel is required.

Faded continuations remain inline. A right swipe inside the input accepts the current continuation; tapping its floating card and desktop Tab also work. A swipe must travel at least 56 CSS pixels, within 600 ms, with at most 18 px vertical movement and at least twice as much horizontal as vertical travel. Movement, selection, composition, hidden UI, mode changes, stale requests and pointer cancellation invalidate acceptance. Swiping a card, button, or empty composer margin does not accept a continuation.

The three word slots remain above the keyboard, with the preferred choice in the center. Their positions stay fixed during a press, and releasing a held target cannot accept its newer occupant. A keyboard refresh rejects the currently visible suggestions and asks for alternatives; each floating suggestion also has its own refresh. A small morphological family heuristic prefers different endings rather than three near-duplicates. This is a surface-diversity heuristic, not a guarantee of semantic independence. If only one or two eligible candidates exist, the app does not fabricate a third. An exhausted floating pool says “No other matching suggestion.” Continued typing generates a new eligible pool.

Portrait cards sit beside the input without moving the keyboard. Short landscape screens use the transcript-side column, leaving a gap before the keyboard. Controls have at least 44 px touch height; enlarged text wraps. Theme, contrast, focus, reduced motion, image chips, drawing and the existing math keyboard are preserved. The visible source decoration is excluded from the draft's meaning and clipboard text.

## Grammarly inspiration

The official [Grammarly Android guide](https://support.grammarly.com/hc/en-us/articles/15606282682637-Grammarly-for-Android-user-guide) and its [suggestion screenshot](https://support.grammarly.com/hc/article_attachments/34666296759949) informed the compact floating candidate, direct accept and nearby dismiss. The [iPhone editor guide](https://support.grammarly.com/hc/en-us/articles/4412638077709-How-to-create-or-edit-documents-on-iPhones) informed suggestions close to the keyboard. Grammarly documents swipe-to-ignore there; Lemma's swipe-to-accept is the owner's requested choice. This implementation uses Lemma's own components, colors and assets.

## Ten implemented feedback channels

The update magnitude is `0.35 × reward × feature factor`, with weights clamped to ±3. These initial coefficients are explicit modeling choices, not fitted human preference probabilities. Feedback applies to visible, eligible, current proposals. Words use bounded lexical identities; complete short phrases and symbols use a pair of hashes so distinct continuations do not collapse to their first word. Hashes are compact identities, not anonymization.

| # | Observed behavior | Reward | Use and ambiguity control |
| --- | --- | ---: | --- |
| 1 | Tap, Tab or swipe accepts a suggestion | +1 | Promote that eligible candidate and its local lexical features. |
| 2 | Refreshes a displayed list or floating offer | −0.7 | Demote only displayed choices and exclude them from that refresh cycle. |
| 3 | Undo reverses an accepted suggestion | −1.5 | Strongly reverse the apparent positive acceptance; do not teach the restored draft as generated content. |
| 4 | Edits or deletes the accepted insertion | −0.6 | Treat the changed insertion as partial rejection, once per pending acceptance. |
| 5 | Keeps an acceptance, or leaves it present for three visible seconds | +0.35 | Weak retention signal; the timer is not explicit approval and does not run as positive evidence in a hidden tab. |
| 6 | Manually finishes a visible word or continuation | +0.16 | Weak match signal after at least 300 ms exposure; direct typing only. |
| 7 | Manually types a different word or continuation | −0.08 | Weak divergence signal after at least 300 ms exposure; a skipped glance must not outweigh deliberate choices. |
| 8 | Selects one of the displayed alternatives | −0.2 to the others | Small relative penalty only for known visible alternatives, never unshown candidates. |
| 9 | Dismisses the floating suggestion with X | −0.45 | Reject the displayed offer; keep the original text and preserve undo history. |
| 10 | Repeatedly completes a word by direct typing | +0.14 | Learn lexical usage and a bounded personal vocabulary; pasted, restored and accepted text do not supply these observations. |

Weights decay with a 30-day half-life; personal-word counts decay over 180 days. The store has at most 512 weights and 128 words, with a 100 kB storage guard. Personal vocabulary needs at least two direct observations and at least five typed letters covering 75% of the word; it does not propose an untyped operand or proof choice. The app keeps short lexical statistics locally in the owner or demo-profile namespace. It does not store a feedback transcript or send this data to a server. Account cleanup removes the namespace. Main Settings and chat both offer Personalize suggestions and Forget learned writing preferences. Off stops feedback collection, including direct vocabulary observations and pending retention credit; existing preferences remain until explicitly forgotten.

Refresh feedback is immediately reflected in the next ranking. A refreshed spelling or notation occurrence stays excluded while its exact source span remains present; removing or changing the occurrence retires that exclusion. Word and continuation offers regenerate as the typed prefix changes. The ranker's preference survives a new sentence, while an individual rejected occurrence does not become a permanent global ban.

## Model choice and retraining boundary

The runtime uses the existing compact candidate generator and guards, followed by a bounded contextual reward ranker. Its features are candidate identity, surface, prefix/length buckets, and a short learner-authored previous word. It has no tutor transcript and cannot expand eligibility. Longer-term adaptation changes ranking and strongly typed vocabulary endings; it does not train proof reasoning on the phone.

The reproducible experiment compares static ordering, reward-frequency, this exact contextual scorer, and a rank-4 adapter trained in minibatches during an offline replay, with delayed, noisy feedback and a preference shift. The contextual default follows the final paired three-seed result. Its improvement over frequency is small; the simulation does not show a meaningful corresponding speed advantage. The adapter is a low-rank reranker experiment, not a LoRA fine-tune of a large language model. Its weights are research artifacts and are not packaged in the APK. Exact counts, confidence intervals, source hashes and limitations are in the [experiment report](README.md).

For future generator LoRA, a training row must preserve the authored prefix, visible candidate set, surface, output budget, chosen or rejected candidate, feedback delay, eventual edit/undo and exposure confidence. Train pairwise preferences only where both alternatives were actually exposed, downweight passive rejection, and split by learner, proof family and time before generating augmentations. Include deliberately incorrect proofs as preservation tests: the target is the learner's spelling/notation intent, never a corrected proof. Retain all existing logic-gap and output gates during training and evaluation. A candidate model may be pruned or quantized only after rerunning the same held-out cases and device measurements. No full language-model retraining is claimed in this revision.

## Interaction cases and limits

| Situation | Result |
| --- | --- |
| Correct word is visible | Tap its stationary slot; no overlay search is needed. |
| None of three words matches | Refresh once, or keep typing; refresh is explicit negative feedback. |
| Faded wording is wrong | Refresh its card or type a different ending; divergence contributes only weak feedback. |
| Spelling or notation replacement is unwanted | X keeps the draft; refresh considers another eligible offer. |
| Accepted wording was a mistake | Nearby Undo restores text and caret; editing the insertion also supplies feedback. |
| There is no different eligible offer | Show exhaustion rather than repeating rejected text as if it were new. |
| The learner chooses X where Y would make the proof correct | No proof-truth correction. An unresolved identifier or relation gap is not completed. |
| A continuation reaches a logical choice | Abstain; each ghost has at most two output tokens and 32 characters. |
| Several words are accepted in sequence | Preserve the original learner anchor and the bounded chain; generated words cannot bootstrap new proof context. |
| Cursor or selected text changes during a gesture | Reject stale insertion and preserve ordinary selection. |
| IME composition or native scrolling is active | Keep input atomic; do not consume vertical scrolling as acceptance. |
| Images are loading or the answer is queued | Preserve the existing read-only/recovery contract. |
| Offline, storage failure or unavailable assets | Ordinary writing remains usable; no remote fallback or draft upload. |
| Owner, checkpoint, mode or visibility changes | Retire stale proposals and pending exposure feedback. |
| Frequent wording changes over weeks | Decay older preferences so recent choices can recover from earlier habits. |

Gesture tests, screenshots and geometry checks establish behavior in Chromium. Fitts-law estimates use the last typed key as the starting point and assume 30 WPM; they do not measure human thumb movement, actual Android latency or study outcomes. Native horizontal swipes with no offer can remain browser navigation. No claim of guaranteed logical safety follows from a synthetic replay or from making the model wrong half the time. The physical test should compare Balanced/Faster/Strict, check swipe comfort and recovery, and assess whether suggestions steer the learner's reasoning.
