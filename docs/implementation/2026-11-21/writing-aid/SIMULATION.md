# Writing aid interaction simulation

The integrated tutor keeps the preferred word in the center of three stationary slots. On the 390-pixel phone layout, promoting it to the slot nearest the last key saved 34 pixels on the trip to a choice and yielded effectively the same modeled entry speed. Floating it above that key saved 65 pixels and 14 milliseconds per acceptance on average, including the change in the move back to the next key. Its geometric position intersected letter keys on 18 of 54 primary acceptances and other word slots on 47 of 54. The stationary strip stays adjacent to the letter keys throughout typing. [Measurements](simulation.json)

## Placement replay

The workload was 16 previously held-out synthetic proof continuations, with 1,307 characters to enter and eight deliberately incorrect claims. The replay follows the word choices the actual engine offers. On each typed character it advances the composer’s learner evidence. On acceptance it applies the exact proposal and preserves the production continuation budget. Acceptances must match the intended continuation exactly and save at least two characters. A deterministic draw with a nominal 75% uptake accepted 62 of 93 eligible choices in Balanced, 89 of 124 in Faster typing, and five of seven in Strict. Every final draft matched its intended text, including the incorrect claims. [Drafts](replay-drafts.jsonl)

| Viewport and text size | Slot size in CSS px | Fixed travel / motor | Nearest slot travel / motor | Floating travel / motor |
| --- | ---: | ---: | ---: | ---: |
| 320 × 640 at 160% | 73 × 44 | 118 px / 227 ms | 93 px / 220 ms | 63 px / 210 ms |
| 390 × 844 at 100% | 97 × 44 | 131 px / 223 ms | 97 px / 224 ms | 66 px / 209 ms |
| 844 × 390 at 100% | 106 × 44 | 133 px / 220 ms | 93 px / 220 ms | 64 px / 207 ms |
| 1280 × 800 at 100% | 207 × 44 | 202 px / 219 ms | 122 px / 226 ms | 84 px / 212 ms |

The table reports Balanced means. The model starts at 30 WPM, or 400 ms per character with five characters per word. Pointing uses the distance between centers and the target width along that approach, with `130 + 65 × log₂(1 + distance / width)` milliseconds per tap. Motor time accounts for the next manual key’s approach relative to its ordinary typed predecessor. Each accepted choice adds 75 ms of inspection. Promoting swaps the preferred candidate into the nearest fixed slot. The floating candidate uses the same row height, a width up to 120 pixels, and a four-pixel gap above the last typed key. These constants model interactions from the measured rectangles. [Code](../../../../scripts/writing-aid-simulation.mjs)

The stationary 390-pixel strip produced 33.65 modeled WPM in Balanced, 37.94 in Faster typing, and 30.26 in Strict. Switching the Balanced primary slot would relocate an identical offer across 45 of 73 successive keystrokes. With zero extra reorientation, the stationary, nearest and floating layouts modeled 33.65, 33.65 and 33.71 WPM. Adding 25 ms per acceptance in the moving layouts yielded 33.65, 33.54 and 33.60. The small idealized moving-target gain is sensitive to that inspection assumption. The comparison isolates word placement. Spelling, notation and ghost acceptance are sampled below.

At 390 pixels the fixed Balanced replay generated 321 new lists that the learner continued typing past. A 15 ms glance per list reduced modeled speed to 33.31 WPM. A 40 ms glance reduced it to 32.75 WPM. If 2% or 5% of accepts with an alternative instead use the measured wrong-word-and-undo path and finish the word manually, the corresponding estimates are 33.55 and 33.41 WPM. Those probabilities are sensitivity inputs. Human acceptance, thumb travel and reorientation remain for the phone trial. [Sensitivity grid](simulation.json)

## Choosing, keeping and recovering

Chromium touch input exercised all seven paths on each touch viewport. The times below include the same pointing model and 75 ms of reading per action. The distances sum the trip from the last letter and any moves between controls.

| Path on the 390-pixel layout | Actions | Modeled distance / time |
| --- | ---: | ---: |
| Accept `notation` from the center slot | 1 | 52 px / 270 ms |
| Choose `notate`, then Undo suggestion to restore `notat` | 2 | 261 px / 561 ms |
| Open More, then choose `notation` | 2 | 502 px / 698 ms |
| Accept `teh` → `the` in the editor review row | 1 | 154 px / 340 ms |
| Open More and keep `teh` | 2 | 364 px / 657 ms |
| Accept `eps` → `ε` in `Let eps` | 1 | 168 px / 340 ms |
| Accept ` the question` after `could you restate` | 1 | 121 px / 314 ms |

The inline replacement shows the typed text with a strike-through before the proposed text. More exposes full alternatives and Keep what I typed. The direct ghost action and desktop Tab apply the exact faded suffix. Undo restores the learner’s input. Selection movement, pasted text, IME composition and a read-only answer leave the suggestion surface inactive for the affected draft. [Dark correction](phone-night.png) · [Alternatives](phone-alternatives.png) · [Faded continuation](phone-ghost.png)

## Browser responsiveness and coverage

On a warm production preview, the interval from the final native input event to the next frame opportunity after the matching choice entered the DOM was 49.9 ms median and 50.7 ms p95 at 1× CPU. At 6× desktop CPU slowdown it was 83.8 ms median and 117.9 ms p95. Each rate had 16 observations across word, spelling, notation and faded continuation. All 32 fit the modeled 400 ms typing interval. Each prior prefix settled before the timed key. These are Chromium measures on the development machine with the writing assets loaded. Installed WebView latency and cold loading on the phone remain unmeasured. [Timing samples](simulation.json)

Playwright exercised the checkpoint composer with Day and Night palettes, reduced motion, 160% text, narrow and standard phone layouts, short landscape and desktop. The suite covered the exact proposed text and undo round trips, focus and tab behavior, stable press bounds, stale pointer release, native Chromium IME, protected proof gaps, read-only drafts, preference persistence and handoff into the ordinary keyboard. Existing chat, math keyboard and inline-drawing checks retained their geometry and editing assertions. The landscape test caught a clipped alternatives panel, now anchored to the visible pane. The stale press test caught a generic button scale, now overridden so all three targets keep their full hit area. [320-pixel Day](narrow-day.png) · [Landscape](landscape-day.png) · [Landscape alternatives](landscape-alternatives.png) · [Desktop Night](desktop-night.png)

## Reproduce

Use a Vite source server for the exact engine imports. Use the separate production preview for the visual captures, touch paths and input responsiveness. The replay draws only from the bundled synthetic fixture.

```sh
VITE_ALLOW_FLAG_OVERRIDES=1 VITE_FLAGS=-v6Shell,-v7Shell npm exec vite -- --port 4184
VITE_ALLOW_FLAG_OVERRIDES=1 VITE_FLAGS=-v6Shell,-v7Shell npm run build
npm run preview -- --port 4187
WRITING_AID_URL=http://localhost:4184/lemma/ \
  WRITING_AID_CAPTURE_URL=http://localhost:4187/lemma/ \
  node scripts/writing-aid-simulation.mjs
npm exec playwright -- test tutor-writing-aid.spec.ts v7-tutor-keyboard.spec.ts \
  v7-tutor-chat.spec.ts v7-tutor-inline-editor.spec.ts
```

Run the two servers in separate terminals. `CHROMIUM_PATH` can point to a system executable. `WRITING_AID_OUTPUT` can place the captures and JSON outside the repository.
