# v6 reviewed source: Inbox bottom chrome repair

5 November 2026. This is a corrected standalone demonstration and source handoff. The production repository, MCP deployment and live database were not changed. The original uploaded HTML/ZIP were not modified.

## Reproduced problem

The supplied Android screenshot matches the Inbox route in the original v6 artifact. Three source decisions combine to cause it:

1. `SOURCE/owners/design-system.css` explicitly hides main navigation on `body[data-lemma-page=proposals]`.
2. The session-accessory component in `SOURCE/modules/53__index-DcUkykC4.js` returns null for `#/proposals`.
3. A higher-specificity `#main-content [data-ui=proposal-actions]` sticky rule overrides the later fixed action-bar rule.

At a 390×844 CSS-pixel viewport, the original has hidden navigation, no timer accessory, and sticky decisions at y=622–687 with empty space below. This was reproduced before changing source. It is not an image edit or a change to proposal content.

## Source repair

- Remove the Inbox-specific navigation and timer exclusions.
- Export a small `NotebookActionBar` portal owner from the shared index module and use it in `SOURCE/modules/23__Page-RJ1UO7Rb.js`.
- Keep the action bar at document-body level so route transforms/filters cannot create an incorrect fixed-position containing block.
- Remove the conflicting sticky rule. Anchor actions directly above the measured navigation/timer stack, with safe-area horizontal padding.
- Reserve the combined chrome/action height in content flow, account for actions in keyboard-focus reveal, and place feedback above the complete stack.
- Preserve existing decision handlers, draft/approval/Undo behavior, Day/Night roles, compact navigation, native dialogs, and all 78 import identifiers.

In the corrected 390×844 inspection, decisions occupy y=670–735, the active timer y=735–784, and five-way navigation y=784–844. Heights are measured at runtime rather than hard-coded to those coordinates.

## Validation performed

| Check | Result |
| --- | --- |
| New rendered regression on original v6 HTML | Expected failure: actions are not a viewport-level portal; original navigation is hidden and timer missing. |
| Corrected Chromium viewport matrix | Eight cases pass: 320×640, 360×640, 390×763, 390×844 Night, 390×844 Day, 390×844 at 200% text in both themes, 844×390 landscape. |
| Additional rendered lifecycle checks | Pause/Resume, edit/Escape, leaving/returning to Inbox, live viewport resize, inactive-timer removal, scroll compaction and feedback placement pass. |
| Retained source/module checks | 23 pass; all 78 module contracts link. |
| Retained state/component regressions | 53 pass: 26 original, 10 follow-up, 17 re-audit. |
| Retained effort selector regression | Pass: cross-midnight, partial hours, duplicate identity, legacy durations, overlaps and pause/break/commit. |
| JavaScript syntax | 84 production source files and 12 executable HTML scripts parse. |
| CSS and token contrast | Two stylesheets parse; 48 selected token contrast pairs pass. |
| Deterministic pack/verify | Pass; generated HTML matches source byte for byte. Current SHA-256 is in BUILD_MANIFEST.json. |

Evidence: `validation/inbox-chrome/`, `validation/review-fix/`, and the retained audit/mobile-redesign validation directories. Run `python SOURCE/tests/inbox-chrome.browser.py` for the new regression. It uses Python Playwright and `/usr/bin/chromium`, serves only the detached demo, and blocks external font/CDN requests.

External fonts were blocked, so rendered evidence uses fallback fonts. These checks establish this Inbox repair in Chromium; they do not establish physical Android/iOS, IME, screen-reader, full-route accessibility, or production Supabase/MCP acceptance. The original v6 audit reports and older screenshots remain historical evidence. Native integrations remain deferred.

## Data/MCP plan revision

`PLANNING/` contains the revised direction plan, normative data/MCP contract, current schema inventory, and capability registry. They account for 26 existing tables/310 columns, 35 prototype state keys and 16 new resource contracts. They require full owner-data maintenance through shared app/MCP commands and explicit synchronization. This is planning coverage, not a claim that the detached demo or deployed MCP already implements those contracts.

Use the revised plan and this repaired reference when porting the UI. Do not copy the removed Inbox hiding/sticky rules downstream. Do not replay historical apply/continue scripts over current source.
