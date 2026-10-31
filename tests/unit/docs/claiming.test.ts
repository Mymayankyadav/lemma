import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("REST-only agent claim instructions", () => {
  it("never directs agents to open an unmergeable draft PR", () => {
    const plan = read("plan.md");
    expect(plan).not.toMatch(/\b(?:open|create)\s+(?:a\s+)?draft\s+PR\b/i);
    expect(plan).not.toMatch(/\bdraft\s+PR\s+titled\b/i);
    expect(plan).toMatch(/draft:\s*false/);
    expect(plan).toContain("Owner: <role> · Lease until <HH:MM IST>");
  });

  it("keeps the handbook and AGENTS.md aligned with non-draft REST claims", () => {
    expect(read("AGENTS.md")).toMatch(/never a draft/i);
    expect(read("docs/agents/README.md")).toMatch(/never open draft PRs/i);
  });
});
