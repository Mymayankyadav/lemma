# Did the writing aid get slower?

The test APK lost 0.32 modeled WPM in Balanced and 0.96 in Faster on the earlier proof passages. The entire decrease in characters saved by word taps between the previous app engine and the APK came from **because**, **since**, or **therefore**. On the shorter tutor workload, both versions tied on all 144 Balanced tasks. The original report used the current engine with tutor hints disabled as its previous-version control. This audit runs the frozen source for each app version. [Results and changed words by passage](version-comparison.json)

## Same passages, same keyboard, three app versions

The historical simulator replays 16 proof passages containing 1,307 target characters, including eight deliberately incorrect arguments. It uses the recorded 390 px phone layout, a 30 WPM typist and 75% uptake of eligible word suggestions. Typing costs 400 ms per character. Each accepted word costs modeled finger travel and 75 ms of inspection. The primary score charges zero for inspecting ignored lists. This run isolates the original three-word keyboard with a fresh state and the same tap coordinates for every engine. [Original method](../writing-aid/SIMULATION.md) · [Passages](../writing-aid/replay-drafts.jsonl)

| Source | Balanced WPM | Faster WPM | Strict WPM |
| --- | ---: | ---: | ---: |
| First integrated keyboard, 9a84cf4 | 33.65 | 37.94 | 30.26 |
| Previous adaptive engine, bc7f012 | 33.51 | 37.76 | 30.24 |
| Tutor test APK source, 894fa52 | 33.19 | 36.80 | 30.24 |

The previous Faster engine sometimes offered **because** after `b`, **since** after `si`, and **Therefore** after `Ther`. The APK requires stronger evidence before offering a logical connector. In two passages it still finished **because** after `becaus`. Faster saved 309 typed characters across the passages, down from 339. Balanced saved 171, down from 184. Charging 40 ms for each changed ignored list also leaves the APK behind on this workload, at 32.25 versus 32.56 Balanced and 35.09 versus 36.00 Faster. [Accepted words and inspection sensitivity](version-comparison.json)

## Same 144 tutor tasks, two app versions

The two source revisions saw the same chronological tasks, user IDs, manual actions, seeded decisions and timing rules. The previous adaptive scorer received learner input. The APK's selected setting also received its permitted tutor wording. The manual control used the same spelling repairs and the original direct-symbol route. Each new list costs 40 ms, a tap costs 300 ms, and a direct character costs 400 ms. Both versions use 45% uptake draws on available exact matches and charge for requested refreshes. There are 12 synthetic profiles, 26 distinct intended texts and 25 distinct manual strings. [Task data](dataset.json) · [Timing and counts](version-comparison.json)

| Replay | Manual WPM | Prior Balanced | APK Balanced | Prior Faster | APK Faster |
| --- | ---: | ---: | ---: | ---: | ---: |
| As originally scored | 29.48 | 29.97 | 29.97 | 30.70 | 30.74 |
| With immediate word taps and punctuation | 29.48 | 30.45 | 30.45 | 31.79 | 31.83 |

The archived replay forced a typed character between successive accepts. It also treated the space supplied with a suggested word as a mismatch before punctuation. The composer lets the learner tap a second eligible word immediately and replaces its supplied space when the learner types punctuation. Accounting for those actions gave each Balanced version 21 consecutive word accepts and 43 word accepts before punctuation. The modeled gain from fixing the replay was 0.49 WPM for each version. [Composer implementation](../../../../src/features/tutor/TutorComposer.tsx) · [Replay](../../../../scripts/tutor-writing-regression.mjs)

Under the corrected replay, Faster saved time on six tasks and tied on the other 138. Its flagged exposures to premature proof wording fell from 48 to zero. For example, the older keyboard offered **because** after `b` when the intended word was **believe**. These are repeated displayed offers, so several can occur in one draft. Both versions finished all 144 drafts as intended in every mode. Balanced had zero flagged exposures in both versions. Scoring these same test cases again is a regression check. Human typing speed and on-device suggestion latency still require the physical trial. [Mode and task results](version-comparison.json)

## Where the larger numbers came from

The original standalone prototype reached **34.79 Balanced and 43.38 Faster WPM** on the same sixteen proof passages. Its simulator included word and faded-text matches, a 250 ms selection tap, 75 ms to inspect accepted offers, and 15 ms per changed ignored list. It let the simulated learner select the most profitable exact match. Its 50%-uptake, higher-inspection-cost profile scored **32.06 and 36.80** with the same engine. The full prototype replay reproduced the archived output byte for byte. [Standalone source, fixtures, timing profiles and results](prototype-replay.zip)

The intermediate adaptive-ranking study measured one selected opportunity per draft. Its 47.64% Balanced and 45.49% Faster figures measured how often the intended word ranked first after a simulated preference shift. The corresponding modeled typing speeds were 30.29 and 30.27 WPM. [Adaptive results and scoring method](../writing-aid-adaptive/README.md)

In the original shorter-task replay the APK's Balanced mode incurred 1,597 inspections and 135 refresh taps. At the assumed costs these added 63.88 s and 40.50 s respectively. In the corrected replay, moving the inspection cost from 0 to 40 to 100 ms gives 31.63, 30.45 and 28.84 WPM for the same APK and the same actions. The break-even point against the manual control is about 75 ms per changed list in the corrected replay. This is a timing sensitivity estimate on the synthetic workload. [Seconds and sensitivity](version-comparison.json)

## Reproduce

From a checkout with the three Git revisions, the repository dependencies and Chromium installed, run the following. Set `CHROMIUM_PATH` if the browser is outside `/usr/bin/chromium`.

```sh
node scripts/writing-aid-version-audit.mjs
```

The command extracts the committed sources into a temporary directory, serves them locally, and writes `version-comparison.json`. It asserts exact agreement with the first integrated keyboard's archived fixed-slot score, the APK's original per-mode behavior aggregates, and the unchanged manual control. A separate run of the archived protocol reproduced every per-draft result for all 24 candidates plus both additional modes. The simulator uses the same exposed dataset for both revisions. It excludes confidence-qualified automatic spelling replacements, which have a separate personal-history experiment. [Audit script](../../../../scripts/writing-aid-version-audit.mjs) · [Personal correction results](personal-results.json)

To reproduce the standalone figures separately, extract `prototype-replay.zip` and run `node follow-up/typing.mjs` in the extracted directory. The SHA-256 of the regenerated `follow-up/typing.json` is `283c4d72afef5d79788758069798a82e4990495a00f3dd7b303140906c02483a`. [Prototype replay](prototype-replay.zip)
