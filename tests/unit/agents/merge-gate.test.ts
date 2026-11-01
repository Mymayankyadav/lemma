import { readFileSync } from "node:fs";
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
const required = ["check", "mcp-sql", "e2e-1-of-4", "e2e-2-of-4", "e2e-3-of-4", "e2e-4-of-4", "qa3-screens"] as const;
const greenChecks = required.map(name => ok(name));
const ready = {
  headSha: sha,
  draft: false,
  body: "Owner: steward · Lease until 13:05 IST\nReady to merge\nNext step: squash",
  mergeable: true,
  mergeableState: "clean",
  leaseEligible: true,
  checkRuns: greenChecks,
  commitStatuses: [],
  auditComments: [],
};

describe("Steward exact-head merge gate (audit #493)", () => {
  it("requires all four Playwright shards and the QA-3b aggregate, even if unreported", () => {
    expect(evaluateMergeGate(ready).ok).toBe(true);
    for (const missing of required) {
      const verdict = evaluateMergeGate({ ...ready, checkRuns: greenChecks.filter(c => c.name !== missing) });
      expect(verdict.ok, missing).toBe(false);
      expect(verdict.reason).toContain(missing);
    }
    // An outdated Steward caller cannot override away the five new jobs.
    const bypass = evaluateMergeGate({ ...ready, checkRuns: [ok("check"), ok("mcp-sql")], requiredChecks: ["check", "mcp-sql"] });
    expect(bypass.ok).toBe(false);
    expect(bypass.reason).toContain("e2e-1-of-4");
  });

  it("fails closed on no check runs or missing expected jobs", () => {
    expect(evaluateMergeGate({ ...ready, checkRuns: [] }).ok).toBe(false);
    expect(evaluateMergeGate({ ...ready, checkRuns: [ok("check")] }).ok).toBe(false);
    expect(evaluateMergeGate({ ...ready, checkRuns: [ok("mcp-sql")] }).ok).toBe(false);
  });

  it.each(["queued", "in_progress", "pending"])("rejects %s checks", (status) => {
    expect(evaluateMergeGate({ ...ready, checkRuns: greenChecks.map(c => c.name === "mcp-sql" ? { ...c, status, conclusion: null } : c) }).ok).toBe(false);
  });

  it.each(["failure", "cancelled", "skipped", "timed_out", "neutral"])("rejects %s conclusions", (conclusion) => {
    expect(evaluateMergeGate({ ...ready, checkRuns: greenChecks.map(c => c.name === "mcp-sql" ? { ...c, conclusion } : c) }).ok).toBe(false);
  });

  it("rejects checks belonging to a different head SHA", () => {
    expect(evaluateMergeGate({ ...ready, checkRuns: greenChecks.map(c => c.name === "mcp-sql" ? { ...c, headSha: "b".repeat(40) } : c) }).ok).toBe(false);
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

  it("never merges a major plan PR still awaiting explicit owner approval", () => {
    const pending = { ...ready, body: "Owner approval needed\nReady to merge" };
    const verdict = evaluateMergeGate(pending);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/owner approval/i);
    expect(evaluateMergeGate({ ...ready, body: "owner approval needed\nReady to merge" }).ok).toBe(false);
    expect(evaluateMergeGate({ ...ready, body: "**Owner approval needed** — waiting for review\nReady to merge" }).ok).toBe(false);
    // Fail closed even if the marker appears in prose beside an affirmative Ready line.
    expect(evaluateMergeGate({ ...ready, body: "Policy: reject Owner approval needed markers\nReady to merge" }).ok).toBe(false);
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
    expect(evaluateMergeGate({ ...ready, checkRuns: [{ ...ok("check", 1), conclusion: "failure" }, ...greenChecks.map(c => c.name === "check" ? ok("check", 2) : c)] }).ok).toBe(true);
    expect(evaluateMergeGate({ ...ready, checkRuns: [...greenChecks, { ...ok("extra"), conclusion: "failure" }] }).ok).toBe(false);
  });
});


describe("documented Steward policy cannot regress silently", () => {
  it("requires expected nonempty CI and chronological Auditor clearance in the canonical prompt", () => {
    const prompts = readFileSync("docs/agents/prompts.md", "utf8");
    const steward = prompts.split("## 2. Fixer")[0];
    expect(steward).toContain("Nonempty exact-head CI set, fail closed");
    expect(steward).toContain("`check`");
    expect(steward).toContain("`mcp-sql`");
    for (const job of ["e2e-1-of-4", "e2e-2-of-4", "e2e-3-of-4", "e2e-4-of-4", "qa3-screens"]) {
      expect(steward).toContain("`" + job + "`");
    }
    expect(steward).toContain("zero check runs");
    expect(steward).toContain("AUDIT BLOCK");
    expect(steward).toContain("AUDIT CLEAR");
    const handbook = readFileSync("docs/agents/README.md", "utf8");
    expect(handbook).toContain("nonempty");
    expect(handbook).toContain("scripts/merge-gate.ts");
  });
});


describe("FIX #619: explicit independent Auditor CLEAR is a real merge gate", () => {
  const gated = { ...ready, body: ready.body + "\n- [x] Independent Auditor CLEAR" };
  const currentClear = { body: "AUDIT CLEAR — independently reviewed exact head `" + sha.slice(0, 8) + "`", createdAt: "2026-11-01T04:20:00Z" };

  it("rejects a Ready, 7/7 green PR whose external Auditor gate has no CLEAR", () => {
    const result = evaluateMergeGate({ ...gated, auditComments: [] });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/auditor clear/i);
    const external = { ...ready, body: ready.body + "\nIndependent Auditor CLEAR remains an external merge gate" };
    expect(evaluateMergeGate(external).ok).toBe(false);
  });

  it("rejects an unchecked Auditor acceptance item even if a CLEAR comment exists", () => {
    const unchecked = { ...gated, body: ready.body + "\n- [ ] Independent Auditor CLEAR" };
    expect(evaluateMergeGate({ ...unchecked, auditComments: [currentClear] }).ok).toBe(false);
  });

  it("rejects stale or unscoped CLEAR and accepts an exact-current-head CLEAR", () => {
    const old = { ...currentClear, body: "AUDIT CLEAR — independently reviewed exact head `" + "b".repeat(8) + "`" };
    expect(evaluateMergeGate({ ...gated, auditComments: [old] }).ok).toBe(false);
    expect(evaluateMergeGate({ ...gated, auditComments: [{ ...currentClear, body: "AUDIT CLEAR — reviewed" }] }).ok).toBe(false);
    expect(evaluateMergeGate({ ...gated, auditComments: [old, currentClear] }).ok).toBe(true);
  });

  it("uses the current acceptance checklist, not stale unchecked historical handoff notes", () => {
    const body = ready.body + "\n### Acceptance checklist\n- [x] Independent Auditor CLEAR\nNext step: merge"
      + "\n### Earlier handoff\n- [ ] Independent Auditor CLEAR pending at old head";
    expect(evaluateMergeGate({ ...ready, body, auditComments: [currentClear] }).ok).toBe(true);
  });

  it("rejects a newer unchecked checklist even if an older checklist was checked", () => {
    const body = ready.body
      + "\n### Acceptance checklist\n- [x] Independent Auditor CLEAR\nNext step: old head"
      + "\n### Acceptance checklist\n- [ ] Independent Auditor CLEAR\nNext step: latest head";
    const result = evaluateMergeGate({ ...ready, body, auditComments: [currentClear] });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/acceptance remains unchecked/i);
  });

  it("uses the newest checked checklist when an older repeated checklist was unchecked", () => {
    const body = ready.body
      + "\n### Acceptance checklist\n- [ ] Independent Auditor CLEAR\nNext step: old head"
      + "\n### Acceptance checklist\n- [x] Independent Auditor CLEAR\nNext step: current head";
    expect(evaluateMergeGate({ ...ready, body, auditComments: [currentClear] }).ok).toBe(true);
    expect(evaluateMergeGate({ ...ready, body, auditComments: [{ ...currentClear, body: "AUDIT CLEAR — old head bbbbbbbb" }] }).ok).toBe(false);
  });

  it("does not impose a new blanket audit requirement on unrelated Ready PRs", () => {
    expect(evaluateMergeGate(ready).ok).toBe(true);
  });
});

