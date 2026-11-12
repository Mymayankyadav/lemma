# Owner decisions

| # | Decision | Recommendation | Needed by |
|---|---|---|---|
| D1 | Adopt the audit's typography and colour **numbers** (serif titles 30/36, display 40/44, Easy = indigo with a star…) or keep the approved kit's numbers and adopt only the **rules** (one voice per job, one meaning per colour). | Keep the kit's numbers; adopt the rules. Revisit numbers after release with real-device evidence. | Start of R1 |
| D2 | Re-approve the six golden phone screens that R0–R2 change (Today, Review, Calendar Day, Path at least). | Approve once, at the end of R2, from side-by-side old/new images. | End of R2 |
| D3 | App icon direction: A Compass, B Constellation, C Notebook. | **A · Compass**, Night as default installed icon. | Start of R2 |
| D4 | Emblem system v2 direction (the family sheet). | Approve the eight families and the three-tier rule; final tuning by the engineer against the sheet. | Start of R2 |
| D5 | The 350 KB first-load budget: split the eagerly loaded v6 pages now (weakens three v6 performance tests) or in the switch PR when v6 becomes the rollback. | In the switch PR. Ship R3 with the measured number recorded. | R3 |
| D6 | Illustration style for empty states (three samples). | Line-art "notebook" style; choose after samples. | Start of A2 |
| D7 | New dependency for Lottie/Rive (player choice and budget). | dotLottie web player, lazy-loaded, ≤ 60 KB; Rive only if the focus orbit is approved. | Start of A3 |
| D8 | Who makes the A2–A5 assets: agent-drawn (SVG/code), a freelance illustrator/motion designer, or both. | Agent for icons, textures, emblem work and simple marks; a human motion designer and illustrator for L- and IL- series. | Before A2 (so work can run in parallel) |
| D9 | Release criteria: re-audit score ≥ 8 and no Major findings, plus device and screen-reader checks. | Yes. | R3 |
| D10 | Move the Android app from the TWA to **Capacitor** (same package, same Play listing; users sign in again once). | Yes, after the web release. | Before N0 |
| D11 | New dependencies for Android: Capacitor core and plugins, Firebase messaging, ML Kit document scanner, Glance widgets. | Approve as a set, with the list in `05_ANDROID_APP_PLAN.md` §10. | Before N0 |
| D12 | Server changes for Android: `device_tokens` table, FCM transport in `notify`, `widget_summary` RPC. | Approve; reviewed like any `supabase/**` change. | Before N1 |
| D13 | Study mode (Do Not Disturb / Android Modes during focus) and device calendar sync: build them, and if so opt-in only. | Build both, opt-in, off by default. | Before N5 |
| D14 | How web updates reach the app: Play releases only, or an over-the-air bundle updater later. | Play releases with staged rollout first; revisit after N7. | N7 |
| D15 | Test devices: a Pixel on Android 16 and a Samsung phone (the Owner's or a tester's). | Needed for N0 acceptance. | N0 |
