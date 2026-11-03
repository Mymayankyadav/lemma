# OPS3 practical admission acceptance record

Scope: OPS3-ACCEPT / PR [#775](https://github.com/Mymayankyadav/lemma/pull/775), requested by the Owner on 3 November 2026 while scheduled agents were paused. Author execution: [run:6593968935](https://github.com/Mymayankyadav/lemma/issues/455#issuecomment-6593968935). This is an implementation/verification record, not an ACTIVE event, independent CLEAR, completed deployment or fabricated 24-epoch result.

## Evidence and disposition

| Requirement | Evidence / disposition |
| --- | --- |
| Accepted preparation and governance | #765 and #769 Owner-authorized merges remain accepted; no retroactive premerge CLEAR requirement |
| CI timing policy | CIg #762 merged as 6536bba3721510e946be66042619488c0495712d; main explicitly adopts 2s transitions/4s cold renders with 4× CPU and zero performance retries |
| Known scheduled cohort pause | Actual task peek readbacks: all five R1 sources disabled, next start null, latest invocation completed; [durable source/run table](https://github.com/Mymayankyadav/lemma/issues/770#issuecomment-6594096368) |
| Existing source ACK capability | [R1 supplemental ACK evidence](https://github.com/Mymayankyadav/lemma/issues/770#issuecomment-6583907643): source-local GitHub reads/comments proven; code write/reviewer independence not inferred |
| Unexposed runtime maximum | Proposed accepted work-policy route in runtime-admission.md; honest unknown provider ceiling and runtime_verified=false; source route preserved |
| Future invocation identity | One-time claim-on-start ticket with actual RUN and labelled invocation identity; complete binding readback and normal scope claim remain required |
| Early dispatch | Source-preserving correction for #771/#772 offsets; nominal timestamp no longer a false lower bound; actual-start budgets and known ceilings still enforced |
| Independent release | evaluateRelease remains unchanged; missing CLEAR, copied/contributor/merger lineage, stale revision and later BLOCK rejection tests preserved |
| Functional verification | Native Node 24: 117 scenarios pass; zero failures/skips; new negative admission/binding cases plus retained control/claim/release checks |
| Real operational trial | Not performed under this candidate amendment; schedules remain paused; tests are synthetic rehearsal, not runtime receipts |
| Stabilization | 24 healthy post-activation epochs remain to be observed; old idle shadow checks/local loops do not count |

## Provenance and scope

The early-start defect and observed offsets were previously documented by run:6583779308 in #772 at a72b786013be069059a99db647a030a25b0e4b66. This PR reimplements that correction in the broader timing-route validator and adds native tests; retain that source lineage in independent review exclusions. #772 is not declared merged or closed by this PR. #775's author cannot independently CLEAR its implementation.

No application, notification SQL, migrations, production thresholds, deployment workflow, schedule cadence/time zone/enabled state or ordinary autonomous release gate is changed by this amendment. Repository policy values 30 minutes/5 minutes are explicit voluntary work limits, not new claims about platform guarantees. A material runtime policy change requires accepted source/registry updates.

## Remaining sequence

1. Accept the exact candidate through ordinary release evidence or a specific Owner-authorized integration. Publish final head, checks and actual missing evidence honestly.
2. Compute the amended canonical digest (including runtime-admission, dispatch and setup), install/read back coherent startup in the authorized paused cohort, and record actual policy basis and verified role capabilities. Preserve pause until the Owner authorizes resumption.
3. Reconcile scoped known claims/heads, publish valid cohort-bound predecessor/control records and a future bindable packet. Do not demand an invented all-source census or falsely certify hypothetical process death.
4. During an authorized scoped trial, obtain actual RUN/BIND/claim/action/checkpoint receipts and a real eligible reviewer path. Keep unrelated compatible work available.
5. Measure healthy post-activation epochs. Report actual source/runtime, review, release and verification limitations; never convert an accepted waiver into a passing test.

## Separate postmerge deployment finding

CIg's automatic Supabase run [41566452638](https://github.com/Mymayankyadav/lemma/actions/runs/41566452638), job 125689080954, failed Apply migrations: the CLI refused local 20261102052000_notify_candidates_ranked_reuse.sql because it precedes the last remote migration. Pages run 41566452629 succeeded; CI was still running at this observation. This is a concrete migration-order deployment follow-up, not proof that v3 agent admission failed. No manual production command, migration-history edit, reset or blanket --include-all was issued in this execution. Deployment acceptance remains unverified until that actual issue is resolved under its proper scope.

