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
  // Reuse civil-day boundaries across different @day fractions and due tokens.
  // The same 90 study days appear in thousands of stress cards/sessions.
  const dayStarts=new Map<number,number>();
  const dayStart=(index:number)=>{
    let value=dayStarts.get(index);
    if(value===undefined){
      value=clock.dayStart(index);
      dayStarts.set(index,value);
    }
    return value;
  };
  // A 30,000-card stress fixture repeats a handful of @due/@day tokens.
  // Cache their resolved civil timestamps instead of doing hundreds of
  // thousands of Intl.formatToParts calls for identical study days.
  const tokenCache=new Map<string,string>();
  const walk = (value: unknown): unknown => {
    // The caller's fixture was already cloned above. Walk that private copy
    // in place instead of allocating a second 30,000-card object graph.
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) value[i] = walk(value[i]);
      return value;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const [key, item] of Object.entries(record)) record[key] = walk(item);
      return record;
    }
    if (typeof value !== "string" || !value.startsWith("@")) return value;
    const cached=tokenCache.get(value);
    if(cached!==undefined)return cached;
    const remember=(resolved:string)=>{
      tokenCache.set(value,resolved);
      return resolved;
    };
    if (value.startsWith("@now:"))
      return remember(new Date(now + Number(value.split(":")[1]) * 60000).toISOString());
    if (value.startsWith("@due:"))
      return remember(new Date(
        dayStart(today + Number(value.split(":")[1])),
      ).toISOString());
    if (value.startsWith("@date:"))
      return remember(new Date((today + Number(value.split(":")[1])) * DAY)
        .toISOString()
        .slice(0, 10));
    if (value.startsWith("@day:")) {
      const [, offset, fraction, minutes] = value.split(":"),
        index = today + Number(offset),
        start = dayStart(index);
      const span =
        index === today
          ? Math.max(0, now - start)
          : dayStart(index + 1) - start;
      return remember(new Date(
        start + Number(fraction) * span + Number(minutes ?? 0) * 60000,
      ).toISOString());
    }
    return value;
  };
  const store = walk(source) as DemoStore;
  // One synthetic, explicitly labelled demo transcription makes the real
  // edit/preview path testable without changing the generated fixture JSON or
  // implying the named source was actually transcribed.
  const sample = store.sources.find(item => item.id === "source-rudin")?.pages.find(item => item.page === 1);
  if (sample && !sample.transcribedBy) {
    sample.transcribedBy = "claude";
    sample.transcribedAt = new Date(now - DAY).toISOString();
    sample.confidence = "check";
  }
  // Stress profiles represent historical reviews as a bounded server-style aggregate.
  // Preserve their authored card states instead of replaying 300k virtual rows.
  if (store.reviews.length === 0) return store;
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
      due: new Date(dayStart(today - 180)).toISOString(),
      stability: 14,
      difficulty: 5,
      lastReview: new Date(dayStart(today - 180)).toISOString(),
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
