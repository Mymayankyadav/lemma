import type {
  AtlasGraph,
  CardState,
  CheckpointUi,
  Outcome,
  ReviewItem,
  Settings,
  SessionSummary,
} from "../data/types";
import { addDays, studyDay, studyDayBounds } from "./calendar";
export { studyDay, studyDayBounds } from "./calendar";
export interface CheckpointInput {
  status: "not_started" | "in_progress" | "demonstrated";
  needsRevisit?: boolean;
  recheckDue?: string | null;
  proposed?: boolean;
}
export function checkpointUi(
  checkpoint: CheckpointInput,
  prereqs: readonly CheckpointUi[] = [],
  today = studyDay(Date.now()),
): CheckpointUi {
  if (checkpoint.proposed) return "proposed";
  if (checkpoint.status === "demonstrated")
    return checkpoint.needsRevisit ||
      (checkpoint.recheckDue != null && checkpoint.recheckDue <= today)
      ? "revisit"
      : "done";
  if (checkpoint.status === "in_progress") return "now";
  return prereqs.every((ui) => ui === "done" || ui === "revisit")
    ? "next"
    : "locked";
}
export function projectProgress(checkpoints: readonly { ui: CheckpointUi }[]) {
  const approved = checkpoints.filter((cp) => cp.ui !== "proposed");
  const done = approved.filter(
    (cp) => cp.ui === "done" || cp.ui === "revisit",
  ).length;
  return {
    done,
    total: approved.length,
    value: approved.length ? done / approved.length : 0,
  };
}
export function sessionDisplay(
  session: { state: "open" | "ended"; lastActivityAt: string },
  now = Date.now(),
): SessionSummary["display"] {
  return session.state === "ended"
    ? "ended"
    : now - Date.parse(session.lastActivityAt) > 30 * 60_000
      ? "paused"
      : "live";
}
export interface RecheckState {
  recheckLevel: number;
  recheckDue: string | null;
  needsRevisit: boolean;
}
export function recheck(
  state: RecheckState,
  kind: "evidence" | "recheck",
  outcome: Outcome,
  today = studyDay(Date.now()),
): RecheckState {
  if (kind === "evidence" && outcome === "demonstrated")
    return {
      recheckLevel: 0,
      recheckDue: addDays(today, 3),
      needsRevisit: false,
    };
  if (kind !== "recheck" || outcome === null) return { ...state };
  if (outcome !== "demonstrated")
    return {
      recheckLevel: 0,
      recheckDue: addDays(today, 1),
      needsRevisit: true,
    };
  const level = Math.min(4, state.recheckLevel + 1),
    days = [3, 10, 30, 90][level];
  return {
    ...state,
    recheckLevel: level,
    recheckDue: days === undefined ? null : addDays(today, days),
  };
}
export function conceptStatus(
  checkpoints: readonly CheckpointUi[],
  unresolvedMisconception = false,
  againReviews: readonly { reviewedAt: string; rating: number }[] = [],
  now = Date.now(),
): AtlasGraph["concepts"][number]["status"] {
  const repeatedLapse =
    againReviews.filter(
      (r) =>
        r.rating === 1 &&
        Date.parse(r.reviewedAt) >= now - 14 * 86_400_000 &&
        Date.parse(r.reviewedAt) <= now,
    ).length >= 2;
  if (
    unresolvedMisconception ||
    repeatedLapse ||
    checkpoints.includes("revisit")
  )
    return "revisit";
  if (checkpoints.length > 0 && checkpoints.every((ui) => ui === "done"))
    return "demonstrated";
  return checkpoints.some((ui) => ui === "now" || ui === "done")
    ? "in_progress"
    : "not_started";
}
export type DailySettings = Pick<
  Settings,
  "newPerDay" | "reviewsPerDay" | "rolloverHour" | "timeZone"
>;
export interface DailyCounts {
  now?: number;
  answeredToday?: number;
  newAnsweredToday?: number;
}
/** Select the due set globally before callers apply session/deck/concept filters. End is exclusive. */
export function dueToday<T extends { state: CardState }>(
  items: readonly T[],
  settings: DailySettings,
  counts: DailyCounts = {},
): T[] {
  const { end } = studyDayBounds(
    counts.now ?? Date.now(),
    settings.timeZone,
    settings.rolloverHour,
  );
  const reviewLeft = Math.max(
    0,
    settings.reviewsPerDay - (counts.answeredToday ?? 0),
  );
  const newLeft = Math.max(
    0,
    settings.newPerDay - (counts.newAnsweredToday ?? 0),
  );
  const now = counts.now ?? Date.now();
  const learningDue = (item: T) =>
    (item.state.state === 1 || item.state.state === 3) &&
    Date.parse(item.state.due) <= now;
  const due = items
    .filter(
      (item) => item.state.state !== 0 && Date.parse(item.state.due) < end,
    )
    .sort(
      (a, b) =>
        Number(learningDue(b)) - Number(learningDue(a)) ||
        Date.parse(a.state.due) - Date.parse(b.state.due),
    );
  // When note IDs are available, keep due badges and the sibling-safe runner aligned.
  const seenNotes = new Set<string>();
  const uniqueNote = (item: T) => {
    const noteId = (item as T & { noteId?: string }).noteId;
    if (!noteId) return true;
    if (seenNotes.has(noteId)) return false;
    seenNotes.add(noteId);
    return true;
  };
  const selectedDue = due.filter(uniqueNote);
  const fresh = items
    .filter((item) => item.state.state === 0)
    .filter(uniqueNote)
    .slice(0, newLeft);
  return [...selectedDue, ...fresh].slice(0, reviewLeft);
}
export function dueTomorrow(
  items: readonly Pick<ReviewItem, "state">[],
  settings: Pick<Settings, "rolloverHour" | "timeZone">,
  now = Date.now(),
): number {
  const { end } = studyDayBounds(now, settings.timeZone, settings.rolloverHour);
  const after = studyDayBounds(
    end,
    settings.timeZone,
    settings.rolloverHour,
  ).end;
  return items.filter(
    ({ state }) =>
      state.state !== 0 &&
      Date.parse(state.due) >= end &&
      Date.parse(state.due) < after,
  ).length;
}
