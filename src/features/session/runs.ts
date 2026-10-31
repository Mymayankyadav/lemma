import type { EventKind, SessionEvent } from "../../data/types";

/** A run preserves event indices so expanded items retain their original event numbers. */
export function reasoningRuns(events: readonly SessionEvent[]) {
 const runs: { kind: EventKind; start: number; events: SessionEvent[] }[] = [];
 for (let i = 0; i < events.length; i++) {
  const event = events[i], last = runs[runs.length - 1];
  if (last?.kind === event.kind && !["attempt", "evidence", "recheck"].includes(event.kind)) last.events.push(event);
  else runs.push({ kind: event.kind, start: i, events: [event] });
 }
 return runs;
}
