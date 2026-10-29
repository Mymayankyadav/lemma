import type { Settings, CardState } from "../types";
import type { DemoStore } from "./model";
import { DAY, studyClock } from "../../lib/calendar";
import { preview, scheduleConfig } from "../../lib/fsrs";

/** Resolve fixture tokens once per adapter load, on the configured civil study calendar. */
export function hydrateFixture(
  input: DemoStore,
  now: number,
  timeZone: string,
): DemoStore {
  const source = structuredClone(input);
  source.settings.timeZone = timeZone;
  const clock = studyClock(source.settings.rolloverHour, timeZone),
    today = clock.dayIndex(now);
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, walk(item)]),
      );
    if (typeof value !== "string") return value;
    if (value.startsWith("@now:"))
      return new Date(now + Number(value.split(":")[1]) * 60000).toISOString();
    if (value.startsWith("@due:"))
      return new Date(
        clock.dayStart(today + Number(value.split(":")[1])),
      ).toISOString();
    if (value.startsWith("@date:"))
      return new Date((today + Number(value.split(":")[1])) * DAY)
        .toISOString()
        .slice(0, 10);
    if (value.startsWith("@day:")) {
      const [, offset, fraction, minutes] = value.split(":"),
        index = today + Number(offset),
        start = clock.dayStart(index);
      const span =
        index === today
          ? Math.max(0, now - start)
          : clock.dayStart(index + 1) - start;
      return new Date(
        start + Number(fraction) * span + Number(minutes ?? 0) * 60000,
      ).toISOString();
    }
    return value;
  };
  const store = walk(source) as DemoStore;
  // The history window starts with already-mature cards; learn/relearn behavior uses
  // the same engine as real review. Only fixture due study-days are deliberately fixed.
  const config = {
    ...scheduleConfig(store.settings),
    fuzz: false,
    loadBalance: false,
  };
  for (const note of store.notes) {
    const card = note.cards[0],
      fixedDue = card.state.due;
    let state: CardState = {
      state: 2,
      due: new Date(clock.dayStart(today - 180)).toISOString(),
      stability: 14,
      difficulty: 5,
      lastReview: new Date(clock.dayStart(today - 180)).toISOString(),
      step: 0,
      reps: 5,
      lapses: 0,
    };
    for (const review of store.reviews
      .filter((r) => r.cardId === card.id)
      .sort(
        (a, b) =>
          Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt) || a.id - b.id,
      )) {
      review.prev = structuredClone(state);
      review.stateBefore = state.state;
      state = preview(state, Date.parse(review.reviewedAt), config, {
        key: card.id,
      })[review.rating].card;
    }
    card.state = { ...state, due: fixedDue };
  }
  return store;
}
