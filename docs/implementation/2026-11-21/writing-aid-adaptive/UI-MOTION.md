# Rendered geometry and modeled interaction time

Run `WRITING_AID_URL=http://127.0.0.1:4190/lemma/ node scripts/adaptive-writing-ui.mjs` against the app's Vite source server. The script captures the real keyboard and floating controls in four viewport/theme/text-size profiles, performs tap, refresh, dismissal and undo paths, checks the resulting draft, and writes `ui-motion.json` plus screenshots. The earlier `writing-aid/simulation.json` is the fixed-row baseline.

These are **modeled selection times**, not measured human task times. The starting point is the center of the last typed key. Fitts-law assumptions are a 130 ms intercept and 65 ms per bit, with 75 ms scan cost per target. Swipe sensitivity adds a 56 px stroke at 150/300/600 px per second and 80 ms release cost, after reaching the input. Text entry assumes 30 WPM, five characters per word, or 400 ms per character. Results do not include a human attention study or phone input latency.

| Rendered profile | Tap continuation, new | Tap continuation, old | Dismiss with X, new | Dismiss through More, old |
| --- | ---: | ---: | ---: | ---: |
| 320×640, 160% text, Day | 343 ms | 314 ms | 348 ms | 657 ms |
| 390×844, Night | 344 ms | 314 ms | 354 ms | 657 ms |
| 844×390, Day | 304 ms | 323 ms | 394 ms | 599 ms |
| 1280×800, Night | 338 ms | 316 ms | 363 ms | 702 ms |

On the 390 px phone geometry, a swipe costs approximately 474–754 ms across the tested stroke-speed assumptions, versus 344 ms for the floating tap. The requested swipe is an additional direct gesture, not an evidence-backed claim that swiping is always faster. Tap remains available. Direct dismissal removes one tap and roughly 303 modeled milliseconds on that profile; refresh is also a single nearby control. The small extra portrait reach for the floating continuation is visible in the table rather than hidden by a blanket improvement claim.

All four captured profiles had no horizontal document overflow, kept the floating card within the viewport, and left the keyboard uncovered. The 320 px profile checks enlarged text. Short landscape uses the transcript-side column; the card must be dismissed if the learner wants to read the covered transcript region. Stationary word targets avoid moving the destination while a finger is held; holding an outdated target never accepts its replacement.

The JSON includes the exact control rectangles, complete paths, swipe sensitivities and error-cost sensitivity. Wrong choices can erase any motor saving: the model must count recovery and retained unwanted text, not just taps avoided. Screenshots establish the rendered appearance, not comfort, thumb reach, haptics or study quality. Those remain explicit goals of the physical-device APK test.

## Warm input-to-render timing

`scripts/adaptive-writing-latency.mjs` measured the final production browser bundle with the Android-default textarea at 390×844. It times the native input event to the next animation-frame opportunity after the matching suggestion appears. Each surface has 16 observations at each CPU rate (128 total); the nearest-rank p95 is therefore the largest observation. The lazy engine is warmed first. [Raw observations and built-asset hashes](ui-latency.json)

| Surface | 1× median / p95 | 6× CPU throttle median / p95 |
| --- | ---: | ---: |
| Word slots | 50.2 / 63.0 ms | 92.6 / 352.7 ms |
| Spelling card | 50.7 / 52.0 ms | 101.5 / 389.2 ms |
| Notation card | 50.9 / 93.9 ms | 108.1 / 224.7 ms |
| Faded continuation | 46.0 / 47.6 ms | 130.6 / 370.0 ms |

All observations were below the modeled 400 ms character interval. CPU throttling is a sensitivity check on this host, not an emulation of the owner's Android hardware; cold startup, thermal behavior, actual paint presentation and physical typing speed are not measured here.
