import type { Confidence, InsightData, Rating } from "../data/types";
import type { InsightDays } from "../data/api";
import { DAY, studyClock } from "./calendar";
export interface InsightOptions {
  now?: number;
  timeZone?: string;
  rolloverHour?: number;
}
export interface Calibration {
  confidence: Exclude<Confidence, null>;
  total: number;
  right: number;
  rate: number | null;
}
export interface ReviewAnswer {
  rating: Rating;
  confidence: Confidence;
  durationMs: number;
  stateBefore?: number;
}
export function calibration(answers: readonly ReviewAnswer[]): Calibration[] {
  return (["sure", "unsure", "guess"] as const).map((confidence) => {
    const rows = answers.filter((r) => r.confidence === confidence),
      right = rows.filter((r) => r.rating > 1).length;
    return {
      confidence,
      total: rows.length,
      right,
      rate: rows.length ? right / rows.length : null,
    };
  });
}
export const recallRate = (
  answers: readonly Pick<ReviewAnswer, "rating">[],
): number | null =>
  answers.length
    ? answers.filter((r) => r.rating > 1).length / answers.length
    : null;
export function median(values: readonly number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  return sorted.length
    ? sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2
    : null;
}
export function calibrationMessage(
  rows: readonly Calibration[],
): string | null {
  const sure = rows.find((r) => r.confidence === "sure"),
    unsure = rows.find((r) => r.confidence === "unsure"),
    guess = rows.find((r) => r.confidence === "guess");
  if (sure?.rate != null && sure.rate < 0.75)
    return "Your sure answers miss often.";
  if (unsure?.rate != null && unsure.rate >= 0.85)
    return "You know more than you think.";
  if (
    sure?.rate != null &&
    guess?.rate != null &&
    sure.rate >= 0.85 &&
    guess.rate <= 0.6
  )
    return "Close to ideal.";
  return null;
}
export function summarizeReviewSession(
  answers: readonly ReviewAnswer[],
  dueTomorrow = 0,
) {
  const confidence = calibration(answers),
    sure = confidence[0];
  return {
    count: answers.length,
    recall: recallRate(answers),
    durationMs: answers.reduce((n, r) => n + Math.max(0, r.durationMs), 0),
    again: answers.filter((r) => r.rating === 1).length,
    lapses: answers.filter((r) => r.rating === 1 && r.stateBefore === 2).length,
    calibration: confidence,
    sureSummary:
      sure.total >= 5
        ? `When sure, right ${sure.right} of ${sure.total}`
        : null,
    dueTomorrow,
  };
}
export function estimatedReviewMinutes(
  count: number,
  reviews: readonly Pick<ReviewAnswer, "durationMs">[] = [],
): number {
  const samples = reviews.filter(
    (r) => r.durationMs > 0 && r.durationMs <= 600_000,
  );
  const average = samples.length
    ? samples.reduce((n, r) => n + r.durationMs, 0) / samples.length
    : 25_000;
  return Math.ceil((Math.max(0, count) * average) / 60_000);
}
export function buildInsights(
  data: InsightData,
  days: InsightDays,
  options: InsightOptions = {},
) {
  const now = options.now ?? Date.now(),
    clock = studyClock(options.rolloverHour ?? 4, options.timeZone ?? "UTC");
  const endIndex = clock.dayIndex(now),
    startIndex = endIndex - days + 1;
  const within = (at: string) => {
    const epoch = Date.parse(at);
    return epoch <= now && clock.dayIndex(epoch) >= startIndex;
  };
  const reviews = data.reviews.filter((r) => within(r.reviewedAt)),
    sessions = data.sessions.filter((s) => within(s.startedAt));
  const date = (index: number) =>
    new Date(index * DAY).toISOString().slice(0, 10);
  const buckets = (size: number) =>
    Array.from({ length: Math.ceil(days / size) }, (_, i) => {
      const start = startIndex + i * size,
        end = Math.min(start + size, endIndex + 1);
      const rows = reviews.filter((r) => {
        const day = clock.dayIndex(Date.parse(r.reviewedAt));
        return day >= start && day < end;
      });
      const counts = [1, 2, 3, 4].map(
        (g) => rows.filter((r) => r.rating === g).length,
      ) as [number, number, number, number];
      return {
        date: date(start),
        endDate: date(end - 1),
        count: rows.length,
        recall: recallRate(rows),
        again: counts[0],
        hard: counts[1],
        good: counts[2],
        easy: counts[3],
      };
    });
  const subjects = new Map<
    string,
    { subject: InsightData["projects"][number]["subject"]; minutes: number }
  >();
  const projectById = new Map(data.projects.map((p) => [p.id, p]));
  for (const session of sessions) {
    const subject = projectById.get(session.projectId)?.subject;
    if (!subject) continue;
    const row = subjects.get(subject.id) ?? { subject, minutes: 0 };
    row.minutes += session.minutes;
    subjects.set(subject.id, row);
  }
  const checkpointWeeks = Array.from({ length: 4 }, (_, i) => {
    const start = endIndex - 27 + i * 7,
      end = start + 7;
    const rows = data.checkpointEvents.filter((e) => {
      const epoch = Date.parse(e.at),
        day = clock.dayIndex(epoch);
      return epoch <= now && day >= start && day < end;
    });
    return {
      label: i === 3 ? "This week" : `W${i + 1}`,
      date: date(start),
      demonstrated: rows.filter((e) => e.kind === "demonstrated").length,
      rechecked: rows.filter(
        (e) => e.kind === "recheck_ok" || e.kind === "recheck_fail",
      ).length,
    };
  });
  const confidence = calibration(reviews);
  return {
    days,
    minutes: sessions.reduce((n, s) => n + s.minutes, 0),
    sessions: sessions.length,
    reviews: reviews.length,
    recall: recallRate(reviews),
    recallBuckets: buckets(days === 7 ? 1 : 7),
    reviewBuckets: buckets(days === 90 ? 7 : 1),
    calibration: confidence,
    calibrationMessage: calibrationMessage(confidence),
    subjects: [...subjects.values()].sort((a, b) => b.minutes - a.minutes),
    checkpointWeeks,
    typicalSession: median(sessions.map((s) => s.minutes)),
    mostRevisited:
      [...data.misconceptions].sort(
        (a, b) => b.times - a.times || a.label.localeCompare(b.label),
      )[0] ?? null,
  };
}
