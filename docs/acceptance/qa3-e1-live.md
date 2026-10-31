# QA-3bc — E1 live-network acceptance (independent split)

**Scope:** `docs/spec/stress.md` E1 only. This is a reproducible, owner-scoped, intercepted-live-HTTP acceptance record; it is **not** final QA-3b acceptance. The hard-budget, A–I behavioral and 144-image gates remain open in QA-3bb #545.

## Contract and evidence

| E1 requirement | Evidence in the merged test | Result on main `8a532574` |
| --- | --- | --- |
| Extreme (X-like) Today makes at most **3** data requests | `tests/e2e/live-api-budget.spec.ts` loads `?demo=0`, intercepts actual `/rest/v1/` HTTP, requires one `bootstrap` and one `home_summary` and asserts `withinBudget(today,3)` | PASS |
| Extreme (X-like) Insights makes at most **1** data request | Same test clicks the actual Insights link after Today, records the new HTTP slice, requires exactly one `/rpc/insights` request | PASS |
| Neither screen transfers more than **200 KiB** | Uses `Buffer.byteLength(JSON.stringify(response))` for every intercepted response, sums the Today responses and checks the Insights response independently against `200*1024` | PASS |
| Live adapter rather than zero-request demo | Explicit `?demo=0`; mock owner session; checks Today made nonzero requests and rejects unexpected REST endpoints or whole-table reads | PASS |
| 360/390 px and both Graph worlds | Four independent Chromium cases, Graph and Graph-night at 360 and 390 px; captures Today and Insights screenshots | PASS |
| Fail closed on excess count/bytes | The test rejects four Today calls, and rejects 250 KiB split across two calls; accepts three 50 KiB responses | PASS |

**Exact-head provenance:** GitHub Actions [CI #41229635840](https://github.com/Mymayankyadav/lemma/actions/runs/41229635840) on main commit [`8a532574`](https://github.com/Mymayankyadav/lemma/commit/8a532574688c8b558a5a2d1190dbc61625c16cbc), run on **31 October 2026**. `e2e-2-of-4` job `124621039653` reports all five `live-api-budget.spec.ts` cases PASS (the negative test and four live HTTP configurations); that shard reports 122 passes. The seven required jobs completed successfully on this head. **This is a source- and CI-verified record, not a local Playwright run.**

### Reproduce

```sh
npm ci
npx playwright test tests/e2e/live-api-budget.spec.ts --project=chromium --retries=0
```

The test uses a fabricated owner UUID, fabricated JWT-like fixture token, and intercepted `auth/v1` and `rest/v1` responses. It does not call the owner's live Supabase backend, use a connector address, print secrets or mutate production data. It exercises the real LiveAdapter over browser HTTP, with realistic X-like aggregates (60 projects, 300,000 reviews and 40 subjects), not 300,000 individual downloaded rows. Its response-byte budget is based on mock HTTP payload bytes; it is **not** a measured production CDN transfer.

## Limitations / handoff to QA-3bb

- E1 is accepted for the **faithfully intercepted live adapter** permitted by the QA-3bb checklist, not as an authenticated production-network audit. Recheck after changes to LiveAdapter, the aggregate RPCs or their contracts.
- The current test covers the stricter X-like data shape; it does not independently run a second S-sized live fixture. The S/X demo screenshot and CPU matrices remain QA-3bb's responsibility.
- E2–E4 Insights layout and number formatting are separate. FIX #579 / PR #582 is still pending.
- All-route cold 4× CPU and hard-budget release acceptance remain blocked by #548 and #516. Atlas C2 first-attempt acceptance is tracked by #581. **Do not mark QA-3b PASS based on this E1 record alone.**
- Final QA-3bb #545 should link this evidence after QA-3bc merges and change only the E1 *network* cell from pending to verified; leave the section E overall INCOMPLETE until E2–E4, screenshots, budgets and Auditor clearance are complete.

Assisted-by: ChatGPT (OpenAI)
Co-authored-by: ChatGPT <noreply@openai.com>
