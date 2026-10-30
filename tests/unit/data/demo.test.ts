// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
vi.mock("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url", () => ({
  default: new URL(
    "../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).href,
}));
import { DemoAdapter } from "../../../src/data/demo/adapter";
import { buildInsights } from "../../../src/lib/insights";
import { preview, scheduleConfig } from "../../../src/lib/fsrs";
import fixtureText from "../../../src/data/demo/fixture.json?raw";
import type { DemoStore } from "../../../src/data/demo/model";
const filter = {
  decks: [],
  sessionId: null,
  conceptSlug: null,
  includeNew: true,
  newOnly: false,
} as const;
const now = Date.parse("2026-10-29T12:00:00Z");
const make = () => new DemoAdapter({ now: () => now, timeZone: "UTC" });

describe("demo adapter", () => {
  it.each([
    ["UTC", "2026-10-29T04:01:00Z"],
    ["UTC", "2026-10-29T23:59:00Z"],
    ["Asia/Kolkata", "2026-10-28T22:31:00Z"],
    ["America/New_York", "2026-11-01T09:01:00Z"],
  ])("keeps seeded data consistent for %s at %s", async (zone, date) => {
    const instant = Date.parse(date),
      api = new DemoAdapter({ now: () => instant, timeZone: zone });
    const home = await api.getHome();
    expect(home).toMatchObject({ due: 23, pendingProposals: 6 });
    expect(home.projects.find((p) => p.slug === "real-analysis")).toMatchObject(
      { done: 3, total: 12 },
    );
    const decks = await api.getDeckTree();
    expect(decks.find((d) => d.key === "project:real-analysis")).toMatchObject({
      due: 14,
      children: expect.arrayContaining([
        expect.objectContaining({ key: "cp:real-analysis:CP4", due: 9 }),
        expect.objectContaining({ key: "cp:real-analysis:CP3", due: 5 }),
      ]),
    });
    expect(await api.getReviewItems({ ...filter, decks: [] })).toHaveLength(23);
    const atlas = await api.getAtlas();
    expect(atlas.concepts).toHaveLength(82);
    expect(
      atlas.concepts.filter((c) => c.status === "demonstrated"),
    ).toHaveLength(9);
    expect(atlas.concepts.filter((c) => c.status === "revisit")).toHaveLength(
      3,
    );
    expect(atlas.concepts.find((c) => c.slug === "compactness")).toMatchObject({
      status: "in_progress",
      dueCards: 9,
    });
    const insights = buildInsights(await api.getInsightData(30), 30, {
      now: instant,
      timeZone: zone,
      rolloverHour: 4,
    });
    expect(insights).toMatchObject({
      minutes: 1120,
      sessions: 26,
      reviews: 412,
      typicalSession: 38,
    });
    expect(Math.round(insights.recall! * 100)).toBe(91);
    expect(insights.calibration.map((c) => Math.round(c.rate! * 100))).toEqual([
      94, 71, 38,
    ]);
  });

  it("models V3 projects, stages, sources and the navigable concept hierarchy", async () => {
    const fixture = JSON.parse(fixtureText) as DemoStore;
    const analysis = fixture.projects.find(p => p.slug === "real-analysis")!;
    expect(analysis.targetDate).toBe("@date:84");
    expect(analysis.targetLabel).toBe("22 Jan");
    const cps = fixture.checkpoints.filter(cp => cp.projectId === analysis.id);
    expect(cps).toHaveLength(12);
    expect(new Set(cps.map(cp => cp.stage)).size).toBe(4);
    expect(fixture.checkpoints.every(cp => cp.dueOn?.startsWith("@date:"))).toBe(true);
    expect(fixture.checkpoints.filter(cp => cp.status === "demonstrated").every(cp => cp.demonstratedAt)).toBe(true);

    for (const project of fixture.projects) {
      const sources = fixture.sources.filter(s => s.projectId === project.id);
      expect(sources.length).toBeGreaterThanOrEqual(2);
      expect(sources.length).toBeLessThanOrEqual(4);
      expect(new Set(sources.map(s => s.kind)).size).toBeGreaterThan(1);
      expect(sources.some(s => s.planCheckedAt === null)).toBe(true);
    }

    const levels = (["cluster", "galaxy", "system", "planet", "moon"] as const)
      .map(level => fixture.concepts.filter(c => c.level === level));
    expect(levels.map(concepts => concepts.length)).toEqual([3, 6, 12, 46, 15]);
    const conceptIds = new Set(fixture.concepts.map(c => c.id));
    for (const concept of fixture.concepts) {
      if (concept.level === "cluster") expect(concept.parentId).toBeNull();
      else expect(conceptIds.has(concept.parentId!)).toBe(true);
    }
    for (const system of levels[2]) {
      expect(fixture.concepts.filter(c => c.parentId === system.id && c.isStar)).toHaveLength(1);
    }

    expect(fixture.notes).toHaveLength(90);
    for (const { note } of fixture.notes) {
      expect(note.front).not.toMatch(/^Explain .*\\(\\d+\\)\\.$/);
      expect(note.back).not.toContain("State the definition and justify the relevant hypotheses");
      expect(note.front.trim().length).toBeGreaterThan(12);
    }
  });
  it("shows session evidence and supports proposals and review undo", async () => {
    const api = make(),
      session = await api.getSession("real-analysis", 7);
    expect(session.summary).toMatchObject({ goalMet: "yes", minutes: 42 });
    expect(session.events).toHaveLength(4);
    expect(session.cards).toHaveLength(5);
    const proposals = await api.listProposals();
    const card = proposals.find(
      (p) => p.kind === "card" && p.card?.type === "cloze",
    )!;
    await api.approveProposal(card.id);
    const newRow = (await api.searchCards(card.card!.front)).find(
      (c) => c.front === card.card!.front,
    )!;
    expect((await api.getCard(newRow.noteNo)).cards).toHaveLength(2);
    const onlyNew = await api.getReviewItems({
      ...filter,
      decks: [],
      includeNew: false,
      newOnly: true,
    });
    expect(onlyNew.filter((r) => r.noteNo === newRow.noteNo)).toHaveLength(1);
    const plan = proposals.find((p) => p.kind === "plan_change")!;
    await api.approveProposal(plan.id);
    const path = (await api.getProject("real-analysis")).checkpoints;
    const cp4 = path.find((c) => c.code === "CP4")!;
    const cp4a = path.find((c) => c.code === "CP4a")!;
    const cp5 = path.find((c) => c.code === "CP5")!;
    expect(cp4.position).toBeLessThan(cp4a.position);
    expect(cp4a.position).toBeLessThan(cp5.position);
    expect((await api.getCheckpoint("real-analysis", "CP5")).prereqs).toContain(
      "CP4a",
    );
    await expect(api.approveProposal(plan.id)).rejects.toMatchObject({
      code: "conflict",
    });
    const item = (
      await api.getReviewItems({ ...filter, decks: [], newOnly: false })
    ).find((r) => r.noteNo !== newRow.noteNo)!;
    const next = preview(
      item.state,
      now,
      scheduleConfig(await api.getSettings()),
      { key: item.cardId },
    )[3].card;
    const { reviewId } = await api.recordReview({
      cardId: item.cardId,
      rating: 3,
      confidence: "sure",
      durationMs: 5000,
      next,
    });
    expect(await api.undoReview(reviewId)).toEqual(item.state);
    await expect(api.undoReview(reviewId)).rejects.toMatchObject({
      code: "conflict",
    });
  });
  it("rolls back an invalid multi-operation plan atomically", async () => {
    const fixture = JSON.parse(fixtureText) as DemoStore;
    const plan = fixture.proposals.find((p) => p.kind === "plan_change")!;
    plan.planChange!.ops.push({
      op: "prereq_add",
      code: "CP4a",
      prereq: "missing",
    });
    const api = new DemoAdapter({ fixture, now: () => now, timeZone: "UTC" });
    await expect(api.approveProposal(plan.id)).rejects.toBeDefined();
    expect(
      (await api.getProject("real-analysis")).checkpoints.filter(
        (c) => c.code === "CP4a" && c.ui !== "proposed",
      ),
    ).toHaveLength(0);
    expect((await api.listProposals()).some((p) => p.id === plan.id)).toBe(
      true,
    );
  });
  it("validates settings and isolates returned objects", async () => {
    const api = make(),
      settings = await api.getSettings();
    await expect(
      api.updateSettings({ learnSteps: "nonsense" }),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(await api.getSettings()).toEqual(settings);
    const home = await api.getHome();
    home.projects.length = 0;
    expect((await api.getHome()).projects).toHaveLength(3);
    const note = await api.createNote({
      projectSlug: "real-analysis",
      front: "Question?",
      back: "Answer",
      type: "basic",
      kind: "other",
    });
    const comment = await api.addComment(note.noteNo, "Check the wording");
    await api.dismissComment(comment.no);
    expect((await api.getCard(note.noteNo)).comments[0].status).toBe(
      "dismissed",
    );
    await api.updateNote(note.noteNo, {
      front: "{{c1::one}} and {{c2::two}}",
      type: "cloze",
    });
    expect((await api.getCard(note.noteNo)).cards.map((c) => c.ord)).toEqual([
      1, 2,
    ]);
    await api.setNoteStatus(note.noteNo, "suspended");
    expect((await api.getCard(note.noteNo)).note.status).toBe("suspended");
  });
  it("imports real PDF pages even when another operation rolls back during ingestion", async () => {
    const api = make(),
      project = (await api.getProject("real-analysis")).project;
    const bytes = await readFile(
      new URL("../../fixtures/sample.pdf", import.meta.url),
    );
    const phases: string[] = [];
    let rolledBack = false;
    const source = await api.addSource(
      project.id,
      new File([bytes], "example.pdf", { type: "application/pdf" }),
      (p) => {
        phases.push(p.phase);
        if (!rolledBack && p.phase === "reading") {
          rolledBack = true;
          void api.updateSettings({ learnSteps: "bad" }).catch(() => {});
        }
      },
    );
    expect(source).toMatchObject({ status: "ready", pageCount: 3 });
    expect(
      (await api.getProject("real-analysis")).sources.find(
        (s) => s.id === source.id,
      ),
    ).toMatchObject({ status: "ready", pageCount: 3 });
    expect(phases).toContain("reading");
    expect(phases).toContain("saving");
    expect(phases.at(-1)).toBe("done");
    const exported = JSON.parse(
      await (await api.exportAll()).text(),
    ) as DemoStore;
    expect(
      exported.sources
        .find((s) => s.id === source.id)
        ?.pages.map((p) => p.label),
    ).toEqual(["i", "1", "2"]);
    await api.deleteSource(source.id);
    expect(
      (await api.getProject("real-analysis")).sources.some(
        (s) => s.id === source.id,
      ),
    ).toBe(false);
  });
});
