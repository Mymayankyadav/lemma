import {describe, expect, it} from "vitest";
import {DemoAdapter} from "../../../src/data/demo/adapter";
import {LiveAdapter} from "../../../src/data/live/adapter";
import type {LemmaApi} from "../../../src/data/api";

describe("DB-4 additive contract stubs", () => {
  it("keeps old adapters assignable while new methods fail explicitly and safely", async () => {
    const adapters: LemmaApi[] = [new DemoAdapter(), new LiveAdapter()];
    for (const adapter of adapters) {
      for (const operation of [
        () => adapter.createProjectDraft({title:"New study"}),
        () => adapter.updateSubject("subject-1", {name:"Algebra"}),
        () => adapter.mergeSubjects("subject-1", "subject-2"),
        () => adapter.updateSource("source-1", {kind:"notes"}),
        () => adapter.listPlanRevisions("algebra"),
      ]) await expect(operation()).rejects.toMatchObject({code:"not_implemented"});
    }
  });
});
