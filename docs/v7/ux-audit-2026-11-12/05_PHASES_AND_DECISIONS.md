# Phases, order and Owner decisions

**Revised 12 Nov 2026, evening, on commit `1a67b04`**, after the Android app (N123), Motion v1 (N124) and the phone-report fixes (N125). One page version: `visuals/13-phase-map.jpg`. Sizes are relative effort for one engineering agent with review (S about a day, M two to four days, L a week or more), not dates.

Phase names: web **U0–U4**; assets **G0–G1** and changes to A1–A5; Android **AN1–AN4**. The Android app shows the web screens, so the web phases are also Android phases.

---

## 1. Order

| Step | Phases | Why now |
|---|---|---|
| **Now** | **U0** Truth · **U2** Resilience (= AN2) · **AN1** Make the built app right · **G0** Refresh what is stale | The app is in people's hands: wrong numbers, large-text collisions, an export that cannot save and a missing update path are live on the phone |
| **Next** | **AN3** Feel (haptics, launch, back, offline made visible) · **U1** Large screens · **G1** Pipeline | Cheap changes with a large effect on how the app feels; desktop and tablets after phones |
| **Then** | **U3** Room and rhythm · **AN4** Large screens and postures · **A2′** Marks · **A5′** Share pages | Needs U1's layout rules |
| **Later** | **U4** Signature, one flag at a time · **A4** · A3 only if needed | Design-led; each starts with an approved sheet |
| **Parked by the Owner** | Widgets · server-sent notifications · document scanner | Revisit only on a new decision (§4) |

**Dependencies**

* **U0, U2 and AN1 gate nothing and need no design decision.** They can start today, in parallel.
* **AN4 needs U1** (the width rules are shared).
* **Every web change reaches the phone only with the next APK.** CI publishes one on each merge to main once the signing secrets are added; AN1's "About this app" is what makes those updates visible.
* U3 and U4 change two of the six golden phone screens (Calendar Day, Path) and Today; those need re-approval when their flags are proposed for default-on.

---

## 2. Phase summaries

| Phase | Size | Goal | Acceptance in one line |
|---|---|---|---|
| **U0 Truth** | M | Nothing on screen is untrue or visibly broken | Each open item has a test that fails on `1a67b04`; V01 and V04 already done |
| **U2 Resilience = AN2** | M | The web layer holds for Android users | 360 px at 100%, 130%, 200% clean; 48 px in the app; first load ≤ 350 KB (proposed); a device check at the largest font |
| **AN1 Built app right** | M | Export saves a file, the app shows its version and updates, reminder kinds are truthful, welcome sheet, Study mode in one trip, drift as a card | Each on a device; a backup opens from Files |
| **G0 Refresh** | S | No stale screenshot or colour | Install screenshots and labels v7; `index.html` pre-paint colours v7 |
| **AN3 Feel** | M | The app feels native | Haptic vocabulary fired; splash released on first paint; WebView background themed; back preview on Today; "as of" chips |
| **U1 Large screens** | L | Desktop and tablet are designed, not stretched | No element under the rail, no sideways scroll, prose ≤ 34 em, chart text 12 px at 1280 and 1728 |
| **G1 Pipeline** | M | Every asset generated, listed and linted | Manifest complete; Android colours from tokens; icon layers split |
| **U3 Room and rhythm** | M | First viewports are content | Targets on board 07 |
| **AN4 Large screens** | M | Tablets, foldables, postures | Fold, unfold and rotate keep state; nothing on a hinge |
| **U4 Signature** | L | The ruler, the ∎, the spread and scratch paper, paper and sky, desk clock | Each flag: approved sheet, reduced-motion and keyboard paths |
| ~~A1 Motion v1~~ | — | Done in N124 | Remaining items moved to AN3 (haptics) and U4 (∎, stamps) |
| ~~N‑1 Match v7~~ | — | Done in N123 (icon, colours) | Remaining items in G0 |

---

## 3. Owner decisions

| # | Decision | Recommendation | Status |
|---|---|---|---|
| **E1** | Treat U0, G0 and AN1 as fixes that need no new visual approval | Yes | Open, needed now |
| **E2** | Desktop direction: page and margin, the review spread, task columns | Approve from board 08; approve six desktop goldens at the end of U1 | Open |
| **E3** | The ∎ as the single mark of completion | Approve from board 05; build behind `v7Qed` | Open |
| **E4** | "Coded first" for animation; no Lottie or Rive unless an SVG prototype fails | Approve. N124 already followed it | Effectively taken |
| **E5** | Honour the system font size in the app, capped at 200% | Approve; first confirm how the WebView behaves today (device check 1) | Open, needed for U2 |
| **E6** | Touch size 48 px in the app, 44 px on the web | Approve | Open, needed for U2 |
| ~~E7~~ | Widget looks and "On my desk" | — | **Lapsed**: widgets parked |
| **E8** | Phone landscape: support it (one-row headers, desk clock for Focus) or lock phones to portrait | Lock to portrait in the app now (one manifest line); support landscape later with the desk clock | Open, needed for U2 |
| **E9** | Paper and sky in Appearance | Approve as a small flag after U0–U2 | Open |
| **E10** | Scratch paper in review | Experiment behind `v7Scratch` | Open |
| **E11** | First-run order: subject, rhythm, then the tutor connection | Approve | Open |
| **E12** | Android launch: readable in 1 s, live in 2 s on a mid-range phone; web first load ≤ 350 KB | Approve as targets; CI budgets stay an Owner `rules:` PR | Open |
| ~~E13~~ | Store listing sign-off | — | **Lapsed**: no Play Console |
| **E14** | How the app saves a backup: the Android share sheet (choose Drive, Files, email; no permission) or straight to Downloads | Share sheet | New, needed for AN1 |
| **E15** | What "Check for updates" does: open the release page only, or also one quiet request a day to the public releases feed, with a dot on Settings when a newer APK exists | Start with the link; add the daily check with a line in the privacy page | New, needed for AN1 |
| **E16** | Reminder kinds the phone cannot deliver: hide them in the app, or show them under "In your Inbox on this phone" | Show them, grouped and without switches | New, needed for AN1 |
| **E17** | Whether the haptic vocabulary is on by default in the app | On, following the system's touch feedback and Lemma's Haptics switch | New, needed for AN3 |

