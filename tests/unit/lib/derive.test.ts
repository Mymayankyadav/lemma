import { describe, it, expect } from "vitest";
import {
  checkpointUi,
  projectProgress,
  sessionDisplay,
  recheck,
  conceptStatus,
  dueToday,
  dueTomorrow,
} from "../../../src/lib/derive";
import {
  studyClock,
  studyDay,
  studyDayBounds,
} from "../../../src/lib/calendar";
import { card, NOW, settings } from "./fixtures";
describe("derived study states", () => {
  it("gives all checkpoint states without mistaking proposals for progress", () => {
    expect(checkpointUi({ status: "not_started", proposed: true })).toBe(
      "proposed",
    );
    expect(
      checkpointUi(
        { status: "demonstrated", recheckDue: "2026-10-29" },
        [],
        "2026-10-29",
      ),
    ).toBe("revisit");
    expect(checkpointUi({ status: "demonstrated", needsRevisit: true })).toBe(
      "revisit",
    );
    expect(
      checkpointUi(
        { status: "demonstrated", recheckDue: "2026-10-30" },
        [],
        "2026-10-29",
      ),
    ).toBe("done");
    expect(checkpointUi({ status: "in_progress" })).toBe("now");
    expect(checkpointUi({ status: "not_started" }, ["done", "revisit"])).toBe(
      "next",
    );
    expect(checkpointUi({ status: "not_started" }, ["now"])).toBe("locked");
    expect(
      projectProgress([
        { ui: "done" },
        { ui: "revisit" },
        { ui: "now" },
        { ui: "proposed" },
      ]),
    ).toEqual({ done: 2, total: 3, value: 2 / 3 });
  });
  it("keeps ended sessions ended, and pauses strictly after 30 minutes", () => {
    expect(
      sessionDisplay(
        { state: "ended", lastActivityAt: new Date(NOW).toISOString() },
        NOW,
      ),
    ).toBe("ended");
    expect(
      sessionDisplay(
        {
          state: "open",
          lastActivityAt: new Date(NOW - 1800000).toISOString(),
        },
        NOW,
      ),
    ).toBe("live");
    expect(
      sessionDisplay(
        {
          state: "open",
          lastActivityAt: new Date(NOW - 1800001).toISOString(),
        },
        NOW,
      ),
    ).toBe("paused");
  });
  it("walks the complete retrieval ladder, retires it, and recovers failed evidence", () => {
    const today = "2026-10-29";
    let state = recheck(
      { recheckLevel: 0, recheckDue: null, needsRevisit: true },
      "evidence",
      "demonstrated",
      today,
    );
    expect(state).toEqual({
      recheckLevel: 0,
      recheckDue: "2026-11-01",
      needsRevisit: false,
    });
    for (const [level, due] of [
      [1, "2026-11-08"],
      [2, "2026-11-28"],
      [3, "2027-01-27"],
      [4, null],
    ] as const) {
      state = recheck(state, "recheck", "demonstrated", today);
      expect(state.recheckLevel).toBe(level);
      expect(state.recheckDue).toBe(due);
    }
    expect(recheck(state, "recheck", "partial", today)).toEqual({
      recheckLevel: 0,
      recheckDue: "2026-10-30",
      needsRevisit: true,
    });
  });
  it("requires evidence for mastery and gives misconceptions/lapses precedence", () => {
    expect(conceptStatus([])).toBe("not_started");
    expect(conceptStatus(["done", "locked"])).toBe("in_progress");
    expect(conceptStatus(["done", "done"])).toBe("demonstrated");
    expect(conceptStatus(["done"], true)).toBe("revisit");
    expect(
      conceptStatus(
        ["now"],
        false,
        [
          { rating: 1, reviewedAt: new Date(NOW - 1).toISOString() },
          { rating: 1, reviewedAt: new Date(NOW - 2).toISOString() },
        ],
        NOW,
      ),
    ).toBe("revisit");
    expect(
      conceptStatus(
        ["next"],
        false,
        [{ rating: 1, reviewedAt: new Date(NOW + 1).toISOString() }],
        NOW,
      ),
    ).toBe("not_started");
  });
  it("applies remaining daily limits with an exclusive rollover boundary", () => {
    const { end } = studyDayBounds(NOW, "UTC", 4);
    const pool = [
      card("due"),
      card("tomorrow", { state: { due: new Date(end).toISOString() } }),
      card("new1", { state: { state: 0 } }),
      card("new2", { state: { state: 0 } }),
    ];
    expect(
      dueToday(
        pool,
        { ...settings, newPerDay: 2, reviewsPerDay: 3 },
        { now: NOW, answeredToday: 1, newAnsweredToday: 1 },
      ).map((c) => c.cardId),
    ).toEqual(["due", "new1"]);
    expect(dueTomorrow(pool, settings, NOW)).toBe(1);
    expect(dueToday(pool, settings, { now: NOW, answeredToday: 200 })).toEqual(
      [],
    );
  });
});
describe("civil study clock", () => {
  it("uses the configured IANA zone rather than the device zone", () => {
    const at = Date.parse("2026-10-28T22:29:00Z");
    expect(studyDay(at, "Asia/Kolkata", 4)).toBe("2026-10-28");
    expect(studyDay(at + 60_000, "Asia/Kolkata", 4)).toBe("2026-10-29");
    expect(
      new Date(
        studyDayBounds(at + 60_000, "Asia/Kolkata", 4).start,
      ).toISOString(),
    ).toBe("2026-10-28T22:30:00.000Z");
  });
  it("preserves local rollover across short and long DST days", () => {
    const clock = studyClock(4, "America/New_York");
    const spring = clock.dayIndex(Date.parse("2026-03-07T15:00:00Z"));
    const autumn = clock.dayIndex(Date.parse("2026-10-31T15:00:00Z"));
    expect(clock.dayStart(spring + 1) - clock.dayStart(spring)).toBe(
      23 * 3600000,
    );
    expect(clock.dayStart(autumn + 1) - clock.dayStart(autumn)).toBe(
      25 * 3600000,
    );
    expect(
      studyClock(2, "America/New_York").dayStart(
        Math.floor(Date.parse("2026-03-08") / 86400000),
      ),
    ).toBe(Date.parse("2026-03-08T07:00:00Z"));
  });
});

it("does not spend daily slots on hidden sibling cards", () => {
  const items = [
    card("a", { noteId: "shared" }),
    card("b", { noteId: "shared", ord: 2 }),
    card("c"),
    card("new1", { noteId: "new-note", state: { state: 0 } }),
    card("new2", { noteId: "new-note", ord: 2, state: { state: 0 } }),
    card("new3", { state: { state: 0 } }),
  ];
  expect(
    dueToday(
      items,
      { ...settings, newPerDay: 2, reviewsPerDay: 4 },
      { now: NOW },
    ).map((i) => i.cardId),
  ).toEqual(["a", "c", "new1", "new3"]);
});
