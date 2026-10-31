import { describe, it, expect } from "vitest";
import {
  advanceQueue,
  buildQueue,
  filterReviewItems,
  nextCard,
  remaining,
} from "../../../src/lib/queue";
import { card, NOW, settings } from "./fixtures";
const build = (items: ReturnType<typeof card>[]) =>
  buildQueue(items, settings, { now: NOW });
describe("review queue", () => {
  it("puts due learning first, waits for future learning and never mutates input", () => {
    const q = build([
      card("review"),
      card("learning", {
        state: { state: 1, due: new Date(NOW).toISOString() },
      }),
    ]);
    const first = nextCard(q, NOW);
    expect(first.item?.cardId).toBe("learning");
    expect(remaining(q)).toBe(2);
    expect(remaining(first.queue)).toBe(1);
    const future = build([
      card("future", {
        state: { state: 3, due: new Date(NOW + 3600000).toISOString() },
      }),
    ]);
    expect(nextCard(future, NOW)).toMatchObject({
      item: null,
      waitUntil: NOW + 3600000,
    });
  });
  it("interleaves one new after ceil(reviews / (new+1)) reviews", () => {
    let q = buildQueue(
      [
        ...Array.from({ length: 6 }, (_, i) => card(`r${i}`)),
        ...Array.from({ length: 2 }, (_, i) =>
          card(`n${i}`, { state: { state: 0 } }),
        ),
      ],
      { ...settings, mixDecks: false },
      { now: NOW },
    );
    const types = [];
    for (let i = 0; i < 3; i++) {
      const pick = nextCard(q, NOW);
      types.push(pick.item?.state.state);
      q = pick.queue;
    }
    expect(types).toEqual([2, 2, 0]);
  });
  it("buries sibling ordinals even across new and review pools", () => {
    const q = build([
      card("a", { noteId: "same", ord: 1 }),
      card("b", { noteId: "same", ord: 2, state: { state: 0 } }),
      card("c"),
    ]);
    expect(q.total).toBe(2);
  });
  it("mixes checkpoints when another eligible review exists", () => {
    let q = build([card("a"), card("b"), card("c", { checkpointCode: "CP2" })]);
    const a = nextCard(q, NOW);
    q = a.queue;
    expect(nextCard(q, NOW).item?.cardId).toBe("c");
  });
  it("requeues the same learning card after a durable grade and respects learn-ahead", () => {
    const first = nextCard(build([card("a")]), NOW);
    const q = advanceQueue(
      first.queue,
      first.item!,
      {
        ...first.item!.state,
        state: 3,
        due: new Date(NOW + 60000).toISOString(),
      },
      NOW,
    );
    expect(q.answered).toBe(1);
    expect(nextCard(q, NOW).item?.cardId).toBe("a");
    const graduated = advanceQueue(
      first.queue,
      first.item!,
      {
        ...first.item!.state,
        state: 2,
        due: new Date(NOW + 86400000).toISOString(),
      },
      NOW,
    );
    expect(nextCard(graduated, NOW).item).toBeNull();
  });
  it("enforces daily limits and applies deck, session, concept and new-only filters", () => {
    const items = [
      card("a"),
      card("b", { projectSlug: "topology", checkpointCode: "CP2" }),
      card("c", { state: { state: 0 } }),
    ];
    expect(
      buildQueue(items, { ...settings, reviewsPerDay: 1 }, { now: NOW }).total,
    ).toBe(1);
    const filter = {
      decks: [] as "project:analysis"[],
      sessionId: "s7",
      conceptSlug: "compactness",
      includeNew: true,
      newOnly: false,
    };
    expect(
      filterReviewItems(items, filter, {
        sessionForCard: { a: "s7", b: "s8" },
        conceptsForCard: { a: ["compactness"], b: ["compactness"] },
      }).map((i) => i.cardId),
    ).toEqual(["a"]);
    expect(
      filterReviewItems(items, {
        ...filter,
        sessionId: null,
        conceptSlug: null,
        decks: ["project:analysis"],
        newOnly: true,
      }).map((i) => i.cardId),
    ).toEqual(["c"]);
    expect(
      filterReviewItems(items, {
        ...filter,
        sessionId: null,
        conceptSlug: null,
        includeNew: false,
      }).map((i) => i.cardId),
    ).toEqual(["a", "b"]);
  });
});

it("keeps due learning within a tight daily limit and mixes across new/review pools", () => {
  const learning = card("learn", { state: { state: 1 } });
  const q = buildQueue(
    [
      card("old", { state: { due: new Date(NOW - 86400000).toISOString() } }),
      learning,
    ],
    { ...settings, reviewsPerDay: 1 },
    { now: NOW },
  );
  expect(nextCard(q, NOW).item?.cardId).toBe("learn");
  let mixed = build([
    card("r1"),
    card("r2", { checkpointCode: "CP2" }),
    card("n1", { state: { state: 0 } }),
  ]);
  const first = nextCard(mixed, NOW);
  mixed = first.queue;
  expect(first.item?.cardId).toBe("r1");
  expect(nextCard(mixed, NOW).item?.cardId).toBe("r2");
});

it("holds the session interleaving ratio stable as queues shrink", () => {
  let queue = buildQueue(
    [
      ...Array.from({ length: 5 }, (_, i) => card(`r${i}`)),
      ...Array.from({ length: 2 }, (_, i) =>
        card(`n${i}`, { state: { state: 0 } }),
      ),
    ],
    { ...settings, mixDecks: false },
    { now: NOW },
  );
  const order = [];
  for (let i = 0; i < 7; i++) {
    const pick = nextCard(queue, NOW);
    order.push(pick.item?.state.state);
    queue = pick.queue;
  }
  expect(order).toEqual([2, 2, 0, 2, 2, 0, 2]);
});
