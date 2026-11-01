import type { Settings, CardState } from "../types";
import type { DemoStore } from "./model";
import { DAY, studyClock } from "../../lib/calendar";
import { preview, scheduleConfig } from "../../lib/fsrs";

/** Resolve fixture tokens once per adapter load, on the configured civil study calendar. */
export function hydrateFixture(
  input: DemoStore,
  now: number,
  timeZone: string,
  { takeOwnership = false }: { takeOwnership?: boolean } = {},
): DemoStore {
  // Generated stress stores are private to one adapter. Avoid cloning the
  // entire 30,000-card graph again on the 4x-CPU cold-start path. Callers
  // supplying reusable fixtures still receive the original copy semantics.
  const source = takeOwnership ? input : structuredClone(input);
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
  // The generated S/X note records contain no date tokens except card due
  // and lastReview. Keep their full real 5k/30k content, but avoid recursively
  // visiting four nested objects per note under 4x CPU. This is limited to
  // freshly generated private stress fixtures; normal fixtures still receive
  // the complete recursive walk and immutable input semantics.
  const generated = takeOwnership && source.stressReviewCount !== undefined;
  const stressNotes = generated && source.reviews.length === 0 ? source.notes : null;
  // Generated checkpoints and sources are complete records, but almost all
  // fields are stable text or empty arrays. A generic Object.entries walk of
  // 6,000 checkpoints and 6,000 sources dominates extreme cold hydration.
  // Temporarily exclude these private arrays, then resolve only their date
  // tokens; keep the normal full walk for seed/authored records.
  const stressCheckpoints = generated ? source.checkpoints : null;
  const stressSources = generated ? source.sources : null;
  if (stressNotes) source.notes = [];
  if (stressCheckpoints) source.checkpoints = [];
  if (stressSources) source.sources = [];
  const store = walk(source) as DemoStore;
  if (stressCheckpoints) {
    store.checkpoints = stressCheckpoints;
    for (const cp of stressCheckpoints) {
      if (!cp.id.endsWith('-cp-' + cp.code.slice(2))) {
        walk(cp);
        continue;
      }
      if (cp.dueOn !== undefined && cp.dueOn !== null)
        cp.dueOn = walk(cp.dueOn) as string;
      if (cp.demonstratedAt !== undefined && cp.demonstratedAt !== null)
        cp.demonstratedAt = walk(cp.demonstratedAt) as string;
      if (cp.recheckDue !== null)
        cp.recheckDue = walk(cp.recheckDue) as string;
    }
  }
  if (stressSources) {
    store.sources = stressSources;
    for (const item of stressSources) {
      if (!item.id.startsWith('stress-source-')) {
        walk(item);
        continue;
      }
      item.createdAt = walk(item.createdAt) as string;
      if (item.addedAt !== undefined)
        item.addedAt = walk(item.addedAt) as string;
      if (item.planCheckedAt !== undefined && item.planCheckedAt !== null)
        item.planCheckedAt = walk(item.planCheckedAt) as string;
    }
  }
  if (stressNotes) {
    store.notes = stressNotes;
    for (const note of stressNotes) {
      for (const card of note.cards) {
        card.state.due = walk(card.state.due) as string;
        if (card.state.lastReview !== null)
          card.state.lastReview = walk(card.state.lastReview) as string;
      }
    }
  }
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
