# Android keyboard follow-up

The Android trial update is build **200001**. Its package ID and signing certificate match build 200000, so Android can update the existing demo in place. [Download the APK](../../../../artifacts/writing-aid-pr1738/lemma-tutor-writing-aid-test.apk?raw=true) · [Keyboard preview](../../../../artifacts/writing-aid-pr1738/lemma-tutor-writing-aid-test-word.png) · [Checksum and build record](../../../../artifacts/writing-aid-pr1738/lemma-tutor-writing-aid-test.apk.build.json)

The trial keyboard displayed three empty slots after the learner typed `In the sample for testing jok`. The dictionary contained **joke**, but the former Balanced ranker required four typed letters for ordinary, low-frequency words. After unrelated word boundaries its fallback repeatedly offered **the**, **a** and **an**.

Balanced and Faster now offer the final letter of a short ordinary word from three directly typed letters when the prefix is incomplete and the surrounding text is eligible. The keyboard also uses the app's existing math vocabulary for strongly typed endings. For example, `homeomorphis` can finish **homeomorphism**. Earlier direct use of a math name can support reusing its spelling in the current draft. Logical connectors, protected properties, variables, literal text, and pasted or accepted text keep their existing restrictions.

At a space the row looks for matching neutral tutor wording, a previously typed word pair followed by writing vocabulary, a standard request phrase, or an observed grammatical word pair. For example, if the learner already typed **for testing writing assistance**, repeating **for testing** can offer **writing**. Directly typing **jok** then offers **joke**. An unrelated boundary can have empty slots. The app applies a word only when tapped.

## Matched results

Both revisions used the same 30 WPM baseline, simulated users, tap decisions and passages. Across six fixed typed prefixes the desired word appeared in the three slots on three cases before and four after. Four unrelated boundaries previously showed **the / a / an** and now remain quiet. Four open proof-choice probes exposed zero prohibited target words in both revisions. The updated row abstained on all four. The fixed prefix set includes the reported failure and is a diagnostic sample. [Raw suggestions, fixtures and per-mode metrics](phone-replay.json)

| Balanced replay | First test APK | Updated keyboard |
| --- | ---: | ---: |
| 144 chronological tutor tasks, 40 ms per displayed list | 30.45 WPM | 30.62 WPM |
| 16 proof passages, zero cost for ignored lists | 33.19 WPM | 33.04 WPM |
| Same 16 passages, 40 ms per ignored list | 32.25 WPM | 32.31 WPM |

In the 144-task simulation the new keyboard showed 1,381 lists versus 1,686 before. It took 316 taps versus 357 and required 38 more directly typed characters. All 144 final drafts matched the learner's intended text and the audit flagged zero premature proof suggestions in Balanced. Actual typing speed on the owner's phone is still unmeasured. The short-set simulator uses the two immediate word actions described in the [frozen-version comparison](VERSION-COMPARISON.md).

Run `node scripts/writing-aid-phone-replay.mjs` with Chromium and the repository's Node dependencies installed. The script extracts the previous source from Git, replays both engines, and writes the JSON alongside this report. [Replay script](../../../../scripts/writing-aid-phone-replay.mjs)

## Package verification

The APK was built from `f94abbd7800b11122062d2bd1054c69cf51a0ccf`. Android unit tests, lint, signature verification and 16 KB alignment checks passed. Mobile Chromium loaded the assets extracted from the signed APK with external requests blocked. Typing `In the sample for testing jok` displayed **joke** in the middle slot. Tapping inserted **joke** and a space. Undo restored **jok**. The browser suite also exercised the longer reported passage using Lemma's on-screen letter keys. Installing and timing this version on a physical phone remain part of the owner trial.
