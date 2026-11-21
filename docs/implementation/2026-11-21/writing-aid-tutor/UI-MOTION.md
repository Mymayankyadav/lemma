# Writing-aid layout and interaction evidence

`scripts/adaptive-writing-ui.mjs` exercised the production preview using the Android-default textarea. The five captures cover 320×640 at 160% text (Day), 390×844 (Night), 844×390 (Day), and 1280×800 in both themes. Reduced motion is enabled. The Android build does not register a service worker, so this preview omits registration as well. [Raw geometry, source and built-asset hashes](ui-motion.json) record the code and controls measured.

The floating spelling, notation and continuation controls, word slots, refresh, dismissal, and Undo were used to check the resulting text. The floating card remained within the viewport, did not overlap the keyboard, and caused no horizontal document overflow in each profile. Automatic-correction notices and Undo also fit; the measured Undo target was at least 44×44 CSS pixels. The 320 px case uses enlarged text, and the landscape card sits beside the keyboard over the transcript. Browser tests separately checked visible category labels and icons, distinct theme colors, and at least 4.5:1 contrast for the category labels in Day and Night, including hover.

| Profile | Tap continuation | Earlier fixed-row tap | Dismiss with X | Earlier dismissal through More |
| --- | ---: | ---: | ---: | ---: |
| 320×640, 160% text, Day | 323 ms | 314 ms | 348 ms | 657 ms |
| 390×844, Night | 344 ms | 314 ms | 353 ms | 657 ms |
| 844×390, Day | 303 ms | 323 ms | 394 ms | 599 ms |
| 1280×800, Day | 337 ms | — | 363 ms | — |
| 1280×800, Night | 337 ms | 316 ms | 363 ms | 702 ms |

These are modeled selection times, not measured human task times. The starting point is the center of the last typed key. The model uses a 130 ms Fitts-law intercept, 65 ms per bit, and a 75 ms scan cost per target. The earlier results come from `writing-aid/simulation.json`; no matching Day desktop baseline was captured. The new dismissal takes one modeled tap rather than the prior two, while the portrait continuation has a slightly longer modeled reach. Swipe does not accept suggestions; touch acceptance uses a tap, and desktop acceptance also supports Tab.

The screenshots and geometry establish what the browser rendered, not physical comfort, thumb reach, Android keyboard behavior, or learning outcomes. The test APK still needs an actual-device trial.

## Warm input-to-render timing

`scripts/adaptive-writing-latency.mjs` measures the production browser bundle at 390×844 from a native input event to the next animation-frame opportunity after the matching suggestion appears. Each surface has 16 warm observations at each CPU rate (128 total); nearest-rank p95 is therefore the largest observation. [Raw observations and built-asset hashes](ui-latency.json) are included. CPU throttling is a sensitivity check on this host, not an Android phone or WebView measurement, and does not measure physical typing or actual display presentation.

| Surface | 1× median / p95 | 6× CPU throttle median / p95 |
| --- | ---: | ---: |
| Word slots | 49.9 / 54.0 ms | 94.6 / 132.0 ms |
| Spelling card | 51.0 / 56.1 ms | 101.2 / 193.9 ms |
| Notation card | 50.7 / 56.3 ms | 104.0 / 221.2 ms |
| Faded continuation | 46.3 / 49.9 ms | 123.7 / 202.2 ms |

All 128 observations were below the 400 ms character interval assumed in the movement model. Cold startup and thermal behavior were not measured.
