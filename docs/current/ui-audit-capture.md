## UI audit capture tool (2026-11-20)

`npm run audit:ui` (`scripts/ui-audit/`) captures the phone, night-theme UI as captioned contact sheets for image-only review:
about 110 scenes (every route and sheet, plus flows: add task, time block, card and thought; new path; review round to the end;
Inbox to zero; focus start to save; settings rows; time of day, offline and 130% text) in an empty account (`?demo=first-use`
plus empty tab-scoped demo stores) and a populated one (`?demo=1`); `--profiles heavy` adds `?demo=stress` for list screens.
Output goes to `artifacts/ui-audit/` (git-ignored). No app code changed and no dependency was added; see `scripts/ui-audit/README.md`.
