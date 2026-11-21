# Trial validation

This revision remains in PR #1738 for the owner's physical-device trial and model decision. No new Ready or production-release approval was posted.

| Check | Evidence |
| --- | --- |
| Frontend typecheck | `npm run typecheck` passed, including the final connector guard. |
| Broad unit run | 291 tests in 32 Tutor/Pad files passed. The later connector guard was checked with focused engine/context/composer regressions; these overlap the broad run and are not added to its count. |
| Browser flows | 68 distinct cases passed across the broad run and focused follow-ups. Seventeen affected cases were rerun on the production build after the connector fix. |
| Design lint | The specific fixed-position rule previously reported by CI passed on the new source. This is separate from the 68 product cases. |
| Static checks | Repository lint and V7 token, contrast, color-vision and alias checks passed. |
| Production build | Vite, PWA artifact verification and brand asset checks passed. |
| Tutor transport | Five MCP runtime tests passed through ordinary connector and bearer-grant paths, including round-trip writing metadata and unchanged reply fields. |
| Visual layout | Five Day/Night, phone, enlarged-text and landscape profiles passed target-size, contrast, clipping and keyboard-overlap checks. |

Browser coverage includes tap and desktop Tab; swipes that do not accept; selections and composition; default textarea and rich editor; hidden/stale proposals; the current tutor reply, source changes and invalid roles; owner preferences; two-acceptance personal corrections; exact Undo and Backspace recovery; draft clearing; and editing an earlier correction after its offset moves. The test-package bootstrap inserts its clearly labeled sample only if that demo thread does not already exist. It does not preload personal trust or change production data.

The MCP tests were executed with Deno 2.5.6 using `--no-check` after its standalone typecheck reported eight errors in unchanged adaptive/settings/write modules. All runtime assertions ran. The frontend typecheck passed independently. This does not claim that the repository-wide Deno typecheck is clean.

The [model report](README.md) distinguishes initial held-out results, the subsequently exposed Faster-mode defect, known-task regressions, fresh targeted probes and synthetic personal-correction calibration. Zero flagged exposures on those fixtures is not a universal study-safety guarantee. Matched validation replay found no incremental typing benefit from retaining the reward model in that fixture.

The [interaction and timing evidence](UI-MOTION.md) records host and simulated-touch measurements. The APK's own build record and SHA-256 accompany the workspace download. Physical Android latency, comfort, accidental acceptance and learning impact remain unmeasured; the APK is a test build, not a production deployment.
