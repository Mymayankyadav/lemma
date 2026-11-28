# UI audit image archive (2026-11-27)

Images for `docs/v7/ui-audit-2026-11-27.md`. Two zip files (the 100 MB per-file limit and the size of a PR); unzip both into one folder. Every image is lossy WebP at **1× CSS pixels** (the captures themselves are 2× PNG; `scripts/ui-audit-2026-11-27/capture.mjs` regenerates them). Night only.

| Folder | What it holds |
|---|---|
| `screens/<device>/<scene>.webp` | The viewport frame of each scene. `<scene>.full.webp` is the whole page when it scrolls (full-catalogue devices only: `phone-s`, `phone-p`, `phone-l`, `ipad-p`, `ipad-l`); `close-day*.end.webp` is the end of the scroll where a fixed bar covers content. Scene ids are in `scripts/ui-audit-2026-11-27/catalog.mjs`. |
| `keyboard/<device>/` | Tutor keyboard and Pad maths-keyboard states (`NN-<state>.webp` for the page, `.kb.webp` for the keyboard crop) and the hardware-keyboard Tab and shortcut frames (`hw-*`). |
| `sweep/<device>/` | Control sweep: one image per control that opened a route, overlay, state or inline expansion (`<scene>/<index>-<control>-<effect>.webp`), and `crawl/` for routes the sweep found. |
| `motion-keyframes/` | Keyframe strips, `<device>-<interaction>.webp`: before, +40, +80, +120, +160, +240, +360, +520 and +800 ms, with the frame-to-frame difference. `beta-phone-p-*` are the same route changes with Beta testing on. |
| `interaction-states/` | Rest, hover and press crops (`<scene>-<n>-rest|hover|press`) and keyboard-focus crops (`<scene>-focus<k>`) on an iPad with a pointer. |
| `palette-preview/` | Before, tokens only (A) and tokens plus fixes (B), for four screens on `phone-p` and `ipad-l`. |
| `data/` | `audit/<device>.json` (measurements per scene), `keyboard/<device>.json`, `sweep/<device>.json`, `motion/*.json` (animations, frames, summaries), `palette/summary.json`. |

## Which zip holds what

**`ui-audit-images-1.zip`** (2365 files): `data` (43), `keyboard` (1089), `screens/ipad-l` (276), `screens/ipad-p` (250), `screens/phone-l` (314), `screens/phone-p` (295), `screens/phone-xs` (98)

**`ui-audit-images-2.zip`** (1782 files): `interaction-states` (392), `motion-keyframes` (130), `palette-preview` (24), `screens/desktop` (90), `screens/ipad-mini-l` (92), `screens/ipad-mini-p` (98), `screens/ipad-pro-l` (90), `screens/ipad-pro-p` (92), `screens/phone-s` (300), `screens/phone-xl` (92), `screens/phone-xl-l` (92), `screens/tablet-s-l` (92), `screens/tablet-s-p` (90), `sweep` (108)

The device sizes and what each exercises are in `docs/v7/ui-audit-2026-11-27.md` §2. Devices other than the five full-catalogue ones were captured with the `core` set (one scene per route plus the drawers) plus the deep-link, loading and empty / stress scenes.