**Already decided by the Owner (12 Nov 2026):** D3 (Notebook icon), D10 (Capacitor), D11 (Capacitor and its official plugins only), D12 (no server changes), D13 (Study mode and calendar, opt-in), no Play Console, and widgets, server push and the scanner deferred. This plan works inside all of them.

---

## 4. Parked by the Owner

| Item | What is ready if the decision changes |
|---|---|
| Home-screen widgets | Board 09 (looks, the week as a constellation, Next step, five states). For information: the platform's own widget classes need no library and could show values the app last computed, with "as of" |
| Server-sent notifications | The voice rules and wording table in the first version of the Android plan (board 10) |
| Document scanner | A filmstrip of pages with reorder and retake |

---

## 5. How this fits the repository's rules

* **Stage.** v7 is released, so U0 items are `bug` issues with reproduction steps from the audit and a regression test that fails without the fix.
* **Flags.** U1's margin, U3 and U4 are new work behind flags in `src/flags.ts`, default off, hardened once per feature. Suggested flags: `v7Margin`, `v7Room`, `v7Ruler`, `v7Qed`, `v7Spread`, `v7Scratch`, `v7Paper`, `v7DeskClock`.
* **Dependencies.** None. AN1's export and AN3's launch and back changes use the existing native plugin and Capacitor's own APIs.
* **Server.** None.
* **Protected paths.** `android/**`, `src/platform/**`, `scripts/**` (except `scripts/ci/**` and the stress scripts) are ordinary paths. Wiring new lint passes into CI, changing the Android workflow or a budget is an Owner `rules:` PR.
* **Records.** Each item writes its note under `docs/current/`.

### Suggested items for NEXT.md (titles only; the priority run assigns ids)

1. *Android app: export that saves, About this app, truthful reminder kinds, welcome sheet, Study mode in one trip* (AN1).
2. *Fix the v7 audit's open truth defects* (U0: Today's hours, the two counts, the dock slot, the almanac, button order, codes, Data and account).
3. *Text scale, 360 px, 48 px in the app, landscape decision, first-load split* (U2).
4. *Haptic vocabulary, splash on first paint, themed WebView background, back preview on Today* (AN3).
5. *Install screenshots and pre-paint colours* (G0).
6. *Large screens: rail, measure, charts* (U1), then *page and margin* (flag).

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| The device-only findings are wrong | `03_ANDROID_UX_PLAN.md` §5: eight checks, under half an hour on one phone |
| Web fixes reach the phone slowly | AN1's update notice; batch fixes into each APK |
| The signature layer distracts from fixes | U0, U2 and AN1 come first and need no design decision |
| Re-approving golden screens slows U3 | Only Calendar Day and Path change, with before/after sheets |
| Scores are one reviewer's judgement | Each is tied to named findings; the sweep and re-check scripts are in `evidence/tools/` |

---

## 7. Definition of done

* A re-audit with the same method scores **phone ≥ 8.5, desktop ≥ 8, Android conditions ≥ 8**, with no Major finding open.
* In the Android app: a backup can be saved; the version and an update path are visible; every reminder switch does what it says; the largest system font leaves every screen usable.
* The rendered design lint covers 360 px at 130% text and 1280 px.
* Every ending in the product is the same small square.

---

## 8. r3 additions (commit `d741617`)

**Order.** Phase **G2 · Illustration, motion and icon polish** (size M) runs beside U0, U2 and AN1; it touches different files. First the animation bugs (LT1, LT3, LT6) and the Night fix (IL1), then the redraws and rules, then the icon map; the Android icon part (P7) goes with AN1.

**Decisions.**

| # | Decision | Recommendation | Needed by |
|---|---|---|---|
| **E18** | Night: illustration objects lighter than their disc (one token) | Approve | G2 start |
| **E19** | ✓ = nothing is waiting, ∎ = you finished something; Round complete gets a still and ending with ∎ | Approve | G2 |
| **E20** | Day closed stays until Done (or 5 s), the same with or without motion | Approve | G2 start |
| **E21** | Icons: 1.75 px at every size, one meaning per glyph, six new drawn marks | Approve the rule; review the six marks on one sheet | G2 |
| **E22** | Lottie guard rails: skip on Save-Data and 2G; warm the player in idle time near an ending | Approve | G2 |
| **E23** | Android: one shortcut recipe, distinct tile glyphs, ∎ in the themed icon | Approve | AN1 |

**Superseded by Owner decisions since r2:** E4 (“coded first”) for the three shipped moments (D7, N129); the r2 recommendation to use marks instead of illustrations (D6, N127–N128).

**Suggested NEXT.md items (titles only).** *Fix the A3 endings: never erase, crisp at 3×, Day closed stays, Round complete outline* (P4, P5). *Night tonal order and three illustration redraws* (P1, P2, P3). *One icon stroke and one meaning per glyph* (P6). *Android shortcut and tile icons* (P7, with AN1).
