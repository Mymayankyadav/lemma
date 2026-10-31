import { describe, expect, it } from "vitest";
import { evaluateMergeGate } from "../../../scripts/merge-gate";

const sha = "a".repeat(40);
const ok = (name: string, id = 1) => ({
  name,
  id,
  headSha: sha,
  status: "completed",
  conclusion: "success",
});
const ready = {
  headSha: sha,
  draft: false,
  body: "Owner: steward · Lease until 13:05 IST\nReady to merge\nNext step: squash",
  mergeable: true,
  mergeableState: "clean",
  leaseEligible: true,
  checkRuns: [ok("check"), ok("mcp-sql")],
  commitStatuses: [],
  auditComments: [],
};

describe("Steward exact-head merge gate (audit #493)", () => {
  it("fails closed on no check runs or missing expected jobs", () => {
    expect(evaluateMergeGate({ ...ready, checkRuns: [] }).ok).toBe(false);
    expect(evaluateMergeGate({ ...ready, checkRuns: [ok("check")] }).ok).toBe(false);
    expect(evaluateMergeGate({ ...ready, checkRuns: [ok("mcp-sql")] }).ok).toBe(false);
  });

  it.each(["queued", "in_progress", "pending"])("rejects %s checks", (status) => {
    expect(evaluateMergeGate({ ...ready, checkRuns: [ok("check"), { ...ok("mcp-sql"), status, conclusion: null }] }).ok).toBe(false);
  });

  it.each(["failure", "cancelled", "skipped", "timed_out", "neutral"])("rejects %s conclusions", (conclusion) => {
    expect(evaluateMergeGate({ ...ready, checkRuns: [ok("check"), { ...ok("mcp-sql"), conclusion }] }).ok).toBe(false);
  });

  it("rejects checks belonging to a different head SHA", () => {
    expect(evaluateMergeGate({ ...ready, checkRuns: [ok("check"), { ...ok("mcp-sql"), headSha: "b".repeat(40) }] }).ok).toBe(false);
  });

  it("rejects an unresolved Auditor block even when checks are green", () => {
    expect(evaluateMergeGate({ ...ready, auditComments: [{ body: "AUDIT BLOCK — missing regression", createdAt: "2026-10-31T06:00:00Z" }] }).ok).toBe(false);
  });

  it("accepts a later Auditor clear, but not an earlier one", () => {
    const block = { body: "AUDIT BLOCK — fix", createdAt: "2026-10-31T06:10:00Z" };
    const clear = { body: "AUDIT CLEAR — verified", createdAt: "2026-10-31T06:20:00Z" };
    expect(evaluateMergeGate({ ...ready, auditComments: [block, clear] }).ok).toBe(true);
    const earlyClear = { ...clear, createdAt: "2026-10-31T06:00:00Z" };
    expect(evaluateMergeGate({ ...ready, auditComments: [block, earlyClear] }).ok).toBe(false);
  });

  it("requires a standalone Ready marker, not a mere mention", () => {
    expect(evaluateMergeGate({ ...ready, body: "Next step: not Ready to merge yet" }).ok).toBe(false);
  });

  it("rejects conflicts, drafts, ineligible leases and failing commit statuses", () => {
    expect(evaluateMergeGate({ ...ready, mergeable: false }).ok).toBe(false);
    expect(evaluateMergeGate({ ...ready, draft: true }).ok).toBe(false);
    expect(evaluateMergeGate({ ...ready, leaseEligible: false }).ok).toBe(false);
    expect(evaluateMergeGate({ ...ready, commitStatuses: [{ context: "security", state: "pending" }] }).ok).toBe(false);
  });

  it("uses the newest attempt of a named check and still checks all other jobs", () => {
    expect(evaluateMergeGate({ ...ready, checkRuns: [{ ...ok("check", 1), conclusion: "failure" }, ok("check", 2), ok("mcp-sql")] }).ok).toBe(true);
    expect(evaluateMergeGate({ ...ready, checkRuns: [ok("check"), ok("mcp-sql"), { ...ok("extra"), conclusion: "failure" }] }).ok).toBe(false);
  });
});