describe("FIX #619b: Steward must actually invoke the exact-head gate", () => {
  it("keeps the canonical Steward prompt tied to the executable gate and logged fail-closed verdict", () => {
    const prompts = readFileSync("docs/agents/prompts.md", "utf8");
    const steward = prompts.split("## 2. Fixer")[0];
    expect(steward).toContain("evaluateMergeGate");
    expect(steward).toContain("log the gate result");
    expect(steward).toContain("ok=false");
    expect(steward).toContain("fresh REST PR body");
    expect(steward).toContain("chronologically ordered Auditor comments");
  });

  it.each([
    ["NOTIF-3a #634", "- [ ] Independent Auditor CLEAR (requested; no outstanding AUDIT BLOCK)"],
    ["NOTIF-3b #635", "- [ ] Independent Auditor CLEAR"],
  ])(
    "replays the actual %s unchecked independent-clearance checklist",
    (label, clearanceItem) => {
      const body = [
        "Owner: builder-2 · Lease until 13:40 IST",
        "### Acceptance checklist",
        "- [x] Exact-head npm check and seven required CI jobs green",
        clearanceItem,
        "Next step: Auditor independently review exact head before merge",
        "Ready to merge",
      ].join("\n");
      const result = evaluateMergeGate({ ...ready, body, auditComments: [] });
      expect(result.ok, label).toBe(false);
      expect(result.reason).toMatch(/independent auditor clear/i);
    },
  );
});
