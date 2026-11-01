/**
 * A pure, fail-closed merge decision for REST-only Steward agents.
 *
 * Supply GitHub REST check-runs for the PR's exact head SHA, commit statuses,
 * issue comments (chronologically or not), and fresh PR mergeability metadata.
 * This never performs a merge; the Steward still uses PUT /pulls/{n}/merge
 * with merge_method=squash and the exact head SHA after a fresh read.
 */
export interface MergeGateInput {
  headSha: string;
  draft: boolean;
  body: string;
  mergeable: boolean;
  mergeableState: string;
  leaseEligible: boolean;
  checkRuns: Array<{
    name: string;
    id?: number;
    headSha: string;
    status: string;
    conclusion: string | null;
  }>;
  commitStatuses: Array<{ context: string; state: string }>;
  auditComments: Array<{ body: string; createdAt: string }>;
  requiredChecks?: readonly string[];
}

export interface MergeGateResult {
  ok: boolean;
  reason: string;
}

const denied = (reason: string): MergeGateResult => ({ ok: false, reason });
// FIX #573: after Playwright moved out of check, absence of even one
// shard or the merged 144-PNG QA gate must block the Steward. Merely checking
// every reported job is not enough: GitHub may omit a missing check run.
const DEFAULT_REQUIRED_CHECKS = [
  "check", "mcp-sql",
  "e2e-1-of-4", "e2e-2-of-4", "e2e-3-of-4", "e2e-4-of-4",
  "qa3-screens",
] as const;

/** Reject missing, pending, cancelled, skipped, failed, or blocked CI. */
export function evaluateMergeGate(input: MergeGateInput): MergeGateResult {
  if (input.draft) return denied("Draft PR cannot be merged by REST-only agents");
  if (!input.leaseEligible) return denied("Lease is held by another active agent");
  // Planner PLAN drops require an explicit owner decision; a stale or
  // accidental Ready marker must never override the pending-approval guard.
  if (/Owner approval needed/i.test(input.body))
    return denied("Owner approval needed before merging");
  if (!/^Ready to merge\s*$/m.test(input.body))
    return denied("No standalone Ready to merge marker");
  if (!input.mergeable || input.mergeableState === "dirty")
    return denied("PR is not mergeable or has conflicts");

  // Use the latest attempt per job name. Older failed attempts must not
  // override a newer successful retry of the same exact-head job.
  const latest = new Map<string, MergeGateInput["checkRuns"][number]>();
  for (const run of input.checkRuns) {
    if (!run.name || run.headSha !== input.headSha)
      return denied("Missing name or check run is not on the exact head SHA");
    const previous = latest.get(run.name);
    if (!previous || (run.id ?? 0) >= (previous.id ?? 0))
      latest.set(run.name, run);
  }
  if (!latest.size) return denied("No exact-head check runs; fail closed");

  // Callers may add checks, but cannot override away the canonical seven.
  const required = [...new Set([...DEFAULT_REQUIRED_CHECKS, ...(input.requiredChecks ?? [])])];
  if (!required.length) return denied("Expected CI check set is empty");
  for (const name of required)
    if (!latest.has(name)) return denied(`Missing expected exact-head check: ${name}`);
  for (const run of latest.values()) {
    if (run.status !== "completed" || run.conclusion !== "success")
      return denied(`Exact-head check ${run.name} is not completed-success`);
  }
  for (const status of input.commitStatuses) {
    if (status.state !== "success")
      return denied(`Commit status ${status.context} is not successful`);
  }

  const markers = input.auditComments
    .map((comment, index) => ({ ...comment, index }))
    .filter((comment) => /^AUDIT (BLOCK|CLEAR)\b/.test(comment.body.trimStart()))
    .sort((a, b) =>
      Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.index - b.index,
    );
  const last = markers.at(-1);
  if (last && /^AUDIT BLOCK\b/.test(last.body.trimStart()))
    return denied("Unresolved AUDIT BLOCK; require later AUDIT CLEAR");

  // FIX #619: an explicit independent-Auditor acceptance gate is not met
  // merely because nobody has filed a BLOCK. The old rule allowed a Ready
  // PR with seven green jobs to merge before its requested independent audit.
  // Check the most recent acceptance section. PR descriptions can accumulate
  // multiple complete checklists across handoffs: the first may be checked
  // while a newer one explicitly revokes clearance (or vice versa).
  // Looking only at the first section lets stale approval bypass the gate.
  const acceptanceSections = [...input.body.matchAll(
    /(?:^|\n)#{2,4}\s+Acceptance checklist[^\n]*\n([\s\S]*?)(?=\n#{2,4}\s|\nNext step:|$)/gi,
  )];
  const currentChecklist = acceptanceSections.at(-1)?.[1] ?? input.body;
  if (/(?:^|\n)\s*-\s*\[\s\][^\n]*\bIndependent Auditor CLEAR\b/i.test(currentChecklist))
    return denied("Independent Auditor CLEAR acceptance remains unchecked");
  if (/\bIndependent Auditor CLEAR\b/i.test(input.body)) {
    if (!last || !/^AUDIT CLEAR\b/.test(last.body.trimStart()))
      return denied("Independent Auditor CLEAR required before merging");
    // An old CLEAR cannot approve a newer head. Require the Auditor's last
    // clearance to identify at least eight hex digits of the current head.
    // Short SHA prefixes are accepted because Auditor comments use them.
    const clearedHead = last.body.match(
      /\b(?:exact[- ]head|head(?: sha)?)\s*[:`]*\s*([a-f0-9]{8,40})\b/i,
    )?.[1];
    if (!clearedHead || !input.headSha.toLowerCase().startsWith(clearedHead.toLowerCase()))
      return denied("Independent Auditor CLEAR is missing for exact current head SHA");
  }

  return { ok: true, reason: "Exact-head checks, audit, lease and mergeability passed" };
}
