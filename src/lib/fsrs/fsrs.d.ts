import type { Rating, SchedulingState } from "../../data/types";
import type { StudyClock } from "../calendar";
export interface EngineCard {
  st: SchedulingState;
  due: number;
  s: number;
  d: number;
  last: number;
  step: number;
  reps: number;
  lapses: number;
}
export interface EngineConfig {
  w: number[];
  retention: number;
  maxIvl: number;
  learn: number[];
  relearn: number[];
  fuzz: boolean;
  loadBalance: boolean;
}
export interface EngineEnvironment {
  clock: StudyClock;
  key?: string;
  loadAt?: (dayIndex: number) => number;
}
export interface Memory {
  s: number;
  d: number;
}
export interface TrainingItem {
  t: number;
  g: Rating;
  ts: number;
  wt: number;
}
export type TrainingSequence = TrainingItem[];
export type ReviewList = [timestamp: number, rating: Rating, kind: number][];
export interface Evaluation {
  n: number;
  logLoss: number;
  rmse: number;
  bins: { lo: number; n: number; pred: number | null; actual: number | null }[];
}
export interface OptimizeOptions {
  start?: number[];
  numRelearnSteps?: number;
  epochs?: number;
  batchSize?: number;
  lr?: number;
  gamma?: number;
  onProgress?: (fraction: number) => void;
  yieldEvery?: number;
  seed?: number;
}
export interface OptimizeResult {
  w: number[];
  items: number;
  skipped?: boolean;
  pretrainOnly?: boolean;
  pretrain?: { s0: number[]; counts: number[] };
}
declare const engine: {
  DEFAULT_W: readonly number[];
  DAY: number;
  preview(
    card: EngineCard,
    now: number,
    config: EngineConfig,
    env: EngineEnvironment,
  ): Record<
    Rating,
    { g: Rating; card: EngineCard; ivl: number; delay: number }
  >;
  formatIvl(ms: number): string;
  makeClock(rolloverHour?: number): StudyClock;
  parseSteps(text: string): number[] | null;
  optimize(
    seqs: TrainingSequence[],
    options?: OptimizeOptions,
  ): Promise<OptimizeResult>;
  buildDataset(
    cards: ReviewList[],
    clock: StudyClock,
  ): { seqs: TrainingSequence[]; items: number };
  evaluate(w: readonly number[], seqs: TrainingSequence[]): Evaluation;
  retrievability(w: readonly number[], t: number, stability: number): number;
  step(
    w: readonly number[],
    memory: Memory | null,
    days: number,
    rating: Rating,
  ): Memory;
  intervalFor(
    w: readonly number[],
    stability: number,
    retention: number,
  ): number;
  rng(seed: number): () => number;
  retentionSweep(
    w: readonly number[],
    options: {
      from?: number;
      to?: number;
      stepSize?: number;
      days?: number;
      newPerDay?: number;
      deckSize?: number;
    },
  ): {
    retention: number;
    reviewsPerDay: number;
    memorized: number;
    learned: number;
  }[];
};
export default engine;
