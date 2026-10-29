import type { CardState, ReviewItem, Settings } from "../../../src/data/types";
export const NOW = Date.UTC(2026, 9, 29, 12);
export const settings: Settings = {
  desiredRetention: 0.9,
  newPerDay: 20,
  reviewsPerDay: 200,
  learnSteps: "1m 10m",
  relearnSteps: "10m",
  rolloverHour: 4,
  maxIntervalDays: 36500,
  fuzz: false,
  loadBalance: false,
  learnAheadMinutes: 20,
  fsrsWeights: null,
  fsrsTunedAt: null,
  macros: "",
  defaultStyle: "socratic",
  tutorRules: null,
  mixDecks: true,
  preferredChat: "claude",
  connectorUrl: "https://example.invalid/mcp/demo",
  connectorLastSeenAt: null,
  connectorLastClient: null,
  timeZone: "UTC",
};
export function card(
  id: string,
  patch: Partial<Omit<ReviewItem, "state">> & {
    state?: Partial<CardState>;
  } = {},
): ReviewItem {
  return {
    cardId: id,
    noteId: id,
    noteNo: 1,
    ord: 1,
    type: "basic",
    kind: "theorem",
    front: "Question",
    back: "Answer",
    projectSlug: "analysis",
    glyph: "∫",
    checkpointCode: "CP1",
    checkpointTitle: "Compactness",
    sessionNumber: 7,
    sourceShort: "rudin",
    pageLabel: "40",
    ...patch,
    state: {
      state: 2,
      due: new Date(NOW - 60_000).toISOString(),
      stability: 5,
      difficulty: 5,
      lastReview: new Date(NOW - 86400000).toISOString(),
      step: 0,
      reps: 1,
      lapses: 0,
      ...patch.state,
    },
  };
}
