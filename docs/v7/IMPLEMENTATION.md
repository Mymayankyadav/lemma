# Lemma v7 implementation decisions

The Owner authorized one combined `rules:` PR, Agent `owner-setup-v7`, for the whole attached plan, including all `[New]` features. This is an incremental working PR, not a claim that the redesign is complete. The Owner chooses the model and effort for each part before it starts; only Part 1 has been selected.

## Accepted constraints and gates

- Build behind `v7Shell`, initially off. Activate only after hardening and Owner gallery, golden-screen, responsive and physical-device gates. The Owner merges the rules PR. Retain all v6 code and styles for rollback, an explicit L6 exception; retain conditional Google Fonts fallback for v6/legacy. Preserve existing deep links and tests.
- Keep the five-link navigation landmark on immersive screens, visually hidden with keyboard reveal. Self-host v7 fonts. Canonical UI radii are 10, 14, 20, 28 and round; choose the nearest token, ties up, except chart marks.
- Persist v7 preferences and subject identity in a typed `settings.attention.v7` namespace, within the existing 4 KB section cap, with live/demo recursive-merge parity and stable creation timestamp plus ID allocation. Handle concurrent changes and capacity explicitly.
- Preserve the existing seven-day Today forecast RPC; the 14-day Review forecast is an additive frontend read. Atlas card counts derive from existing loaded records. Running Focus intention edits are recoverable device-local drafts; correct them after logging through the existing API.
- Today compressed cold first load must be at most 350 KB as a blocking deterministic check; timing metrics are reported without blocking. Design checks and byte accounting will be added to existing CI without weakening checks. No backend, migration, MCP, or new dependency changes.
- Gallery approval follows Part 3; six golden-screen approvals follow Part 5; responsive approval follows Part 11; physical-device approval precedes final activation. The new review paths are separate from the existing v6 baseline and review policy.

The later performance gate must measure actual cold Today transfers, including first-install service-worker precache traffic and self-hosted fonts, under a documented reproducible cache and network setup. CI should block the deterministic byte budget and v7 design invariants while reporting first paint, largest paint and main-thread timing separately; timing thresholds do not block. Preserve existing performance jobs and assertions. The exact probe and golden captures are implemented with the relevant screens, not by this foundation.

## Parts and proposed models

Only Part 1 is selected; later entries are proposals pending the Owner's choice.

1. Setup, baseline and integration — GPT-6.1 Terra, high (selected).
2. Tokens, typography, fonts, components and gallery — GPT-6.1 Sol, medium.
3. Mathematical emblems, motion, haptics and chart primitives — GPT-6.1 Terra, high.
4. Shell and Today, Focus, review-round, Calendar-Day and Path golden screens — GPT-6.1 Terra, xhigh.
5. Atlas golden canvas and worker — GPT-6 Astra, xhigh.
6. Remaining daily loop, capture, search and completion — GPT-6.1 Terra, high.
7. Calendar, planner, Tasks and day-close — GPT-6.1 Terra, xhigh.
8. Paths, New path, Checkpoint, Session, Cards and editor — GPT-6.1 Sol, medium.
9. Inbox and Plan proposal — GPT-6.1 Terra, high.
10. Progress, Log, Practice, Settings, subjects, sign-in, first-run and states — GPT-6.1 Sol, high.
11. Sizes and keys — GPT-6.1 Sol, high.
12. Performance, accessibility, rollback and default switch — GPT-6.1 Terra, xhigh.
13. Independent complete-PR review — GPT-6 Astra, xhigh.
