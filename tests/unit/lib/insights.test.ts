import { it, expect } from "vitest";
import type { InsightData } from "../../../src/data/types";
import {
  buildInsights,
  median,
  summarizeReviewSession,
} from "../../../src/lib/insights";
import { NOW } from "./fixtures";
it("computes recall, stacked buckets, calibration, subject time and medians from raw rows", () => {
  const day = 86400000;
  const data: InsightData = {
    reviews: [
      {
        reviewedAt: new Date(NOW).toISOString(),
        rating: 3,
        stateBefore: 2,
        confidence: "sure",
        durationMs: 1000,
        projectId: "p",
      },
      {
        reviewedAt: new Date(NOW - day).toISOString(),
        rating: 1,
        stateBefore: 2,
        confidence: "sure",
        durationMs: 2000,
        projectId: "p",
      },
      {
        reviewedAt: new Date(NOW - 10 * day).toISOString(),
        rating: 4,
        stateBefore: 2,
        confidence: "guess",
        durationMs: 2000,
        projectId: "p",
      },
    ],
    sessions: [
      {
        startedAt: new Date(NOW).toISOString(),
        minutes: 20,
        projectId: "p",
        goalMet: "yes",
      },
      {
        startedAt: new Date(NOW - day).toISOString(),
        minutes: 40,
        projectId: "p",
        goalMet: "partial",
      },
      {
        startedAt: new Date(NOW - 10 * day).toISOString(),
        minutes: 60,
        projectId: "p",
        goalMet: "yes",
      },
    ],
    checkpointEvents: [
      {
        at: new Date(NOW).toISOString(),
        kind: "demonstrated",
        checkpointCode: "CP1",
        projectId: "p",
      },
      {
        at: new Date(NOW - day).toISOString(),
        kind: "recheck_fail",
        checkpointCode: "CP1",
        projectId: "p",
      },
    ],
    projects: [
      {
        id: "p",
        title: "Analysis",
        subject: {
          id: "s",
          name: "Analysis",
          glyph: "∫",
          hue: "amber",
          position: 0,
        },
      },
    ],
    misconceptions: [{ label: "Cover", times: 2, conceptName: "Open cover" }],
  };
  const week = buildInsights(data, 7, { now: NOW });
  expect(week).toMatchObject({
    minutes: 60,
    sessions: 2,
    reviews: 2,
    recall: 0.5,
    typicalSession: 30,
  });
  expect(week.reviewBuckets).toHaveLength(7);
  expect(week.reviewBuckets.reduce((n, b) => n + b.again, 0)).toBe(1);
  expect(week.reviewBuckets.reduce((n, b) => n + b.good, 0)).toBe(1);
  expect(week.calibration[0]).toMatchObject({ total: 2, right: 1, rate: 0.5 });
  expect(week.subjects[0].minutes).toBe(60);
  expect(week.checkpointWeeks[3]).toMatchObject({
    demonstrated: 1,
    rechecked: 1,
  });
  expect(buildInsights(data, 30, { now: NOW })).toMatchObject({
    minutes: 120,
    sessions: 3,
    reviews: 3,
    recall: 2 / 3,
    typicalSession: 40,
  });
  expect(buildInsights(data, 90, { now: NOW }).reviewBuckets).toHaveLength(13);
  expect(median([4, 1, 3, 2])).toBe(2.5);
});
it("does not invent recall or calibration from empty history and reports review-session stats", () => {
  const data: InsightData = {
    reviews: [],
    sessions: [],
    checkpointEvents: [],
    projects: [],
    misconceptions: [],
  };
  expect(buildInsights(data, 7, { now: NOW })).toMatchObject({
    recall: null,
    typicalSession: null,
    calibrationMessage: null,
  });
  const answers = Array.from({ length: 5 }, (_, i) => ({
    rating: i === 0 ? (1 as const) : (3 as const),
    confidence: "sure" as const,
    durationMs: 1000,
    stateBefore: 2,
  }));
  expect(summarizeReviewSession(answers, 18)).toMatchObject({
    count: 5,
    recall: 0.8,
    durationMs: 5000,
    again: 1,
    lapses: 1,
    sureSummary: "When sure, right 4 of 5",
    dueTomorrow: 18,
  });
});
