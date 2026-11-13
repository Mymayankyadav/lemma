## incident #1376 The web splash carried fixed paper colours (13 Nov 2026)

N133 (#1366) made `index.html` take its pre-paint paper colours from the build (`__PAPER_DAY__` and `__PAPER_NIGHT__`,
filled in by `vite.config.ts`). Its test forbids any fixed paper hex in `index.html`. N131 (#1364) merged after it
with the L-20 web splash, whose CSS hard-coded the legacy and v7 papers (`#FAFAF6`, `#13171D`, `#F8F5F0`, `#091023`).
That turned `tests/unit/v7/n133-app.test.tsx` › "index.html takes them from the build, not a fixed hex" red on main.

The pre-paint script now also sets `--lemma-paper` to the paper it has already chosen for the build and theme, and the
splash paints `background: var(--lemma-paper)`. `index.html` has no fixed paper hex and still exactly two placeholders
of each kind, as N133's test requires. In the built page the splash is `#FAFAF6` (Day) and `#13171D` (Night) in a
legacy-default build, and the v7 papers in a v7 build, the same as the browser's theme colour. The ink colours are
unchanged.
