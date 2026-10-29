import engine from "./fsrs.js";
import type {
  EngineCard,
  EngineConfig,
  EngineEnvironment,
  ReviewList,
} from "./fsrs.js";
import type { CardState, Settings, Rating } from "../../data/types";
import type { ReviewLogEntry } from "../../data/api";
import { studyClock } from "../calendar";
export type {
  EngineCard,
  EngineConfig,
  EngineEnvironment,
  Evaluation,
  TrainingItem,
  TrainingSequence,
  OptimizeOptions,
  OptimizeResult,
} from "./fsrs.js";
export const {
  DEFAULT_W,
  formatIvl,
  parseSteps,
  optimize,
  buildDataset,
  evaluate,
  retrievability,
} = engine;
export interface ScheduleConfig extends EngineConfig {
  rolloverHour: number;
  timeZone: string;
}
export function scheduleConfig(settings: Settings): ScheduleConfig {
  const learn = parseSteps(settings.learnSteps),
    relearn = parseSteps(settings.relearnSteps);
  if (!learn || !relearn) throw new RangeError("Invalid learning steps");
  const w = [...(settings.fsrsWeights ?? DEFAULT_W)];
  if (w.length !== 21 || w.some((x) => !Number.isFinite(x)))
    throw new RangeError("FSRS needs 21 finite weights");
  return {
    w,
    retention: settings.desiredRetention,
    maxIvl: settings.maxIntervalDays,
    learn,
    relearn,
    fuzz: settings.fuzz,
    loadBalance: settings.loadBalance,
    rolloverHour: settings.rolloverHour,
    timeZone: settings.timeZone,
  };
}
/** With no zone, retain the legacy local-time clock; settings-driven scheduling passes its IANA zone. */
export function makeClock(rolloverHour = 4, timeZone?: string) {
  return timeZone
    ? studyClock(rolloverHour, timeZone)
    : engine.makeClock(rolloverHour);
}
export function toEngineCard(card: CardState): EngineCard {
  return {
    st: card.state,
    due: Date.parse(card.due),
    s: card.stability,
    d: card.difficulty,
    last: card.lastReview ? Date.parse(card.lastReview) : 0,
    step: card.step,
    reps: card.reps,
    lapses: card.lapses,
  };
}
export function fromEngineCard(card: EngineCard): CardState {
  return {
    state: card.st,
    due: new Date(card.due).toISOString(),
    stability: card.s,
    difficulty: card.d,
    lastReview:
      card.reps > 0 || card.last !== 0
        ? new Date(card.last).toISOString()
        : null,
    step: card.step,
    reps: card.reps,
    lapses: card.lapses,
  };
}
export interface PreviewChoice {
  card: CardState;
  ivl: number;
  delay: number;
  label: string;
}
export function preview(
  card: CardState,
  now: number,
  config: ScheduleConfig,
  env: Partial<EngineEnvironment> = {},
): Record<Rating, PreviewChoice> {
  const result = engine.preview(toEngineCard(card), now, config, {
    clock: makeClock(config.rolloverHour, config.timeZone),
    ...env,
  });
  return Object.fromEntries(
    ([1, 2, 3, 4] as const).map((rating) => {
      const choice = result[rating];
      return [
        rating,
        {
          card: fromEngineCard(choice.card),
          ivl: choice.ivl,
          delay: choice.delay,
          label: formatIvl(choice.delay),
        },
      ];
    }),
  ) as Record<Rating, PreviewChoice>;
}
/** Group chronological, non-undone API reviews by card before feeding the unchanged optimizer. */
export function reviewDataset(
  reviews: readonly ReviewLogEntry[],
  clock = makeClock(),
) {
  const byCard = new Map<string, ReviewList>();
  for (const review of [...reviews].sort(
    (a, b) => Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt),
  )) {
    const log = byCard.get(review.cardId) ?? [];
    log.push([Date.parse(review.reviewedAt), review.rating, 0]);
    byCard.set(review.cardId, log);
  }
  return buildDataset([...byCard.values()], clock);
}
