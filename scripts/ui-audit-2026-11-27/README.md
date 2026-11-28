# Lemma dark-mode UI audit

The default run exercises every applicable scene at all 15 viewport sizes. It records measurements for every visited screen and transition, and saves **at most eight review images** across the entire run. The viewport screenshots and keyboard crops retain one image pixel per CSS pixel. The motion example shows up to three frames with their times.

## Run the audit

From the repository root, install the locked dependencies, Playwright Chromium and Python Pillow. The runner builds the production app with flag overrides enabled for the fixture profiles and the kit.

```sh
npm ci
npx playwright install chromium
python3 -m pip install Pillow
node scripts/ui-audit-2026-11-27/run-all.mjs
```

Each invocation creates a fresh `run-*` directory under `AUDIT_OUT` (default `artifacts/ui-audit-2026-11-27`). Open `run.json` for the devices, profiles, stages, filters and failures. The archive includes the machine-readable reports and an `index.json` listing each image with its path, dimensions and archive part. A failed build, scene, interaction or subprocess makes the run exit nonzero.

| Option | Effect |
|---|---|
| `AUDIT_IMAGES=compact` | Default. Five viewport images, the Gboard and iPadOS keyboard crops, and one Capture transition strip. Only the standard profile writes these examples. A filtered run can produce fewer. |
| `AUDIT_IMAGES=none` or `METRICS_ONLY=1` | Measure all selected paths, including frame changes in memory, with zero saved images. |
| `AUDIT_IMAGES=all` | Opt in to per-scene viewport and scroll captures, keyboard images, interaction crops, discovered screens and motion strips. |
| `--devices=all` | Accepts `phones`, `tablets`, or a comma-separated list of device IDs from `lib.mjs`. |
| `--profiles=standard,reduced,beta,beta-reduced` | Default. Crosses the shipped and beta transition settings with the normal and reduced OS motion preference. Each profile has its own reports. |
| `--scenes=task-editor-more,exam-row-edit` | Select catalogue seeds for capture, hardware Tab traversal, pointer styles and discovery. Discovery follows states reachable from the seeds. |
| `--cases=sheet-capture-open,workspace-history-back` | Select named motion recordings. The tutor and Pad keyboard passes have their own state sequences. |
| `--skip=sweep,keyboard,states,motion,zip` | Omit named stages for a focused run. `--dry` lists the commands. |
| `AUDIT_URL`, `CHROMIUM_PATH`, `AUDIT_TEXT` | Use an existing production preview, a local Chromium executable, or a system text size in percent. |

## Coverage and evidence

| Stage | What it exercises |
|---|---|
| `coverage.mjs` | Reads the app's route declarations and mode definitions. Checks both forms of the optional Pad route, the unmatched route, exact tab and view values, demo profiles and duplicate scene IDs. |
| `capture.mjs <device> [id or group …]` | Opens the real route, runs each setup action, and records entry motion, transition events and pixel changes. Measures focus rings, tap targets, text and surface contrast, clipped text, horizontal overflow, rail alignment and bottom-bar overlap. Includes deep links, seeded account and native-app screens, first-use, stress, loader and error states. |
| `sweep.mjs <device> [id …]` | Replays each catalogue seed and explores enabled controls on newly reached pages, dialogs, menus, tabs and inline forms until the queue is empty. Each branch starts with fresh local data. The graph stores the originating scene, replay actions, destination, observed motion, system boundaries and errors. Repeated fixture IDs and calendar dates share a route pattern. View, tab and section values remain distinct. |
| `motion.mjs <device> [case …]` | Measures cold entries, warm route changes, Back, sheet entry and dismissal, menu handoffs, swipe and spring-back, keyboard and pen surfaces, Atlas camera movement, task reorder, review grade and undo. JSON contains compositor-frame pixel differences and input-relative timing, CSS and Web Animations, frame gaps and layout shifts. Finite effects still running at the end of the observation and continuous animations are identified in the trace. |
| `keyboard.mjs <device> [tutor or pad or hardware]` | Exercises tutor key layers, shift and lock, suggestions, long press, repeat, maths categories, pin, hide, ink and device-keyboard mode. Opens each rendered Pad category and inserts a template. Hardware Tab visits each focus stop until the cycle repeats on each prepared scene. |
| `states.mjs <device> [id …]` | Measures rest, hover, press and focus-visible styles for each distinct control style on the prepared screen, including controls below the fold. Records real pointer hover motion and a separate touch sticky-hover probe. |
| `agg.py`, `package.py` | Aggregate the selected device reports and package review evidence. The archive applies the same compact image list as the capture scripts. |

The device matrix covers 320–430 px portrait phones, two landscape phones, Android tablets and three iPad sizes in both orientations, plus a 1440 px pointer desktop. The reference iPad measures 820 × 1148 and 1180 × 788. The scripts use a fixed study date, local demo data, a mocked account for signed-in surfaces and a native bridge fixture for Android screens. Real OS keyboards, permission dialogs, external sign-in and provider responses require a separate device or service check.

Discovery has no default control or depth cutoff. For a diagnostic subset, pass `--max=12` or `--max-states=2` to `sweep.mjs`. Deferred work is counted and yields a nonzero exit. `--strict` also fails on a discovered address pattern missing from the catalogue. Read the edges and errors alongside the static gate when assessing reachability.

```sh
node --test scripts/ui-audit-2026-11-27/audit.test.mjs
```

The report and two image archives in `docs/v7/ui-audit-2026-11-27` describe the original November 27 capture. The optional palette preview and legacy strip/contact-sheet helpers are available for inspecting that evidence.
